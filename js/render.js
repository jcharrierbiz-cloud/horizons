/* Fragments partagés : une ligne d'élément, une saisie rapide, une grille horaire. */

import { esc, trunc } from "./util.js";
import { periodSpan, today, where, durLabel, hm, toMin } from "./dates.js";
import { icon } from "./ui.js";
import { S, ui } from "./store.js";
import { nestedKids, progressOf, effectiveTone, repeatLabel } from "./items.js";

/* Une ligne : case carrée, intitulé surligné de sa couleur, puis une ligne grise
   discrète (sous-objectifs, heure, étiquettes…).
   ctx : { place: afficher la période, board: false pour taire le tableau,
           nest: false pour ne pas imbriquer les sous-objectifs, dur: afficher la durée } */
export function itemRow(ix, it, ctx) {
  ctx = ctx || {};
  const tone = effectiveTone(ix, it);
  /* Une occurrence d'habitude manquée n'est pas une tâche en souffrance : pas de rouge. */
  const late = !it.done && !it.virtual && it.h && it.h !== "life" && periodSpan(it.h, it.key)[1] < today();
  const kids = ctx.nest !== false && !it.virtual ? nestedKids(ix, it.id) : [];
  const shownKids = ui.hideDone ? kids.filter((k) => !k.done) : kids;
  const prog = it.virtual ? null : progressOf(ix, it);
  const shut = !!(ui.ifold && ui.ifold[it.id]);   // sous-objectifs repliés : choix d'affichage local
  const meta = [];
  if (it.time && it.h === "day") meta.push(icon("clock") + esc(it.time) + (it.dur && ctx.dur ? " · " + durLabel(it.dur) : ""));
  if (prog) meta.push(prog.done + "/" + prog.total + " sous-objectif" + (prog.total > 1 ? "s" : ""));
  if (it.repeat) meta.push(icon("repeat") + esc(repeatLabel(it)));
  if (it.carried) meta.push('<span class="warn" title="Reporté ' + it.carried + ' fois">↷ reporté ' + it.carried + "×</span>");
  if (ctx.place && it.h) meta.push(esc(where(it.h, it.key)));
  if (it.boardId && ctx.board !== false) {
    const b = S.state.boards.find((x) => x.id === it.boardId);
    if (b) meta.push(icon("board") + esc(trunc(b.name, 18)));
  }
  const p = it.parent && ix.byId.get(it.parent);
  if (p && (it.h || it.boardId || ctx.showParent)) meta.push('<span class="up">↳ ' + esc(trunc(p.title || "Sans titre", 26)) + "</span>");
  if (it.remind) meta.push('<span title="Rappel à ' + esc(it.remind) + '">' + icon("bell") + esc(it.remind) + "</span>");
  if (it.runId) meta.push('<span title="Étape d\'une ascension">' + icon("climb") + "</span>");
  if (it.note && it.note.trim()) meta.push('<span title="Contient une note">' + icon("note") + "</span>");
  (it.tags || []).forEach((t) => meta.push('<span class="tag">#' + esc(t) + "</span>"));

  let html = '<div class="it' + (it.done ? " done" : "") + (late ? " late" : "") + (it.virtual ? " virtual" : "") + (tone ? " t-" + tone : "")
    + '" data-drag data-id="' + esc(it.id) + '" data-dur="' + (it.dur || 60) + '">'
    + '<button class="check" role="checkbox" aria-checked="' + (it.done ? "true" : "false") + '" data-act="toggle" aria-label="Marquer comme fait"></button>'
    + '<button class="it-body" data-act="open"><span class="it-title"><span class="hl">' + (it.emoji ? '<span class="emo">' + esc(it.emoji) + "</span>" : "")
    + esc(it.title || "Sans titre") + "</span></span>"
    + (meta.length ? '<span class="it-meta">' + meta.map((m) => "<span>" + m + "</span>").join("") + "</span>" : "") + "</button>"
    + (shownKids.length ? '<button class="fold" data-act="fold" aria-label="' + (shut ? "Déplier" : "Replier") + '" aria-expanded="' + !shut + '">' + icon(shut ? "right" : "down") + "</button>" : "")
    + "</div>";
  if (shownKids.length && !shut) {
    html += '<div class="it-kids">' + shownKids.map((k) => itemRow(ix, k, Object.assign({}, ctx, { place: false }))).join("") + "</div>";
  }
  return html;
}

/* « Ajouter… » en gris, qui devient une saisie ; data-add porte la destination. */
export function addSlot(dest, label) {
  return '<div class="dz-tail add-slot" data-add="' + esc(dest) + '">'
    + '<button class="add-btn" data-act="add">' + esc(label || "Ajouter…") + "</button></div>";
}

export function emptyNote(text) { return '<div class="empty">' + esc(text) + "</div>"; }

/* ── Grille horaire ── */
/* Blocs qui se chevauchent : rangés côte à côte. */
function lanes(blocks) {
  blocks.sort((a, b) => a.s - b.s || b.e - a.e);
  let group = [], groupEnd = -1;
  const flush = () => {
    const ends = [];
    group.forEach((b) => {
      let lane = ends.findIndex((e) => e <= b.s);
      if (lane < 0) { lane = ends.length; ends.push(b.e); } else ends[lane] = b.e;
      b.lane = lane;
    });
    group.forEach((b) => { b.lanes = ends.length; });
    group = [];
  };
  blocks.forEach((b) => {
    if (b.s >= groupEnd && group.length) { flush(); groupEnd = -1; }
    group.push(b); groupEnd = Math.max(groupEnd, b.e);
  });
  if (group.length) flush();
  return blocks;
}

/* Plage affichée : au moins 8 h – 20 h, élargie aux blocs du jour. */
export function dayRange(timed) {
  let from = 8 * 60, to = 20 * 60;
  timed.forEach((it) => {
    const s = toMin(it.time); if (s == null) return;
    from = Math.min(from, Math.floor(s / 60) * 60);
    to = Math.max(to, Math.min(24 * 60, Math.ceil((s + (it.dur || 60)) / 60) * 60));
  });
  return { from, to };
}

/* La grille d'un jour. opts : { ppm (px par minute), from, to (minutes), mini } */
export function timeline(ix, date, timed, opts) {
  const ppm = opts.ppm, from = opts.from, to = opts.to;
  let h = '<div class="tl' + (opts.mini ? " mini" : "") + '" data-zone="' + esc("time:" + date) + '" data-ppm="' + ppm + '" data-base="' + from
    + '" data-date="' + date + '" style="height:' + (to - from) * ppm + 'px">';
  for (let m = from; m < to; m += 60) h += '<div class="tl-h" style="top:' + (m - from) * ppm + 'px"><span>' + hm(m) + "</span></div>";
  if (date === today()) {
    const n = new Date(), cur = n.getHours() * 60 + n.getMinutes();
    if (cur >= from && cur <= to) h += '<div class="tl-now" style="top:' + (cur - from) * ppm + 'px"></div>';
  }
  lanes(timed.map((it) => { const s = toMin(it.time); return { it, s, e: Math.min(24 * 60, s + (it.dur || 60)) }; })).forEach((b) => {
    const it = b.it, tone = effectiveTone(ix, it), w = 100 / b.lanes;
    h += '<div class="blk' + (it.done ? " done" : "") + (it.virtual ? " virtual" : "") + ((b.e - b.s) * ppm < 40 ? " short" : "") + (tone ? " t-" + tone : "")
      + '" data-drag data-id="' + esc(it.id) + '" data-dur="' + (it.dur || 60) + '" style="top:' + (b.s - from) * ppm + "px;height:" + Math.max(20, (b.e - b.s) * ppm - 3)
      + "px;left:calc(" + b.lane * w + "% + 2px);width:calc(" + w + '% - 4px)">'
      + '<button class="check" role="checkbox" aria-checked="' + it.done + '" data-act="toggle" aria-label="Fait"></button>'
      + '<button class="blk-b" data-act="open"><b>' + (it.emoji ? esc(it.emoji) + " " : "") + esc(it.title || "Sans titre") + "</b>"
      + '<span class="blk-t" title="' + hm(b.s) + " – " + hm(b.e) + " · " + durLabel(b.e - b.s) + '">' + hm(b.s) + "</span></button>"
      + '<div class="rs" data-rs="' + esc(it.id) + '" aria-label="Changer la durée"></div></div>';
  });
  return h + "</div>";
}
