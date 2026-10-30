/* Vue Horizons.
   • Ensemble : une colonne par horizon (aujourd'hui, semaine, mois, année… au
     choix), toutes calées sur un même jour de référence ; la pastille
     « ‹ Aujourd'hui › » fait avancer ou reculer ce jour, et toutes les colonnes
     suivent. La colonne du jour porte sa grille horaire.
   • Bande : un seul horizon, ses périodes à la suite (Jours, Semaines…), la
     période en cours calée à gauche ; « Plus tôt » et « Plus tard » prolongent.
   Sur téléphone : une période par écran, et les horizons en onglets en bas. */

import { esc, plural, cap1 } from "../util.js";
import { HZ, hzDef, periodOf, shiftPeriod, periodDelta, periodLabel, today, where, dNum, addDays, fmtD, toMin } from "../dates.js";
import { settings, commit, ui, saveUI, scheduleRender, snapshot, restore } from "../store.js";
import { buildIndex, colItems, colKey, moveTo } from "../items.js";
import { itemRow, addSlot, timeline, dayRange } from "../render.js";
import { icon, toast, menu } from "../ui.js";

const win = {};          // fenêtre de la bande par horizon : [début, fin] relatifs à maintenant
let scrollNow = true;    // caler la bande sur maintenant au prochain rendu
const TABS = ["day", "week", "month", "year", "life"];
const DEFAULT_COLS = ["day", "week", "month", "year"];

export function requestScrollNow() { scrollNow = true; }
export const narrow = () => window.matchMedia("(max-width: 900px)").matches;
/* Jour de référence de la vue Ensemble. */
export const focusDate = () => (ui.focus && dNum(ui.focus) ? ui.focus : today());
export const visibleCols = () => {
  const c = Array.isArray(ui.hzCols) && ui.hzCols.length ? ui.hzCols : DEFAULT_COLS;
  return HZ.map((x) => x.id).filter((h) => c.includes(h));
};
/* Le mode réellement affiché : « Ensemble » n'existe pas sur téléphone. */
export const shownMode = () => (narrow() && ui.hzMode === "all" ? "day" : ui.hzMode);

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

/* Titres d'une colonne. Ensemble : le nom de l'horizon, la période en sous-titre
   (« Semaine » / « 26 oct. – 1 nov. »). Bande : la période elle-même. */
function titles(h, k, all) {
  const L = periodLabel(h, k), yNow = today().slice(0, 4);
  if (h === "day") {
    const wd = cap1(fmtD(k, { weekday: "long" }));
    const date = fmtD(k, { day: "numeric", month: "long" }) + (k.slice(0, 4) !== yNow ? " " + k.slice(0, 4) : "");
    if (all) {
      const n = new Date();
      const clock = k === today() ? String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0") : "";
      return { title: L.tag || wd, sub: (L.tag ? wd + " " : "") + date, meta: clock };
    }
    return { title: L.tag || wd, sub: (L.tag ? wd + " " : "") + date };
  }
  if (all) {
    const sub = h === "week" ? L.sub + " · S" + parseInt(k.slice(6), 10)
      : h === "month" ? cap1(fmtD(k + "-01", { month: "long" })) + (k.slice(0, 4) !== yNow ? " " + k.slice(0, 4) : "")
      : h === "quarter" ? L.title + " · " + L.sub
      : h === "year" ? k
      : h === "decade" ? L.sub
      : "Sans échéance";
    return { title: hzDef(h).one, sub };
  }
  if (h === "week") return { title: L.title, sub: L.sub, tag: L.tag };
  if (h === "month") return { title: cap1(fmtD(k + "-01", { month: "long" })), sub: k.slice(0, 4), tag: L.tag };
  if (h === "quarter") return { title: "T" + k.slice(6), sub: k.slice(0, 4) + " · " + L.sub, tag: L.tag };
  if (h === "year") return { title: k, sub: L.tag || "", tag: "" };
  if (h === "decade") return { title: L.title, sub: L.sub, tag: L.tag };
  return { title: "Vie", sub: "Ce qui compte, au-delà des dates" };
}

function column(ix, h, k, all) {
  const T = titles(h, k, all), n = periodDelta(h, k);
  const items = colItems(ix, h, k);
  const done = items.filter((x) => x.done).length;
  const late = n === 0 && !settings().carry ? lateCount(ix, h) : 0;
  const isDay = h === "day";
  const timed = isDay ? items.filter((x) => x.time && toMin(x.time) != null) : [];
  const loose = isDay ? items.filter((x) => !(x.time && toMin(x.time) != null)) : items;
  const range = isDay ? dayRange(timed) : null;
  /* Dans une colonne de jour, la liste reçoit ce qui n'a pas d'heure ; la grille, ce qui en a une. */
  const zone = isDay ? "unsched:" + k : "col:" + colKey(h, k);
  return '<section class="col' + (isDay ? " day" : "") + (n === 0 ? " now" : n < 0 ? " past" : "") + '" data-zone="' + esc(zone) + '" data-col="' + esc(colKey(h, k)) + '">'
    + '<header class="col-h"><div class="col-tt"><h2 class="col-title">' + esc(T.title) + "</h2>"
    + '<span class="col-count num">' + (items.length ? done + "/" + items.length : "") + "</span>"
    + (T.meta ? '<div class="col-meta">' + T.meta + "</div>" : "") + "</div>"
    + (T.tag ? '<div class="col-tag">' + esc(T.tag) + "</div>" : "")
    + (T.sub ? '<div class="col-sub">' + esc(T.sub) + "</div>" : "") + "</header>"
    + '<div class="col-b">'
    + (late ? '<button class="late-btn" data-act="pull" data-h="' + h + '">' + plural(late, "élément") + " en retard · ramener ici</button>" : "")
    + '<div class="dz">' + visible(loose).map((it) => itemRow(ix, it, { dur: true })).join("") + addSlot("col:" + colKey(h, k)) + "</div>"
    + (isDay ? timeline(ix, k, visible(timed), { ppm: 0.8, from: range.from, to: range.to, mini: true }) : "")
    + "</div></section>";
}

function navPill(all) {
  return '<div class="navpill" role="group" aria-label="Se déplacer dans le temps">'
    + '<button class="icon-btn" data-act="fprev" aria-label="' + (all ? "Jour précédent" : "Période précédente") + '">' + icon("left") + "</button>"
    + '<button class="np-today" data-act="ftoday">Aujourd\'hui</button>'
    + '<button class="icon-btn" data-act="fnext" aria-label="' + (all ? "Jour suivant" : "Période suivante") + '">' + icon("right") + "</button>"
    + '<button class="icon-btn" data-act="hzmenu" aria-label="Affichage">' + icon("more") + "</button></div>";
}

function tabs(mode) {
  return '<nav class="tabs-b" aria-label="Horizons">' + TABS.map((h) => '<button data-act="hzmode" data-m="' + h + '" aria-pressed="' + (mode === h) + '">'
    + (h === "life" ? "Vie" : hzDef(h).many) + "</button>").join("") + "</nav>";
}

export function render(main) {
  const ix = buildIndex(), mode = shownMode(), t = today();
  let html = "";
  if (mode === "all") {
    const f = focusDate();
    html += '<div class="board-x hz-all" data-autoscroll data-scroll-key="hz-all">';
    visibleCols().forEach((h) => { html += column(ix, h, periodOf(h, f), true); });
    html += "</div>" + navPill(true);
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
  html += '<header class="view-h strip-h"><div><h1>' + esc(d.many) + "</h1></div></header>";
  html += '<div class="board-x strip' + (h === "life" ? " single" : "") + '" data-autoscroll data-scroll-key="hz-' + h + '">';
  if (h !== "life") html += '<button class="edge" data-act="earlier">‹ Plus tôt</button>';
  for (let i = win[h][0]; i <= win[h][1]; i++) html += column(ix, h, shiftPeriod(h, now, i), false);
  if (h !== "life") html += '<button class="edge" data-act="later">Plus tard ›</button>';
  html += "</div>" + (h !== "life" ? navPill(false) : "") + (narrow() ? tabs(h) : "");
  main.innerHTML = html;
  if (scrollNow) {
    scrollNow = false;
    scrollToNow(main);
  }
}

function scrollToNow(main, smooth) {
  const h = shownMode(); if (h === "all") return;
  const strip = main.querySelector(".strip"), c = strip && strip.querySelector('[data-col="' + colKey(h, periodOf(h, today())) + '"]');
  if (!c) return;
  const left = strip.scrollLeft + c.getBoundingClientRect().left - strip.getBoundingClientRect().left;
  try { strip.scrollTo({ left, behavior: smooth ? "smooth" : "auto" }); } catch (e) { strip.scrollLeft = left; }
  main.dataset.skipRestore = "hz-" + h;
}

export async function onAct(act, b, main) {
  const h = b.dataset.h;
  const all = shownMode() === "all";
  switch (act) {
    case "hzmode": ui.hzMode = b.dataset.m; scrollNow = true; saveUI(); return true;
    case "ftoday":
      if (all) { ui.focus = ""; scrollNow = true; saveUI(); } else scrollToNow(main, true);
      return true;
    case "fprev": case "fnext":
      if (all) { ui.focus = addDays(focusDate(), act === "fprev" ? -1 : 1); if (ui.focus === today()) ui.focus = ""; saveUI(); }
      else stepColumns(act === "fprev" ? -1 : 1);
      return true;
    case "hzmenu": {
      const cols = visibleCols();
      const a = await menu(b, [
        { label: ui.hideDone ? "Afficher les éléments faits" : "Masquer les éléments faits", act: "done" },
        { sep: true },
        ...HZ.map((x) => ({ label: (cols.includes(x.id) ? "✓ " : "\u2003 ") + x.one, act: "col:" + x.id })),
      ]);
      if (a === "done") { ui.hideDone = !ui.hideDone; saveUI(); }
      if (a && a.startsWith("col:")) {
        const id = a.slice(4), next = cols.includes(id) ? cols.filter((x) => x !== id) : cols.concat(id);
        if (!next.length) { toast("Il faut au moins une colonne."); return true; }
        ui.hzCols = next; saveUI();
      }
      return true;
    }
    case "hidedone": ui.hideDone = !ui.hideDone; saveUI(); return true;
    case "earlier": case "later": {
      const m = shownMode(), d = hzDef(m), strip = main.querySelector(".strip");
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
  const w = again.getBoundingClientRect().width;
  try { strip.scrollBy({ left: -Math.max(w, strip.clientWidth - w), behavior: "smooth" }); } catch (e) { strip.scrollLeft -= w; }
}

export function stepColumns(dir) {
  const bx = document.querySelector("#main .board-x"); if (!bx) return;
  const c = bx.querySelector(".col:not(.folded)") || bx.querySelector(".col");
  const w = c ? c.getBoundingClientRect().width : 280;
  try { bx.scrollBy({ left: dir * w, behavior: "smooth" }); } catch (e) { bx.scrollLeft += dir * w; }
}

