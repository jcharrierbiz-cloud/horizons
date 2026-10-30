/* Calendrier.
   • Mois : vue d'hélicoptère, on glisse un élément d'un jour à l'autre. Sur
     téléphone, la grille montre des pastilles et la liste du jour choisi
     s'affiche dessous.
   • Jour : grille horaire pour bloquer du temps. On glisse un élément « à
     planifier » sur une heure, on déplace un bloc, on tire sa poignée pour
     changer sa durée, on touche une plage vide pour créer à cette heure. */

import { esc } from "../util.js";
import {
  iso, dNum, today, addDays, weekday, fmtD, isoWeekKey, periodOf, hm, toMin, durLabel, WD_SHORT, periodLabel, where,
} from "../dates.js";
import { S, ui, saveUI, commit } from "../store.js";
import { buildIndex, colItems, effectiveTone, real } from "../items.js";
import { itemRow, addSlot, timeline } from "../render.js";
import { icon } from "../ui.js";
import { quickAdd } from "../sheet-item.js";

const PPM = 1;              // 1 px par minute : 60 px par heure
const narrow = () => window.matchMedia("(max-width: 760px)").matches;
let selDay = null;          // jour choisi sous la grille, sur téléphone
let scrolledDay = null;

function monthKey() { return /^\d{4}-\d{2}$/.test(ui.calMonth || "") ? ui.calMonth : today().slice(0, 7); }

export function renderMonth(main) {
  const mk = monthKey(), t = today(), ix = buildIndex();
  const first = mk + "-01", start = addDays(first, -weekday(first));
  const mLabel = periodLabel("month", mk);
  if (!selDay || selDay.slice(0, 7) !== mk) selDay = t.slice(0, 7) === mk ? t : first;
  const goals = colItems(ix, "month", mk);

  let html = '<header class="view-h"><div><h1>Calendrier</h1><p class="view-sub">Le mois d\'un coup d\'œil. Glisse un élément d\'un jour à l\'autre ; touche un jour pour sa grille horaire.</p></div>'
    + '<div class="view-tools"><div class="seg"><button aria-pressed="true">Mois</button><button data-act="calday">Jour</button></div>'
    + '<button class="icon-btn" data-act="mprev" aria-label="Mois précédent">' + icon("left") + "</button>"
    + '<b class="cal-title">' + esc(mLabel.title) + "</b>"
    + '<button class="icon-btn" data-act="mnext" aria-label="Mois suivant">' + icon("right") + "</button>"
    + '<button class="btn ghost sm" data-act="mtoday">Aujourd\'hui</button></div></header>';

  html += '<div class="cal-goals" data-zone="' + esc("col:month|" + mk) + '"><span class="lbl">Objectifs du mois</span><div class="dz row">'
    + goals.map((it) => itemRow(ix, it, { nest: false })).join("") + addSlot("col:month|" + mk, "Ajouter un objectif…") + "</div></div>";

  html += '<div class="cal' + (narrow() ? " mini" : "") + '"><div class="cal-wd">' + WD_SHORT.map((d) => "<span>" + d + "</span>").join("") + "</div><div class=\"cal-grid\">";
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), items = colItems(ix, "day", d);
    const out = d.slice(0, 7) !== mk;
    const shown = ui.hideDone ? items.filter((x) => !x.done) : items;
    html += '<div class="cell' + (out ? " out" : "") + (d === t ? " today" : "") + (narrow() && d === selDay ? " sel" : "") + '" data-zone="' + esc("cal:" + d) + '" data-date="' + d + '">'
      + '<div class="cell-h"><button class="cell-n" data-act="openday" data-date="' + d + '">' + dNum(d).getDate() + "</button>"
      + (weekday(d) === 0 ? '<span class="wk">S' + parseInt(isoWeekKey(d).slice(6), 10) + "</span>" : "") + "</div>";
    if (narrow()) {
      html += '<div class="dots">' + shown.slice(0, 4).map((it) => { const t = effectiveTone(ix, it); return '<i class="' + (t ? "t-" + t : "") + (it.done ? " d" : "") + '"></i>'; }).join("")
        + (shown.length > 4 ? "<b>+" + (shown.length - 4) + "</b>" : "") + "</div>";
    } else {
      html += '<div class="dz">' + shown.map((it) => itemRow(ix, it, { nest: false })).join("") + "</div>"
        + '<button class="cell-add" data-act="caladd" data-date="' + d + '" aria-label="Ajouter le ' + esc(fmtD(d, { day: "numeric", month: "long" })) + '">' + icon("plus") + "</button>";
    }
    html += "</div>";
  }
  html += "</div></div>";

  if (narrow()) {
    const items = colItems(ix, "day", selDay);
    const L = periodLabel("day", selDay);
    html += '<section class="col agenda" data-zone="' + esc("col:day|" + selDay) + '"><div class="col-h"><div class="col-eyebrow"><span class="now-tag">' + esc(L.tag || " ") + "</span></div>"
      + '<div class="col-row"><span class="col-title static">' + esc(L.title) + '</span><button class="btn ghost sm" data-act="openday" data-date="' + selDay + '">' + icon("clock") + "Heures</button></div></div>"
      + '<div class="col-b"><div class="dz">' + items.map((it) => itemRow(ix, it, { dur: true })).join("") + addSlot("col:day|" + selDay) + "</div></div></section>";
  }
  main.innerHTML = html;
}

export function renderDay(main, date) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date || "") && dNum(date) ? date : today();
  const ix = buildIndex(), items = colItems(ix, "day", d), t = today();
  const timed = items.filter((x) => x.time && toMin(x.time) != null);
  const loose = items.filter((x) => !x.time || toMin(x.time) == null);
  const L = periodLabel("day", d);
  let html = '<header class="view-h"><div><h1>' + esc(L.tag || L.title) + "</h1>"
    + '<p class="view-sub">' + esc(L.tag ? L.title : "") + (L.tag ? " · " : "") + "Glisse ce qui est à planifier sur une heure, tire le bas d'un bloc pour sa durée, touche une plage libre pour créer.</p></div>"
    + '<div class="view-tools"><div class="seg"><button data-act="calmonth">Mois</button><button aria-pressed="true">Jour</button></div>'
    + '<button class="icon-btn" data-act="dprev" data-date="' + d + '" aria-label="Jour précédent">' + icon("left") + "</button>"
    + '<button class="btn ghost sm" data-act="dtoday">Aujourd\'hui</button>'
    + '<button class="icon-btn" data-act="dnext" data-date="' + d + '" aria-label="Jour suivant">' + icon("right") + "</button></div></header>";

  html += '<div class="dayv"><aside class="col unsched" data-zone="' + esc("unsched:" + d) + '"><div class="col-h"><div class="col-row"><span class="col-title static">À planifier</span>'
    + '<span class="col-count num">' + (loose.length || "") + "</span></div></div>"
    + '<div class="col-b"><div class="dz">' + loose.map((it) => itemRow(ix, it, { nest: false })).join("") + addSlot("col:day|" + d) + "</div></div></aside>";
  html += '<div class="tl-wrap" data-autoscroll data-scroll-key="tl">' + timeline(ix, d, timed, { ppm: PPM, from: 0, to: 24 * 60 }) + "</div></div>";
  main.innerHTML = html;

  if (scrolledDay !== d) {
    scrolledDay = d;
    const wrap = main.querySelector(".tl-wrap");
    const n = new Date(), focus = d === t ? Math.max(0, n.getHours() * 60 - 90) : 7 * 60;
    wrap.scrollTop = focus * PPM;
    main.dataset.skipRestore = "tl";
  }
}

export function onAct(act, el, main) {
  switch (act) {
    case "mprev": case "mnext": {
      const mk = monthKey(), d = new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1 + (act === "mprev" ? -1 : 1), 1, 12);
      ui.calMonth = iso(d).slice(0, 7); saveUI(); return true;
    }
    case "mtoday": ui.calMonth = ""; selDay = today(); saveUI(); return true;
    case "openday":
      if (narrow() && main.querySelector(".cal") && el.closest(".cell")) { selDay = el.dataset.date; saveUI(); return true; }
      location.hash = "#/day/" + el.dataset.date; return true;
    case "caladd": quickAdd({ h: "day", key: el.dataset.date }); return true;
    case "calday": location.hash = "#/day/" + (selDay || today()); return true;
    case "calmonth": location.hash = "#/cal"; return true;
    case "dprev": case "dnext": location.hash = "#/day/" + addDays(el.dataset.date, act === "dprev" ? -1 : 1); return true;
    case "dtoday": location.hash = "#/day/" + today(); return true;
  }
  return false;
}

/* Sur téléphone, toucher une case choisit le jour. */
export function onCellTap(e, main) {
  if (!narrow()) return false;
  const c = e.target.closest(".cal .cell"); if (!c) return false;
  selDay = c.dataset.date; saveUI(); return true;
}

/* Plage vide d'une grille horaire (vue Journée ou colonne du jour) : créer à cette heure. */
export function onTimelineTap(e) {
  const tl = e.target.closest(".tl");
  if (!tl || e.target.closest(".blk")) return false;
  const r = tl.getBoundingClientRect(), ppm = +tl.dataset.ppm || 1, base = +tl.dataset.base || 0;
  const min = Math.max(base, Math.min(23 * 60 + 30, base + Math.floor((e.clientY - r.top) / ppm / 30) * 30));
  quickAdd({ h: "day", key: tl.dataset.date, extra: { time: hm(min), dur: 60 } });
  return true;
}

/* Poignée de durée : glisser vers le bas ou le haut, calé au quart d'heure. */
export function initResize() {
  let rs = null;
  document.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".rs"); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const blk = h.closest(".blk"), tl = blk.closest("[data-ppm]");
    rs = { id: h.dataset.rs, blk, y: e.clientY, h0: blk.getBoundingClientRect().height, ppm: tl ? +tl.dataset.ppm || 1 : 1 };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* sans capture */ }
    document.body.classList.add("resizing");
  });
  document.addEventListener("pointermove", (e) => {
    if (!rs) return;
    const px = Math.max(15 * rs.ppm, rs.h0 + (e.clientY - rs.y));
    rs.blk.style.height = px + "px";
    rs.min = Math.max(15, Math.round(px / rs.ppm / 15) * 15);
    const span = rs.blk.querySelector(".blk-t"); if (span) span.textContent = durLabel(rs.min);
  });
  const end = () => {
    if (!rs) return;
    const r = rs; rs = null;
    document.body.classList.remove("resizing");
    if (!r.min) return;
    const it = real(r.id); if (!it) return;
    it.dur = Math.min(r.min, 24 * 60 - (toMin(it.time) || 0));
    commit();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

export { where };
