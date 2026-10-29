/* Recherche (texte et étiquettes) et « À ranger » : ce qui n'a ni date, ni
   tableau, ni parent. */

import { esc } from "../util.js";
import { S, ui, saveUI, spaceId } from "../store.js";
import { buildIndex, search, allTags } from "../items.js";
import { itemRow, addSlot } from "../render.js";
import { icon } from "../ui.js";

let q = "", withDone = false;

export function render(main, tag) {
  tag = tag ? decodeURIComponent(tag) : "";
  const tags = allTags();
  const res = search(q, tag, withDone);
  const ixBySpace = new Map();
  const ixOf = (sp) => { if (!ixBySpace.has(sp)) ixBySpace.set(sp, buildIndex(sp)); return ixBySpace.get(sp); };
  const spaceName = (sp) => { const s = S.state.spaces.find((x) => x.id === sp); return s ? s.name : ""; };
  const multi = S.state.spaces.length > 1;

  let html = '<header class="view-h"><div><h1>Recherche</h1><p class="view-sub">Dans les intitulés, les notes et les étiquettes, tous espaces confondus.</p></div></header>'
    + '<div class="search-bar">' + icon("search") + '<input id="sQ" type="search" placeholder="Rechercher…" value="' + esc(q) + '" autocomplete="off">'
    + '<button class="btn ghost sm" data-act="sdone" aria-pressed="' + withDone + '">' + (withDone ? "Faits inclus" : "Inclure les faits") + "</button></div>";
  if (tags.length) {
    html += '<div class="tag-row">' + tags.map(([t, n]) => '<a class="chip tag' + (t === tag ? " on" : "") + '" href="#/search' + (t === tag ? "" : "/" + encodeURIComponent(t)) + '">#' + esc(t) + ' <span class="num">' + n + "</span></a>").join("") + "</div>";
  }
  if (!q && !tag) html += '<div class="empty">Tape quelques lettres, ou choisis une étiquette.</div>';
  else if (!res.length) html += '<div class="empty">Rien ne correspond.</div>';
  else {
    html += '<div class="results">';
    let lastSp = null;
    res.sort((a, b) => (a.spaceId === spaceId() ? 0 : 1) - (b.spaceId === spaceId() ? 0 : 1)).forEach((it) => {
      if (multi && it.spaceId !== lastSp) { lastSp = it.spaceId; html += '<div class="res-sp">' + esc(spaceName(it.spaceId)) + "</div>"; }
      html += itemRow(ixOf(it.spaceId), it, { place: true, nest: false, showParent: true });
    });
    html += "</div>";
  }
  main.innerHTML = html;
}

export function onAct(act) {
  if (act === "sdone") { withDone = !withDone; saveUI(); return true; }
  return false;
}
export function onInput(e) {
  if (e.target.id !== "sQ") return false;
  q = e.target.value;
  saveUI();
  return true;
}
export const focusSearch = () => { const i = document.getElementById("sQ"); if (i) { i.focus(); i.select(); } };

/* À ranger */
export function renderInbox(main) {
  const ix = buildIndex();
  const items = S.state.items.filter((x) => x.spaceId === ix.space && !x.h && !x.boardId && !x.parent && !x.repeat && (!ui.hideDone || !x.done));
  main.innerHTML = '<header class="view-h"><div><h1>À ranger</h1><p class="view-sub">Ce qui n\'a ni date, ni tableau, ni objectif parent. Glisse un élément vers un tableau de la barre latérale, ou ouvre-le pour lui donner une place.</p></div></header>'
    + '<section class="col wide" data-zone="inbox"><div class="col-b"><div class="dz">' + items.map((it) => itemRow(ix, it, {})).join("")
    + addSlot("inbox", "Ajouter") + "</div></div></section>";
}
