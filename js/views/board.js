/* Tableaux : des listes hors du temps (idées, lectures, projets), en colonnes
   (kanban) ou empilées (liste). Une liste se replie. Un élément d'un tableau
   peut aussi être posé dans un horizon : il apparaît aux deux endroits. */

import { esc, uid, plural, EMOJIS, TONES } from "../util.js";
import { S, commit, snapshot, restore, spaceId, saveUI } from "../store.js";
import { buildIndex, listItems } from "../items.js";
import { itemRow, addSlot, emptyNote } from "../render.js";
import { icon, toast, ask, menu, promptText } from "../ui.js";
import { ui } from "../store.js";

export const boardOf = (id) => S.state.boards.find((b) => b.id === id) || null;

/* Replier une liste est un choix d'affichage, propre à l'appareil. */
const folded = (l) => !!(ui.lcol && ui.lcol[l.id]);
function setFold(l, v) { ui.lcol = ui.lcol || {}; if (v) ui.lcol[l.id] = true; else delete ui.lcol[l.id]; saveUI(); }

function listCol(ix, b, l) {
  const items = listItems(ix, b.id, l.id), shown = ui.hideDone ? items.filter((x) => !x.done) : items;
  const zone = "list:" + b.id + "|" + l.id;
  if (folded(l) && b.view === "kanban") {
    return '<section class="col folded" data-zone="' + esc(zone) + '"><button class="fold-btn" data-act="lunfold" data-l="' + l.id + '">'
      + icon("expand") + '<span class="vert">' + esc(l.name) + (items.length ? " · " + items.length : "") + "</span></button></section>";
  }
  const d = items.filter((x) => x.done).length;
  return '<section class="' + (b.view === "kanban" ? "col list" : "lsec") + (folded(l) ? " closed" : "") + '" data-zone="' + esc(zone) + '" data-l="' + l.id + '">'
    + '<div class="col-h"><div class="col-row">'
    + (b.view === "list" ? '<button class="icon-btn sm" data-act="lfold" data-l="' + l.id + '" aria-label="' + (folded(l) ? "Déplier" : "Replier") + '">' + icon(folded(l) ? "right" : "down") + "</button>" : "")
    + '<button class="col-title" data-act="lrename" data-l="' + l.id + '">' + esc(l.name) + "</button>"
    + '<span class="col-count num">' + (items.length ? d + "/" + items.length : "") + "</span>"
    + (b.view === "kanban" ? '<button class="icon-btn sm" data-act="lfold" data-l="' + l.id + '" aria-label="Replier la liste">' + icon("collapse") + "</button>" : "")
    + '<button class="icon-btn sm" data-act="lmenu" data-l="' + l.id + '" aria-label="Options de la liste">' + icon("more") + "</button>"
    + "</div></div>"
    + (folded(l) ? "" : '<div class="col-b"><div class="dz">' + shown.map((it) => itemRow(ix, it, { place: true, board: false })).join("")
      + addSlot(zone, "Ajouter") + "</div></div>")
    + "</section>";
}

export function render(main, id) {
  const b = boardOf(id);
  if (!b || b.spaceId !== spaceId()) {
    main.innerHTML = '<header class="view-h"><div><h1>Tableau introuvable</h1></div></header>' + emptyNote("Ce tableau n'existe plus, ou appartient à un autre espace.");
    return;
  }
  const ix = buildIndex();
  let html = '<header class="view-h"><div class="title-line">'
    + '<button class="emo-btn lg" data-act="bemoji" aria-label="Emoji du tableau">' + (b.emoji ? esc(b.emoji) : icon("board")) + "</button>"
    + '<h1><button class="h1-btn" data-act="brename">' + esc(b.name) + "</button></h1></div>"
    + '<div class="view-tools"><div class="seg" role="group" aria-label="Affichage du tableau">'
    + '<button data-act="bview" data-v="kanban" aria-pressed="' + (b.view === "kanban") + '">' + icon("board") + "Colonnes</button>"
    + '<button data-act="bview" data-v="list" aria-pressed="' + (b.view === "list") + '">' + icon("list") + "Liste</button></div>"
    + '<button class="btn ghost sm" data-act="ladd">' + icon("plus") + "Liste</button>"
    + '<button class="btn ghost sm" data-act="hidedone" aria-pressed="' + ui.hideDone + '">' + (ui.hideDone ? "Afficher les faits" : "Masquer les faits") + "</button>"
    + '<button class="icon-btn" data-act="bmenu" aria-label="Options du tableau">' + icon("more") + "</button></div></header>";
  if (b.view === "kanban") {
    html += '<div class="board-x" data-autoscroll data-scroll-key="b-' + b.id + '">' + b.lists.map((l) => listCol(ix, b, l)).join("")
      + '<button class="edge add-list" data-act="ladd">' + icon("plus") + "Nouvelle liste</button></div>";
  } else {
    html += '<div class="list-view">' + b.lists.map((l) => listCol(ix, b, l)).join("") + "</div>";
  }
  main.innerHTML = html;
}

export async function onAct(act, el, main, id) {
  const b = boardOf(id); if (!b) return false;
  const l = el.dataset.l ? b.lists.find((x) => x.id === el.dataset.l) : null;
  switch (act) {
    case "bview": b.view = el.dataset.v; commit(); return true;
    case "hidedone": ui.hideDone = !ui.hideDone; saveUI(); return true;
    case "brename": {
      const v = await promptText("Nom du tableau", b.name); if (v) { b.name = v; commit(); }
      return true;
    }
    case "bemoji": {
      const v = await menu(el, [{ label: "Aucun", act: "" }].concat(EMOJIS.slice(0, 16).map((e) => ({ label: e, act: e }))));
      if (v !== null) { b.emoji = v; commit(); }
      return true;
    }
    case "ladd": {
      const v = await promptText("Nom de la nouvelle liste", "", "Créer");
      if (v) { b.lists.push({ id: uid(), name: v, collapsed: false }); commit(); }
      return true;
    }
    case "lfold": if (l) setFold(l, !folded(l)); return true;
    case "lunfold": if (l) setFold(l, false); return true;
    case "lrename": {
      if (!l) return true;
      const v = await promptText("Nom de la liste", l.name); if (v) { l.name = v; commit(); }
      return true;
    }
    case "lmenu": {
      if (!l) return true;
      const i = b.lists.indexOf(l);
      const a = await menu(el, [
        { label: "Renommer", act: "rename" },
        ...(i > 0 ? [{ label: "Déplacer vers la gauche", act: "left" }] : []),
        ...(i < b.lists.length - 1 ? [{ label: "Déplacer vers la droite", act: "right" }] : []),
        { sep: true }, { label: "Supprimer la liste", act: "del", danger: true },
      ]);
      if (a === "rename") return onAct("lrename", el, main, id);
      if (a === "left" || a === "right") {
        b.lists.splice(i, 1); b.lists.splice(i + (a === "left" ? -1 : 1), 0, l); commit();
      }
      if (a === "del") {
        if (b.lists.length === 1) { toast("Un tableau garde au moins une liste."); return true; }
        const inside = S.state.items.filter((x) => x.boardId === b.id && x.listId === l.id);
        const ok = await ask("Supprimer la liste « " + l.name + " » ?" + (inside.length ? " Ses " + plural(inside.length, "élément") + " vont dans « " + b.lists[i === 0 ? 1 : 0].name + " »." : ""),
          [{ v: true, label: "Supprimer", kind: "danger" }]);
        if (!ok) return true;
        const dest = b.lists[i === 0 ? 1 : 0];
        inside.forEach((x) => { x.listId = dest.id; x.border = 1e6 + x.border; });
        b.lists.splice(i, 1); commit();
      }
      return true;
    }
    case "bmenu": {
      const others = S.state.spaces.filter((s) => s.id !== b.spaceId);
      const a = await menu(el, [
        { label: "Renommer", act: "rename" },
        { label: "Couleur…", act: "tone" },
        ...others.map((s) => ({ label: "Déplacer vers l'espace « " + s.name + " »", act: "space:" + s.id })),
        { sep: true }, { label: "Supprimer le tableau", act: "del", danger: true },
      ]);
      if (a === "rename") return onAct("brename", el, main, id);
      if (a === "tone") {
        const t = await menu(el, [{ label: "Aucune", act: "" }].concat(TONES.map((x) => ({ label: x.name, act: x.id }))));
        if (t !== null) { b.tone = t; commit(); }
      }
      if (a && a.startsWith("space:")) {
        const sp = a.slice(6);
        b.spaceId = sp;
        S.state.items.forEach((x) => { if (x.boardId === b.id) x.spaceId = sp; });
        commit(); toast("Tableau déplacé"); location.hash = "#/horizons";
      }
      if (a === "del") {
        const inside = S.state.items.filter((x) => x.boardId === b.id);
        const ok = await ask("Supprimer le tableau « " + b.name + " » ? " + (inside.length ? "Ses " + plural(inside.length, "élément") + " restent : ceux qui ont une date dans leurs horizons, les autres dans « À ranger »." : ""),
          [{ v: true, label: "Supprimer", kind: "danger" }]);
        if (!ok) return true;
        const snap = snapshot(inside.map((x) => x.id)), copy = JSON.parse(JSON.stringify(b)), at = S.state.boards.indexOf(b);
        inside.forEach((x) => { x.boardId = null; x.listId = null; });
        S.state.boards.splice(at, 1);
        commit(); location.hash = "#/horizons";
        toast("Tableau supprimé", () => { S.state.boards.splice(at, 0, copy); restore(snap); });
      }
      return true;
    }
  }
  return false;
}

export function createBoard(name) {
  const b = { id: uid(), spaceId: spaceId(), name: name || "Nouveau tableau", emoji: "", tone: "", view: "kanban",
    lists: [{ id: uid(), name: "À faire", collapsed: false }, { id: uid(), name: "En cours", collapsed: false }, { id: uid(), name: "Fait", collapsed: false }] };
  S.state.boards.push(b);
  return b;
}
