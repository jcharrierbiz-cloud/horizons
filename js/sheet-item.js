/* Fiche d'un élément : tout ce qu'on peut régler sur un objectif ou une tâche. */

import { esc, trunc, TONES, EMOJIS, hashTags, stripTags, uid } from "./util.js";
import {
  HZ, hzIdx, hzDef, periodOf, shiftPeriod, periodDelta, anchorDay, where, today, fmtD, WD_ONE, durLabel, weekday,
} from "./dates.js";
import { S, commit, snapshot, restore, ui, saveUI } from "./store.js";
import {
  buildIndex, resolve, find, materialize, moveTo, unplace, setBoard, toggle, remove, removalSet, skipOccurrence,
  parentCandidates, kidsOf, createItem, repeatLabel, placeLabel, renumberCol,
} from "./items.js";
import { openSheet, closeSheet, toast, ask, icon, setSheetTitle } from "./ui.js";
import { renderMarkdown, toggleTaskLine } from "./md.js";

let current = null;           // identifiant de l'élément affiché
let noteMode = "edit";
let emojiOpen = false;

export function openItem(id) {
  const r = resolve(id);
  if (!r) return;
  /* Une occurrence virtuelle ouvre la série, avec de quoi agir sur cette seule occurrence. */
  current = r.virtual ? r.series.id : r.it.id;
  const occ = r.virtual ? r.key : null;
  noteMode = r.it.note && r.it.note.trim() ? "view" : "edit";
  emojiOpen = false;
  const body = openSheet("", "", { onClose: () => { tidy(); current = null; }, wide: true });
  paint(occ);
  bind(body, occ);
}

function tidy() {
  const it = current && find(current);
  if (!it) return;
  if (!it.title.trim()) { it.title = "Sans titre"; commit(); }
}

function sheetTitle(it) {
  if (it.repeat) return "Série · " + repeatLabel(it);
  return placeLabel(it);
}

function paint(occ) {
  const it = find(current); if (!it) { closeSheet(); return; }
  const ix = buildIndex(it.spaceId);
  setSheetTitle(sheetTitle(it));
  document.getElementById("sheet").style.setProperty("--a", it.tone ? TONES.find((t) => t.id === it.tone).hex : "var(--accent)");
  document.getElementById("sheetBody").innerHTML = html(it, ix, occ);
}

function html(it, ix, occ) {
  const h = it.h;
  let s = "";
  if (occ) {
    s += '<div class="banner">' + icon("repeat") + '<div><b>Occurrence · ' + esc(where(h, occ)) + "</b>"
      + "<span>Ce que tu modifies ici vaut pour toute la série.</span></div>"
      + '<div class="banner-acts"><button class="btn sm" data-act="detach" data-occ="' + esc(occ) + '">Détacher cette occurrence</button>'
      + '<button class="btn sm ghost" data-act="skipocc" data-occ="' + esc(occ) + '">La passer</button></div></div>';
  }
  /* Titre */
  s += '<div class="f-title">'
    + (it.repeat ? "" : '<button class="check big" role="checkbox" aria-checked="' + it.done + '" data-act="done" aria-label="Fait"></button>')
    + '<button class="emo-btn" data-act="emoji" aria-label="Choisir un emoji">' + (it.emoji ? esc(it.emoji) : icon("flag")) + "</button>"
    + '<textarea id="fTitle" data-f="title" rows="1" placeholder="Intitulé — #étiquette pour ranger" maxlength="300">' + esc(it.title) + "</textarea></div>";
  if (emojiOpen) {
    s += '<div class="emo-grid"><button data-emoji="">∅</button>' + EMOJIS.map((e) => '<button data-emoji="' + esc(e) + '">' + esc(e) + "</button>").join("") + "</div>";
  }
  /* Couleur */
  s += '<div class="f-row"><span class="lbl">Couleur</span><div class="tones">'
    + '<button class="tone none" data-tone="" aria-pressed="' + !it.tone + '" aria-label="Sans couleur"></button>'
    + TONES.map((t) => '<button class="tone" data-tone="' + t.id + '" style="background:' + t.hex + '" aria-pressed="' + (t.id === it.tone) + '" aria-label="' + t.name + '"></button>').join("")
    + "</div></div>";

  /* Quand */
  s += '<div class="f-sec"><div class="lbl">Quand</div><div class="seg wrap">'
    + '<button data-mh="" aria-pressed="' + !h + '">Sans date</button>'
    + HZ.map((x) => '<button data-mh="' + x.id + '" aria-pressed="' + (x.id === h) + '">' + x.one + "</button>").join("") + "</div>";
  if (h && h !== "life") {
    s += '<div class="stepper"><button class="icon-btn" data-mstep="-1" aria-label="Période précédente">' + icon("left") + "</button>"
      + "<b>" + esc(where(h, it.key)) + "</b>"
      + '<button class="icon-btn" data-mstep="1" aria-label="Période suivante">' + icon("right") + "</button>"
      + (periodDelta(h, it.key) !== 0 ? '<button class="btn sm ghost" data-act="mnow">' + esc(hzDef(h).now) + "</button>" : "")
      + (h === "day" ? '<input type="date" data-f="date" value="' + esc(it.key) + '" aria-label="Date">' : "") + "</div>";
  }
  if (h === "day") {
    s += '<div class="f-grid">'
      + '<label><span class="lbl">Heure</span><input type="time" data-f="time" value="' + esc(it.time) + '"></label>'
      + '<label><span class="lbl">Durée</span><select data-f="dur">' + [15, 30, 45, 60, 90, 120, 180, 240].map((m) => '<option value="' + m + '"' + (m === it.dur ? " selected" : "") + ">" + durLabel(m) + "</option>").join("") + "</select></label>"
      + '<label><span class="lbl">Rappel</span><input type="time" data-f="remind" value="' + esc(it.remind) + '"></label></div>';
  }
  s += "</div>";

  /* Répétition */
  if (h && h !== "life") {
    const r = it.repeat;
    let opts;
    if (h === "day") {
      opts = [["", "Jamais"], ["daily", "Chaque jour / tous les N jours"], ["weekdays", "Du lundi au vendredi"], ["weekly", "Certains jours de la semaine"], ["monthly", "Chaque mois, même date"], ["yearly", "Chaque année, même date"]];
    } else opts = [["", "Jamais"], ["period", "Chaque " + hzDef(h).one.toLowerCase() + " / toutes les N"]];
    s += '<div class="f-sec"><div class="lbl">Répéter</div><div class="f-grid">'
      + '<label class="grow"><select data-f="freq">' + opts.map((o) => '<option value="' + o[0] + '"' + ((r ? r.freq : "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
    if (r && r.freq !== "weekdays") s += '<label><span class="lbl">Tous les</span><input type="number" min="1" max="99" data-f="n" value="' + r.n + '"></label>';
    if (r) s += '<label><span class="lbl">Jusqu\'au</span><input type="date" data-f="until" value="' + esc(r.until) + '"></label>';
    s += "</div>";
    if (r && r.freq === "weekly") {
      const days = r.days.length ? r.days : [weekday(it.key)];
      s += '<div class="wd">' + WD_ONE.map((l, i) => '<button data-wd="' + i + '" aria-pressed="' + days.includes(i) + '">' + l + "</button>").join("") + "</div>";
    }
    if (r) s += '<p class="hint">Commence ' + esc(where(h, it.key).toLowerCase()) + ". Chaque occurrence se coche à part ; la série elle-même ne se coche pas.</p>";
    s += "</div>";
  }

  /* Tableau */
  const boards = S.state.boards.filter((b) => b.spaceId === it.spaceId);
  if (!it.repeat) {
    const b = boards.find((x) => x.id === it.boardId);
    s += '<div class="f-sec"><div class="lbl">Tableau</div><div class="f-grid">'
      + '<label class="grow"><select data-f="board"><option value="">Aucun</option>' + boards.map((x) => '<option value="' + x.id + '"' + (x.id === it.boardId ? " selected" : "") + ">" + esc((x.emoji ? x.emoji + " " : "") + x.name) + "</option>").join("") + "</select></label>"
      + (b ? '<label class="grow"><select data-f="list">' + b.lists.map((l) => '<option value="' + l.id + '"' + (l.id === it.listId ? " selected" : "") + ">" + esc(l.name) + "</option>").join("") + "</select></label>" : "")
      + "</div></div>";
  }

  /* Rattaché à */
  const cands = parentCandidates(ix, it);
  const parent = it.parent && ix.byId.get(it.parent);
  s += '<div class="f-sec"><div class="lbl">Rattaché à</div>';
  if (cands.length || parent) {
    let found = !it.parent;
    s += '<select data-f="parent"><option value="">Aucun</option>';
    cands.forEach((g) => {
      s += '<optgroup label="' + esc(g.h === "life" ? "Vie" : hzDef(g.h).one + " · " + where(g.h, g.k)) + '">';
      g.items.forEach((x) => { if (x.id === it.parent) found = true; s += '<option value="' + x.id + '"' + (x.id === it.parent ? " selected" : "") + ">" + esc(trunc(x.title || "Sans titre", 70)) + "</option>"; });
      s += "</optgroup>";
    });
    if (!found && parent) s += '<optgroup label="Ailleurs"><option value="' + parent.id + '" selected>' + esc(trunc(parent.title, 70)) + "</option></optgroup>";
    s += "</select>";
  } else {
    s += '<p class="hint">' + (h === "life" ? "La vie est l'horizon le plus large : rien au-dessus." : "Pose d'abord un objectif dans un horizon plus large qui couvre cette période.") + "</p>";
  }
  s += "</div>";

  /* Étiquettes */
  s += '<div class="f-sec"><div class="lbl">Étiquettes</div><div class="tags-edit">'
    + it.tags.map((t) => '<span class="chip tag">#' + esc(t) + '<button data-untag="' + esc(t) + '" aria-label="Retirer">' + icon("x") + "</button></span>").join("")
    + '<input id="fTag" placeholder="+ étiquette" maxlength="40"></div></div>';

  /* Note */
  s += '<div class="f-sec"><div class="lbl-row"><span class="lbl">Note</span><div class="seg sm">'
    + '<button data-note="edit" aria-pressed="' + (noteMode === "edit") + '">Écrire</button><button data-note="view" aria-pressed="' + (noteMode === "view") + '">Aperçu</button></div></div>';
  s += noteMode === "edit"
    ? '<textarea id="fNote" data-f="note" class="note-ed" placeholder="Markdown : # titre, **gras**, - liste, - [ ] case, > citation, [lien](https://…)">' + esc(it.note) + "</textarea>"
    : '<div class="md" id="fNoteView">' + (it.note.trim() ? renderMarkdown(it.note) : '<p class="hint">Aucune note.</p>') + "</div>";
  s += "</div>";

  /* Sous-objectifs */
  if (!it.repeat) {
    const kids = kidsOf(ix, it.id);
    const d = kids.filter((k) => k.done).length;
    s += '<div class="f-sec"><div class="lbl-row"><span class="lbl">Sous-objectifs</span>' + (kids.length ? '<span class="num">' + d + "/" + kids.length + "</span>" : "") + "</div>";
    if (kids.length) s += '<div class="bar"><i style="width:' + Math.round(d / kids.length * 100) + '%"></i></div>';
    s += kids.map((k) => '<div class="kid' + (k.done ? " done" : "") + '" data-kid="' + k.id + '">'
      + '<button class="check" role="checkbox" aria-checked="' + k.done + '" data-act="kidtog" aria-label="Fait"></button>'
      + '<button class="kid-t" data-act="kidopen">' + esc(k.title || "Sans titre") + '<span class="w">' + esc(k.h || k.boardId ? placeLabel(k) : "Imbriqué") + "</span></button></div>").join("");
    s += '<div class="add-row"><input id="fKid" placeholder="Ajouter un sous-objectif — Entrée" maxlength="300"></div></div>';
  }

  /* Pied */
  s += '<div class="f-foot"><span class="hint">Créé le ' + esc(fmtD(it.createdAt, { day: "numeric", month: "long", year: "numeric" }))
    + (it.done && it.doneAt ? " · fait le " + esc(fmtD(it.doneAt, { day: "numeric", month: "long" })) : "")
    + (it.carried ? " · reporté " + it.carried + " fois" : "") + "</span>"
    + '<div class="f-acts">' + (it.repeat ? "" : '<button class="btn ghost" data-act="dup">Dupliquer</button>')
    + '<button class="btn danger" data-act="del">' + icon("trash") + "Supprimer</button></div></div>";
  return s;
}

function bind(body, occ) {
  const it0 = () => find(current);
  const grow = (ta) => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + 2 + "px"; };
  const t = body.querySelector("#fTitle"); if (t) grow(t);

  body.oninput = (e) => {
    const it = it0(); if (!it) return;
    const f = e.target.dataset.f;
    if (f === "title") { it.title = e.target.value; grow(e.target); commit(); }
    else if (f === "note") { it.note = e.target.value; commit(); }
  };
  if (body._fo) body.removeEventListener("focusout", body._fo);
  body._fo = (e) => {
    const it = it0(); if (!it || e.target.id !== "fTitle") return;
    const tags = hashTags(it.title);
    if (tags.length) {
      it.tags = Array.from(new Set(it.tags.concat(tags)));
      it.title = stripTags(it.title) || it.title;
      commit(); paint(occ);
    }
  };
  body.addEventListener("focusout", body._fo);
  body.onchange = async (e) => {
    const it = it0(); if (!it) return;
    const f = e.target.dataset.f, v = e.target.value;
    if (f === "date" && v) { moveTo(it.id, "day", v, null); }
    else if (f === "time") { it.time = v; if (v && !it.dur) it.dur = 60; }
    else if (f === "dur") { it.dur = +v || 60; }
    else if (f === "remind") { it.remind = v; if (ui.fired && ui.fired.ids) { delete ui.fired.ids[it.id]; saveUI(true); } }
    else if (f === "freq") {
      if (!v) {
        if (it.repeat) {
          it.repeat = null;
          S.state.items.forEach((x) => { if (x.seriesId === it.id) x.seriesId = ""; });
          renumberCol(it.h, it.key, it, null);
        }
      } else {
        const was = it.repeat;
        it.repeat = { freq: v, n: was ? was.n : 1, days: was ? was.days : [], until: was ? was.until : "" };
        it.done = false; it.doneAt = null;
        if (!was && it.boardId) { it.boardId = null; it.listId = null; }
      }
    } else if (f === "n" && it.repeat) { it.repeat.n = Math.max(1, Math.min(99, parseInt(v, 10) || 1)); }
    else if (f === "until" && it.repeat) { it.repeat.until = v; }
    else if (f === "board") {
      if (v) { const b = S.state.boards.find((x) => x.id === v); setBoard(it.id, v, b.lists[0].id, null); }
      else setBoard(it.id, null, null, null);
    } else if (f === "list") { setBoard(it.id, it.boardId, v, null); }
    else if (f === "parent") { it.parent = v; }
    else return;
    commit(); paint(occ);
  };
  body.onkeydown = (e) => {
    const it = it0(); if (!it) return;
    if (e.target.id === "fTitle" && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
    if (e.target.id === "fTag" && (e.key === "Enter" || e.key === ",")) {
      e.preventDefault();
      const v = e.target.value.trim().replace(/^#/, "").toLowerCase();
      if (v && !it.tags.includes(v)) { it.tags.push(v); commit(); }
      paint(occ);
      const n = document.getElementById("fTag"); if (n) n.focus();
    }
    if (e.target.id === "fKid" && e.key === "Enter") {
      e.preventDefault();
      const v = e.target.value.trim(); if (!v) return;
      createItem({ spaceId: it.spaceId, title: v, parent: it.id });
      commit(); paint(occ);
      const n = document.getElementById("fKid"); if (n) n.focus();
    }
  };
  body.onclick = async (e) => {
    const it = it0(); if (!it) return;
    const box = e.target.closest("#fNoteView .box");
    if (box) { it.note = toggleTaskLine(it.note, +box.dataset.line); commit(); paint(occ); return; }
    const b = e.target.closest("button"); if (!b) return;
    const act = b.dataset.act;
    if (b.dataset.tone != null && b.classList.contains("tone")) { it.tone = b.dataset.tone; commit(); paint(occ); return; }
    if (b.dataset.emoji != null) { it.emoji = b.dataset.emoji; emojiOpen = false; commit(); paint(occ); return; }
    if (b.dataset.note) { noteMode = b.dataset.note; paint(occ); if (noteMode === "edit") { const n = document.getElementById("fNote"); if (n) n.focus(); } return; }
    if (b.dataset.untag) { it.tags = it.tags.filter((x) => x !== b.dataset.untag); commit(); paint(occ); return; }
    if (b.dataset.wd != null && it.repeat) {
      const i = +b.dataset.wd, days = it.repeat.days.length ? it.repeat.days.slice() : [weekday(it.key)];
      const k = days.indexOf(i);
      if (k >= 0) { if (days.length > 1) days.splice(k, 1); } else days.push(i);
      it.repeat.days = days.sort(); commit(); paint(occ); return;
    }
    if (b.dataset.mh != null) {
      const H = b.dataset.mh;
      if (!H) unplace(it.id);
      else if (H !== it.h) moveTo(it.id, H, periodOf(H, it.h ? anchorDay(it.h, it.key) : today()), null);
      commit(); paint(occ); return;
    }
    if (b.dataset.mstep) { moveTo(it.id, it.h, shiftPeriod(it.h, it.key, +b.dataset.mstep), null); commit(); paint(occ); return; }
    if (act === "mnow") { moveTo(it.id, it.h, periodOf(it.h, today()), null); commit(); paint(occ); return; }
    if (act === "emoji") { emojiOpen = !emojiOpen; paint(occ); return; }
    if (act === "done") { toggle(it.id); commit(); paint(occ); return; }
    if (act === "kidtog") { toggle(b.closest("[data-kid]").dataset.kid); commit(); paint(occ); return; }
    if (act === "kidopen") { tidy(); openItem(b.closest("[data-kid]").dataset.kid); return; }
    if (act === "detach") {
      const m = materialize(it, b.dataset.occ);
      commit(); toast("Occurrence détachée de la série"); openItem(m.id); return;
    }
    if (act === "skipocc") {
      const snap = snapshot([it.id].concat(S.state.items.filter((x) => x.seriesId === it.id).map((x) => x.id)));
      skipOccurrence(it.id, b.dataset.occ); commit(); closeSheet();
      toast("Occurrence passée", () => restore(snap)); return;
    }
    if (act === "dup") {
      const c = createItem({
        spaceId: it.spaceId, title: it.title, h: it.h, key: it.key, boardId: it.boardId, listId: it.listId, parent: it.parent,
        note: it.note, tags: it.tags.slice(), tone: it.tone, emoji: it.emoji, time: it.time, dur: it.dur, keepTags: true,
      });
      commit(); toast("Dupliqué"); openItem(c.id); return;
    }
    if (act === "del") {
      const ids = removalSet(it.id);
      const nested = S.state.items.filter((x) => ids.includes(x.id) && x.id !== it.id && !x.h && !x.boardId).length;
      const ok = await ask("Supprimer « " + trunc(it.title || "cet élément", 60) + " »"
        + (it.repeat ? " et ses occurrences à venir" : "") + (nested ? " avec ses " + nested + " sous-objectif" + (nested > 1 ? "s" : "") : "") + " ?",
      [{ v: true, label: "Supprimer", kind: "danger" }]);
      if (!ok) return;
      const snap = snapshot(ids);
      remove(it.id); commit(); closeSheet();
      toast("Supprimé", () => restore(snap));
    }
  };
}

/* Saisie rapide d'un nouvel élément, depuis n'importe où (touche N, bouton +). */
export function quickAdd(defaults) {
  defaults = defaults || {};
  const H = defaults.h === undefined ? "day" : defaults.h;
  const html = '<div class="qa"><textarea id="qaTitle" rows="2" placeholder="Que veux-tu accomplir ? #étiquette" maxlength="300"></textarea>'
    + '<div class="lbl">Où</div><div class="seg wrap" id="qaH">'
    + '<button data-h="" aria-pressed="' + !H + '">Sans date</button>'
    + HZ.map((x) => '<button data-h="' + x.id + '" aria-pressed="' + (x.id === H) + '">' + x.one + "</button>").join("") + "</div>"
    + '<div class="qa-when" id="qaWhen"></div>'
    + '<div class="f-acts end"><button class="btn primary" id="qaGo">Ajouter</button></div></div>';
  const body = openSheet("Nouvel élément", html, {});
  let h = H, k = defaults.key || (H ? periodOf(H, today()) : null);
  const paintWhen = () => {
    document.querySelectorAll("#qaH [data-h]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.h === (h || "")));
    document.getElementById("qaWhen").innerHTML = h && h !== "life"
      ? '<div class="stepper"><button class="icon-btn" data-qs="-1" aria-label="Avant">' + icon("left") + "</button><b>" + esc(where(h, k)) + "</b>"
        + '<button class="icon-btn" data-qs="1" aria-label="Après">' + icon("right") + "</button>"
        + (h === "day" ? '<input type="date" id="qaDate" value="' + esc(k) + '">' : "") + "</div>" : "";
  };
  paintWhen();
  const go = () => {
    const v = document.getElementById("qaTitle").value.trim();
    if (!v) { document.getElementById("qaTitle").focus(); return; }
    const it = createItem(Object.assign({ title: v, h: h || null, key: h ? k : null }, defaults.extra || {}));
    commit(); closeSheet();
    toast("Ajouté · " + placeLabel(it));
  };
  body.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.h != null) { h = b.dataset.h || null; k = h ? periodOf(h, today()) : null; paintWhen(); }
    if (b.dataset.qs) { k = shiftPeriod(h, k, +b.dataset.qs); paintWhen(); }
    if (b.id === "qaGo") go();
  };
  body.onchange = (e) => { if (e.target.id === "qaDate" && e.target.value) { k = e.target.value; paintWhen(); } };
  body.onkeydown = (e) => { if (e.target.id === "qaTitle" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } };
  const qt = document.getElementById("qaTitle");
  try { qt.focus({ preventScroll: true }); } catch (e) { qt.focus(); }
}

export { uid };
