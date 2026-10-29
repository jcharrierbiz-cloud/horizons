/* Fragments partagés : une ligne d'élément, une saisie rapide. */

import { esc, trunc, toneHex } from "./util.js";
import { periodSpan, today, where, durLabel } from "./dates.js";
import { icon } from "./ui.js";
import { S, ui } from "./store.js";
import { nestedKids, progressOf, effectiveTone, repeatLabel } from "./items.js";

/* ctx : { place: true pour afficher la période, board: false pour taire le tableau,
           nest: true pour afficher les sous-objectifs imbriqués, compact } */
export function itemRow(ix, it, ctx) {
  ctx = ctx || {};
  const tone = toneHex(effectiveTone(ix, it));
  /* Une occurrence d'habitude manquée n'est pas une tâche en souffrance : pas de rouge. */
  const late = !it.done && !it.virtual && it.h && it.h !== "life" && periodSpan(it.h, it.key)[1] < today();
  const kids = ctx.nest !== false && !it.virtual ? nestedKids(ix, it.id) : [];
  const shownKids = ui.hideDone ? kids.filter((k) => !k.done) : kids;
  const prog = it.virtual ? null : progressOf(ix, it);
  const shut = !!(ui.ifold && ui.ifold[it.id]);   // sous-objectifs repliés : choix d'affichage local
  const chips = [];
  if (it.time && it.h === "day") chips.push('<span class="chip">' + icon("clock") + esc(it.time) + (it.dur && ctx.dur ? " · " + durLabel(it.dur) : "") + "</span>");
  if (it.repeat) chips.push('<span class="chip" title="' + esc(repeatLabel(it)) + '">' + icon("repeat") + "</span>");
  if (it.carried) chips.push('<span class="chip warn" title="Reporté ' + it.carried + ' fois">↷ ' + it.carried + "</span>");
  if (prog) chips.push('<span class="chip' + (prog.done === prog.total ? " ok" : "") + '">' + prog.done + "/" + prog.total + "</span>");
  if (ctx.place && it.h) chips.push('<span class="chip">' + esc(where(it.h, it.key)) + "</span>");
  if (it.boardId && ctx.board !== false) {
    const b = S.state.boards.find((x) => x.id === it.boardId);
    if (b) chips.push('<span class="chip">' + icon("board") + esc(trunc(b.name, 18)) + "</span>");
  }
  const p = it.parent && ix.byId.get(it.parent);
  if (p && (it.h || it.boardId || ctx.showParent)) chips.push('<span class="chip up">↳ ' + esc(trunc(p.title || "Sans titre", 26)) + "</span>");
  if (it.remind) chips.push('<span class="chip" title="Rappel à ' + esc(it.remind) + '">' + icon("bell") + "</span>");
  if (it.runId) chips.push('<span class="chip" title="Étape d\'une ascension">' + icon("climb") + "</span>");
  if (it.note && it.note.trim()) chips.push('<span class="chip" title="Contient une note">' + icon("note") + "</span>");
  (it.tags || []).forEach((t) => chips.push('<span class="chip tag">#' + esc(t) + "</span>"));

  let html = '<div class="it' + (it.done ? " done" : "") + (late ? " late" : "") + (it.virtual ? " virtual" : "")
    + '" data-drag data-id="' + esc(it.id) + '" data-dur="' + (it.dur || 60) + '"' + (tone ? ' style="--tone:' + tone + '"' : "") + ">"
    + '<button class="check" role="checkbox" aria-checked="' + (it.done ? "true" : "false") + '" data-act="toggle" aria-label="Marquer comme fait"></button>'
    + '<button class="it-body" data-act="open"><span class="it-title">' + (it.emoji ? '<span class="emo">' + esc(it.emoji) + "</span>" : "")
    + esc(it.title || "Sans titre") + "</span>"
    + (chips.length ? '<span class="it-meta">' + chips.join("") + "</span>" : "") + "</button>"
    + (shownKids.length ? '<button class="fold" data-act="fold" aria-label="' + (shut ? "Déplier" : "Replier") + '" aria-expanded="' + !shut + '">' + icon(shut ? "right" : "down") + "</button>" : "")
    + "</div>";
  if (shownKids.length && !shut) {
    html += '<div class="it-kids">' + shownKids.map((k) => itemRow(ix, k, Object.assign({}, ctx, { place: false }))).join("") + "</div>";
  }
  return html;
}

/* Bouton « + Ajouter » qui se transforme en saisie ; data-add porte la destination. */
export function addSlot(dest, label) {
  return '<div class="dz-tail add-slot" data-add="' + esc(dest) + '">'
    + '<button class="add-btn" data-act="add">' + icon("plus") + esc(label || "Ajouter") + "</button></div>";
}

export function emptyNote(text) { return '<div class="empty">' + esc(text) + "</div>"; }
