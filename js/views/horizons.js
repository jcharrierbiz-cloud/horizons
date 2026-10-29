/* Vue Horizons.
   • Ensemble : une colonne par horizon (jour, semaine, mois, trimestre, année,
     décennie, vie), chacune sur sa période en cours ; ‹ › déplace une colonne
     dans le temps, le titre la ramène à maintenant. Une colonne se replie.
   • Bande : un seul horizon, ses périodes à la suite, la période en cours calée
     à gauche ; « Plus tôt » et « Plus tard » prolongent la bande. */

import { esc, plural } from "../util.js";
import { HZ, hzDef, hzIdx, periodOf, shiftPeriod, periodDelta, periodLabel, today, where } from "../dates.js";
import { S, settings, commit, ui, saveUI, scheduleRender } from "../store.js";
import { buildIndex, colItems, colKey, moveTo, carryOver } from "../items.js";
import { itemRow, addSlot } from "../render.js";
import { icon, toast } from "../ui.js";
import { snapshot, restore } from "../store.js";

const win = {};          // fenêtre de la bande par horizon : [début, fin] relatifs à maintenant
let scrollNow = true;    // caler la bande sur maintenant au prochain rendu

export function requestScrollNow() { scrollNow = true; }

function visible(items) { return ui.hideDone ? items.filter((x) => !x.done) : items; }

function lateCount(ix, h) {
  const now = periodOf(h, today());
  let n = 0;
  ix.cols.forEach((list, ck) => {
    if (!ck.startsWith(h + "|")) return;
    if (ck.slice(h.length + 1) >= now) return;
    n += list.filter((x) => !x.done && !x.repeat).length;
  });
  return n;
}

function column(ix, h, k, opts) {
  const L = periodLabel(h, k), n = periodDelta(h, k);
  const items = colItems(ix, h, k);
  const done = items.filter((x) => x.done).length;
  const late = n === 0 && !settings().carry ? lateCount(ix, h) : 0;
  const head = opts.all
    ? '<div class="col-h"><div class="col-eyebrow">' + esc(hzDef(h).one) + (L.tag && h !== "life" ? ' · <span class="now-tag">' + esc(L.tag) + "</span>" : "") + "</div>"
      + '<div class="col-row">'
      + (h !== "life" ? '<button class="icon-btn sm" data-act="hzprev" data-h="' + h + '" aria-label="Période précédente">' + icon("left") + "</button>" : "")
      + '<button class="col-title" data-act="hznow" data-h="' + h + '" title="Revenir à maintenant">' + esc(L.title) + "</button>"
      + (h !== "life" ? '<button class="icon-btn sm" data-act="hznext" data-h="' + h + '" aria-label="Période suivante">' + icon("right") + "</button>" : "")
      + '<span class="col-count num">' + (items.length ? done + "/" + items.length : "") + "</span>"
      + '<button class="icon-btn sm" data-act="hzfold" data-h="' + h + '" aria-label="Replier la colonne">' + icon("collapse") + "</button>"
      + '<button class="icon-btn sm" data-act="hzzoom" data-h="' + h + '" aria-label="Dérouler cet horizon">' + icon("zoom") + "</button>"
      + "</div>" + (L.sub ? '<div class="col-sub">' + esc(L.sub) + "</div>" : "") + "</div>"
    : '<div class="col-h"><div class="col-eyebrow"><span class="now-tag">' + esc(L.tag || " ") + "</span></div>"
      + '<div class="col-row"><span class="col-title static">' + esc(L.title) + "</span>"
      + '<span class="col-count num">' + (items.length ? done + "/" + items.length : "") + "</span></div>"
      + (L.sub ? '<div class="col-sub">' + esc(L.sub) + "</div>" : "") + "</div>";
  return '<section class="col' + (n === 0 ? " now" : n < 0 ? " past" : "") + '" data-zone="' + esc("col:" + colKey(h, k)) + '" data-col="' + esc(colKey(h, k)) + '">'
    + head
    + '<div class="col-b">'
    + (late ? '<button class="late-btn" data-act="pull" data-h="' + h + '">' + plural(late, "élément") + " en retard · ramener ici</button>" : "")
    + '<div class="dz">' + visible(items).map((it) => itemRow(ix, it, { dur: true })).join("")
    + addSlot("col:" + colKey(h, k), "Ajouter") + "</div></div></section>";
}

function folded(ix, h, k) {
  const items = colItems(ix, h, k);
  return '<section class="col folded" data-zone="' + esc("col:" + colKey(h, k)) + '">'
    + '<button class="fold-btn" data-act="hzunfold" data-h="' + h + '" aria-label="Déplier ' + esc(hzDef(h).one) + '">'
    + icon("expand") + '<span class="vert">' + esc(hzDef(h).one) + " · " + esc(where(h, k)) + (items.length ? " · " + items.length : "") + "</span></button></section>";
}

export function render(main) {
  const st = ui, ix = buildIndex(), mode = st.hzMode;
  const t = today();
  let html = '<header class="view-h"><div><h1>Horizons</h1><p class="view-sub">Du jour à la vie : chaque horizon a sa colonne. Rattache le petit au grand, glisse ce qui bouge.</p></div>'
    + '<div class="view-tools">'
    + '<div class="seg scroll" role="group" aria-label="Affichage">'
    + '<button data-act="hzmode" data-m="all" aria-pressed="' + (mode === "all") + '">Ensemble</button>'
    + HZ.map((x) => '<button data-act="hzmode" data-m="' + x.id + '" aria-pressed="' + (mode === x.id) + '">' + x.many + "</button>").join("")
    + "</div>"
    + '<button class="btn ghost sm" data-act="hztoday">' + icon("calendar") + "Aujourd'hui</button>"
    + '<button class="btn ghost sm" data-act="hidedone" aria-pressed="' + st.hideDone + '">' + (st.hideDone ? "Afficher les faits" : "Masquer les faits") + "</button>"
    + "</div></header>";

  if (mode === "all") {
    html += '<div class="board-x" data-autoscroll data-scroll-key="hz-all">';
    HZ.forEach((x) => {
      const k = shiftPeriod(x.id, periodOf(x.id, t), st.hzOffsets[x.id] || 0);
      html += st.hzCollapsed[x.id] ? folded(ix, x.id, k) : column(ix, x.id, k, { all: true });
    });
    html += "</div>";
    main.innerHTML = html;
    if (scrollNow) {   // « Aujourd'hui » ramène aussi la bande sur la colonne du jour
      scrollNow = false;
      main.querySelector(".board-x").scrollLeft = 0;
      main.dataset.skipRestore = "hz-all";
    }
    return;
  }

  const h = mode, d = hzDef(h), now = periodOf(h, t);
  if (!win[h]) win[h] = d.win.slice();
  html += '<div class="board-x strip' + (h === "life" ? " single" : "") + '" data-autoscroll data-scroll-key="hz-' + h + '">';
  if (h !== "life") html += '<button class="edge" data-act="earlier">‹ Plus tôt</button>';
  for (let i = win[h][0]; i <= win[h][1]; i++) html += column(ix, h, shiftPeriod(h, now, i), { all: false });
  if (h !== "life") html += '<button class="edge" data-act="later">Plus tard ›</button>';
  html += "</div>";
  main.innerHTML = html;
  if (scrollNow) {
    scrollNow = false;
    const strip = main.querySelector(".strip"), c = strip && strip.querySelector('[data-col="' + colKey(h, now) + '"]');
    if (c) { strip.scrollLeft = strip.scrollLeft + c.getBoundingClientRect().left - strip.getBoundingClientRect().left; main.dataset.skipRestore = "hz-" + h; }
  }
}

export function onAct(act, b, main) {
  const st = ui;
  const h = b.dataset.h;
  switch (act) {
    case "hzmode": st.hzMode = b.dataset.m; scrollNow = true; saveUI(); return true;
    case "hzprev": case "hznext":
      st.hzOffsets[h] = (st.hzOffsets[h] || 0) + (act === "hzprev" ? -1 : 1); saveUI(); return true;
    case "hznow": st.hzOffsets[h] = 0; saveUI(); return true;
    case "hzfold": st.hzCollapsed[h] = true; saveUI(); return true;
    case "hzunfold": delete st.hzCollapsed[h]; saveUI(); return true;
    case "hzzoom": st.hzMode = h; scrollNow = true; saveUI(); return true;
    case "hztoday": st.hzOffsets = {}; scrollNow = true; saveUI(); return true;
    case "hidedone": st.hideDone = !st.hideDone; saveUI(); return true;
    case "earlier": case "later": {
      const m = st.hzMode, d = hzDef(m), strip = main.querySelector(".strip");
      if (!win[m]) win[m] = d.win.slice();
      if (act === "later") { win[m][1] += d.step; scheduleRender(); return true; }
      const first = strip.querySelector(".col"), ck = first && first.dataset.col, before = first ? first.getBoundingClientRect().left : 0;
      win[m][0] -= d.step;
      main.dataset.afterRender = JSON.stringify({ ck, before });
      scheduleRender();
      return true;
    }
    case "pull": {
      const ix = buildIndex(), now = periodOf(h, today()), ids = [];
      ix.cols.forEach((list, ck) => {
        if (!ck.startsWith(h + "|") || ck.slice(h.length + 1) >= now) return;
        list.forEach((x) => { if (!x.done && !x.repeat) ids.push(x.id); });
      });
      const snap = snapshot(ids);
      ids.forEach((id) => moveTo(id, h, now, null));
      commit();
      toast(plural(ids.length, "élément") + " ramené" + (ids.length > 1 ? "s" : "") + " · " + where(h, now), () => restore(snap));
      return true;
    }
  }
  return false;
}

/* Après un « Plus tôt » : la vue ne saute pas, puis recule pour montrer ce qui est apparu. */
export function afterRender(main) {
  const raw = main.dataset.afterRender; if (!raw) return;
  delete main.dataset.afterRender;
  const { ck, before } = JSON.parse(raw);
  const strip = main.querySelector(".strip"), again = ck && strip && strip.querySelector('[data-col="' + ck + '"]');
  if (!again) return;
  strip.scrollLeft += again.getBoundingClientRect().left - before;
  const w = again.getBoundingClientRect().width + 12;
  try { strip.scrollBy({ left: -Math.max(w, strip.clientWidth - w), behavior: "smooth" }); } catch (e) { strip.scrollLeft -= w; }
}

export function stepColumns(dir) {
  const bx = document.querySelector("#main .board-x"); if (!bx) return;
  const c = bx.querySelector(".col:not(.folded)") || bx.querySelector(".col");
  const w = c ? c.getBoundingClientRect().width + 12 : 280;
  try { bx.scrollBy({ left: dir * w, behavior: "smooth" }); } catch (e) { bx.scrollLeft += dir * w; }
}

export { carryOver, hzIdx };
