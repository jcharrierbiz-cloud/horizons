/* Les éléments : objectifs, tâches, sous-objectifs — un seul type.

   Un élément peut être :
   • posé dans une période d'un horizon (h + key) — c'est ce qui le fait
     apparaître dans la vue Horizons et, pour un jour, dans le calendrier ;
   • rangé dans une liste d'un tableau (boardId + listId) ;
   • les deux, ou aucun des deux : un élément sans place qui a un parent est
     un sous-objectif, affiché imbriqué sous son parent.
   Un élément posé qui a un parent est « rattaché » : il vit dans sa propre
   colonne et fait progresser son parent.

   Un élément qui se répète (repeat) est un modèle : il n'apparaît jamais
   lui-même. Chaque période où la règle tombe montre une occurrence virtuelle ;
   cocher, déplacer ou détacher une occurrence la rend réelle (seriesId + occ),
   et la virtuelle correspondante disparaît. */

import { S, settings, spaceId } from "./store.js";
import { uid, hashTags, stripTags } from "./util.js";
import {
  HZ, hzIdx, periodOf, periodSpan, periodDiff, isoWeekKey, weekday, daysBetween, dNum, today, where,
} from "./dates.js";

export const colKey = (h, k) => h + "|" + k;

/* ── Index de travail, reconstruit à chaque rendu ── */
export function buildIndex(spaceArg) {
  const sp = spaceArg || spaceId();
  const byId = new Map(), cols = new Map(), lists = new Map(), kids = new Map(), occ = new Map();
  const series = [];
  S.state.items.forEach((it, i) => {
    byId.set(it.id, it);
    if (it.spaceId !== sp) return;
    if (it.repeat) { series.push(it); return; }
    if (it.seriesId) occ.set(it.seriesId + "|" + it.occ, it);
    if (it.h) push(cols, colKey(it.h, it.key), it);
    if (it.boardId) push(lists, it.boardId + "|" + it.listId, it);
  });
  S.state.items.forEach((it) => { if (it.parent && byId.has(it.parent)) push(kids, it.parent, it); });
  cols.forEach((l) => l.sort((a, b) => a.order - b.order));
  lists.forEach((l) => l.sort((a, b) => a.border - b.border));
  return { space: sp, byId, cols, lists, kids, occ, series };
}
function push(map, k, v) { const l = map.get(k); if (l) l.push(v); else map.set(k, [v]); }

/* Éléments d'une colonne, occurrences virtuelles comprises. */
export function colItems(ix, h, k) {
  const real = ix.cols.get(colKey(h, k)) || [];
  const virt = [];
  ix.series.forEach((s) => {
    if (s.h !== h || !matches(s, k) || ix.occ.has(s.id + "|" + k) || s.skip.includes(k)) return;
    virt.push(virtualOf(s, k));
  });
  virt.sort((a, b) => (a.time || "99") .localeCompare(b.time || "99") || a.order - b.order);
  return real.concat(virt);
}
export function virtualOf(s, k) {
  return {
    id: s.id + "@" + k, virtual: true, seriesId: s.id, occ: k, spaceId: s.spaceId,
    title: s.title, done: false, h: s.h, key: k, order: s.order, tone: s.tone, emoji: s.emoji,
    tags: s.tags, note: s.note, time: s.time, dur: s.dur, remind: s.remind, parent: s.parent,
    repeat: s.repeat, boardId: null, listId: null, carried: 0, runId: "",
  };
}
export const listItems = (ix, boardId, listId) => ix.lists.get(boardId + "|" + listId) || [];
export const kidsOf = (ix, id) => ix.kids.get(id) || [];
/* Sous-objectifs imbriqués : enfants sans place à eux. */
export const nestedKids = (ix, id) => kidsOf(ix, id).filter((c) => !c.h && !c.boardId && !c.repeat);
export function progressOf(ix, it) {
  const k = kidsOf(ix, it.id).filter((c) => !c.repeat);
  if (!k.length) return null;
  return { done: k.filter((c) => c.done).length, total: k.length };
}

/* ── Récurrence ── */
export function matches(s, k) {
  const r = s.repeat, h = s.h, start = s.key;
  if (!r || !h || k < start) return false;
  if (r.until && periodSpan(h, k)[0] > r.until) return false;
  if (h !== "day") return periodDiff(h, start, k) % r.n === 0;
  switch (r.freq) {
    case "daily": return daysBetween(start, k) % r.n === 0;
    case "weekdays": return weekday(k) < 5;
    case "weekly": {
      const days = r.days.length ? r.days : [weekday(start)];
      return days.includes(weekday(k)) && periodDiff("week", isoWeekKey(start), isoWeekKey(k)) % r.n === 0;
    }
    case "monthly":
      return dNum(k).getDate() === dNum(start).getDate() && periodDiff("month", start.slice(0, 7), k.slice(0, 7)) % r.n === 0;
    case "yearly":
      return k.slice(5) === start.slice(5) && (+k.slice(0, 4) - +start.slice(0, 4)) % r.n === 0;
    default: return daysBetween(start, k) % r.n === 0;
  }
}
export function repeatLabel(it) {
  const r = it.repeat; if (!r) return "";
  const every = (n, one, many) => (n === 1 ? "Chaque " + one : "Tous les " + n + " " + many);
  if (it.h !== "day") {
    const names = { week: ["semaine", "semaines"], month: ["mois", "mois"], quarter: ["trimestre", "trimestres"],
      year: ["année", "ans"], decade: ["décennie", "décennies"] }[it.h] || ["période", "périodes"];
    return every(r.n, names[0], names[1]);
  }
  if (r.freq === "weekdays") return "Du lundi au vendredi";
  if (r.freq === "weekly") {
    const d = r.days.length ? r.days : [weekday(it.key)];
    const names = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
    return (r.n === 1 ? "Chaque semaine" : "Toutes les " + r.n + " semaines") + " · " + d.slice().sort().map((x) => names[x]).join(" ");
  }
  if (r.freq === "monthly") return every(r.n, "mois", "mois");
  if (r.freq === "yearly") return every(r.n, "année", "ans");
  return r.n === 1 ? "Chaque jour" : "Tous les " + r.n + " jours";
}

/* ── Accès ── */
export const find = (id) => S.state.items.find((x) => x.id === id) || null;
/* « abc@2026-10-29 » désigne une occurrence virtuelle. */
export function resolve(id) {
  if (id && id.includes("@")) {
    const [sid, k] = id.split("@");
    const s = find(sid);
    return s ? { virtual: true, series: s, key: k, it: virtualOf(s, k) } : null;
  }
  const it = find(id);
  return it ? { virtual: false, it } : null;
}
export function materialize(s, k, extra) {
  const it = createItem({
    spaceId: s.spaceId, title: s.title, h: s.h, key: k, tone: s.tone, emoji: s.emoji, tags: s.tags.slice(),
    note: s.note, time: s.time, dur: s.dur, remind: s.remind, parent: s.parent, seriesId: s.id, occ: k,
    keepTags: true,
  });
  Object.assign(it, extra || {});
  return it;
}
/* Rend réel ce qu'on manipule ; renvoie l'élément réel. */
export function real(id) {
  const r = resolve(id); if (!r) return null;
  return r.virtual ? materialize(r.series, r.key) : r.it;
}

/* ── Création et ordre ── */
export function createItem(f) {
  const t = today();
  const it = Object.assign({
    id: uid(), spaceId: spaceId(), title: "", done: false, doneAt: null, createdAt: t,
    h: null, key: null, order: 0, boardId: null, listId: null, border: 0, parent: "", collapsed: false,
    note: "", tags: [], tone: "", emoji: "", time: "", dur: 60, remind: "", lastFired: "",
    repeat: null, skip: [], seriesId: "", occ: "", runId: "", carried: 0,
  }, f || {});
  if (it.title && !(f && f.keepTags)) {
    const tags = hashTags(it.title);
    if (tags.length) { it.tags = Array.from(new Set(it.tags.concat(tags))); it.title = stripTags(it.title) || it.title; }
  }
  delete it.keepTags;
  S.state.items.push(it);
  if (it.h && !it.repeat) renumberCol(it.h, it.key, it, null, it.spaceId);
  if (it.boardId) renumberList(it.boardId, it.listId, it, null);
  return it;
}
export function renumberCol(h, k, it, beforeId, spaceId) {
  const sp = spaceId || it.spaceId;
  const list = S.state.items.filter((x) => x !== it && x.spaceId === sp && x.h === h && x.key === k && !x.repeat)
    .sort((a, b) => a.order - b.order);
  let at = list.length;
  if (beforeId) { const i = list.findIndex((x) => x.id === beforeId); if (i >= 0) at = i; }
  list.splice(at, 0, it);
  list.forEach((x, i) => { x.order = i; });
}
export function renumberList(boardId, listId, it, beforeId) {
  const list = S.state.items.filter((x) => x !== it && x.boardId === boardId && x.listId === listId)
    .sort((a, b) => a.border - b.border);
  let at = list.length;
  if (beforeId) { const i = list.findIndex((x) => x.id === beforeId); if (i >= 0) at = i; }
  list.splice(at, 0, it);
  list.forEach((x, i) => { x.border = i; });
}

/* ── Déplacements ── */
/* Un parent posé dans un horizon doit être strictement plus large que son enfant posé. */
function linkOk(child, parent) {
  if (!child.h || !parent.h) return true;
  return hzIdx(parent.h) > hzIdx(child.h);
}
export function moveTo(id, h, k, beforeId) {
  const it = real(id); if (!it) return null;
  if (it.repeat) {             // déplacer un modèle déplace le début de la série
    it.h = h; it.key = k;
    if (h !== "day") { it.repeat.freq = "period"; it.time = ""; }
    return it;
  }
  it.h = h; it.key = k;
  if (h !== "day") it.time = "";
  const p = it.parent && find(it.parent);
  if (p && !linkOk(it, p)) it.parent = "";
  S.state.items.forEach((c) => { if (c.parent === it.id && !linkOk(c, it)) c.parent = ""; });
  renumberCol(h, k, it, beforeId);
  return it;
}
export function unplace(id) {
  const it = real(id); if (!it) return null;
  it.h = null; it.key = null; it.time = ""; it.repeat = null;
  return it;
}
export function setBoard(id, boardId, listId, beforeId) {
  const it = real(id); if (!it) return null;
  if (it.repeat) return it;
  it.boardId = boardId || null; it.listId = boardId ? listId : null;
  if (boardId) renumberList(boardId, listId, it, beforeId);
  return it;
}
export function toggle(id) {
  const r = resolve(id); if (!r) return null;
  const it = r.virtual ? materialize(r.series, r.key) : r.it;
  it.done = !it.done;
  it.doneAt = it.done ? today() : null;
  return it;
}

/* Ce que touche une suppression : l'élément, ses sous-objectifs imbriqués
   (récursivement), et les éléments rattachés dont le lien saute. */
export function removalSet(id) {
  const out = [id], seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    S.state.items.forEach((c) => {
      if ((c.parent !== out[i] && c.seriesId !== out[i]) || seen.has(c.id)) return;
      seen.add(c.id); out.push(c.id);
    });
  }
  return out;
}
export function remove(id) {
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    S.state.items.forEach((c) => {
      if (c.parent && doomed.has(c.parent) && !doomed.has(c.id) && !c.h && !c.boardId) { doomed.add(c.id); grew = true; }
    });
  }
  S.state.items.forEach((c) => { if (c.parent && doomed.has(c.parent) && !doomed.has(c.id)) c.parent = ""; });
  /* Supprimer une série emporte ses occurrences non faites ; les faites restent, détachées. */
  S.state.items.forEach((c) => { if (doomed.has(c.seriesId) && !c.done) doomed.add(c.id); });
  S.state.items.forEach((c) => { if (doomed.has(c.seriesId)) c.seriesId = ""; });
  S.state.items = S.state.items.filter((x) => !doomed.has(x.id));
  return doomed.size;
}
export function skipOccurrence(seriesId, k) {
  const s = find(seriesId); if (!s) return;
  if (!s.skip.includes(k)) s.skip.push(k);
  const m = S.state.items.find((x) => x.seriesId === seriesId && x.occ === k && !x.done);
  if (m) S.state.items.splice(S.state.items.indexOf(m), 1);
}

/* ── Report automatique ──
   Ce qui n'est pas fait dans une période passée glisse dans la période en
   cours du même horizon. Restent sur place : les occurrences de séries et les
   étapes d'ascension (elles ont un sens à leur date). Renvoie les éléments
   déplacés. */
export function carryOver() {
  if (!settings().carry) return [];
  const t = today(), moved = [];
  S.state.items.forEach((it) => {
    if (it.done || !it.h || it.h === "life" || it.repeat || it.seriesId || it.runId) return;
    const now = periodOf(it.h, t);
    if (it.key >= now) return;
    it.key = now; it.carried = (it.carried || 0) + 1; it.order = 1e6 + moved.length;
    moved.push(it);
  });
  const touched = new Set(moved.map((x) => x.spaceId + "|" + colKey(x.h, x.key)));
  touched.forEach((ck) => {
    const [sp, h, k] = ck.split("|");
    S.state.items.filter((x) => x.spaceId === sp && x.h === h && x.key === k && !x.repeat)
      .sort((a, b) => a.order - b.order).forEach((x, i) => { x.order = i; });
  });
  return moved;
}

/* ── Rattachements possibles : éléments d'horizons plus larges qui couvrent la période ── */
export function parentCandidates(ix, it) {
  const out = [];
  if (!it.h) {
    /* Sans date : n'importe quel élément posé de l'espace, sauf ses descendants. */
    const banned = new Set(removalSet(it.id));
    HZ.slice().reverse().forEach((H) => {
      ix.cols.forEach((list, ck) => {
        if (!ck.startsWith(H.id + "|")) return;
        const k = ck.slice(H.id.length + 1);
        const items = list.filter((x) => !banned.has(x.id));
        if (items.length) out.push({ h: H.id, k, items });
      });
    });
    return out;
  }
  const span = periodSpan(it.h, it.key);
  for (let i = hzIdx(it.h) + 1; i < HZ.length; i++) {
    const H = HZ[i].id, keys = [periodOf(H, span[0])], k2 = periodOf(H, span[1]);
    if (!keys.includes(k2)) keys.push(k2);
    keys.forEach((K) => {
      const items = (ix.cols.get(colKey(H, K)) || []).filter((x) => x.id !== it.id);
      if (items.length) out.push({ h: H, k: K, items });
    });
  }
  return out;
}

/* Chemin d'un élément : « Semaine 44 · Tableau Idées » */
export function placeLabel(it) {
  const parts = [];
  if (it.h) parts.push(where(it.h, it.key));
  if (it.boardId) {
    const b = S.state.boards.find((x) => x.id === it.boardId);
    if (b) parts.push((b.emoji ? b.emoji + " " : "") + b.name);
  }
  return parts.join(" · ") || "Sans date";
}

/* Couleur propre, sinon celle du premier ancêtre qui en a une. */
export function effectiveTone(ix, it) {
  let n = 0, cur = it;
  while (cur && n < 20) {
    if (cur.tone) return cur.tone;
    cur = cur.parent ? ix.byId.get(cur.parent) : null; n++;
  }
  return "";
}

/* ── Recherche ── */
export function search(q, tag, withDone) {
  q = String(q || "").trim().toLowerCase();
  return S.state.items.filter((it) => {
    if (!withDone && it.done) return false;
    if (tag && !it.tags.includes(tag)) return false;
    if (!q) return !!tag;
    return (it.title + " " + it.note + " " + it.tags.map((t) => "#" + t).join(" ")).toLowerCase().includes(q);
  }).slice(0, 200);
}
export function allTags() {
  const m = new Map();
  S.state.items.forEach((it) => it.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
