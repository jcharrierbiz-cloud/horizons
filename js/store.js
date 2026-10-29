/* L'état de l'application, sa sauvegarde locale et le rythme des rendus.
   Tout tient dans un seul document : c'est ce qui permet de l'exporter et de
   l'importer d'un bloc. */

import { uid, deepCopy } from "./util.js";
import { HZ, hzIdx, validKey, periodOf, today, toMin } from "./dates.js";

const KEY = "horizons-v1";
export let storageOK = true;

export const S = { state: null };   // S.state est le document courant
let applying = false;
const hooks = { render: [], afterSave: [] };

/* ── Stockage ── */
function readRaw() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* illisible */ }
  return null;
}
function probe() {
  try {
    localStorage.setItem("horizons-probe", "1");
    const ok = localStorage.getItem("horizons-probe") === "1";
    localStorage.removeItem("horizons-probe");
    return ok;
  } catch (e) { return false; }
}

export function seed() {
  const sp = uid(), b = uid();
  return {
    v: 1, rev: 0, touchedAt: "",
    items: [],
    spaces: [{ id: sp, name: "Personnel", emoji: "🌱" }],
    boards: [{
      id: b, spaceId: sp, name: "Idées", emoji: "💡", tone: "", view: "kanban",
      lists: [{ id: uid(), name: "À explorer", collapsed: false }, { id: uid(), name: "Retenues", collapsed: false }],
    }],
    climbs: [], runs: [],
    settings: defaultSettings(),
  };
}
/* Réglages enregistrés avec les données (donc dans l'export) : ce qui change leur comportement. */
function defaultSettings() {
  return { carry: true };
}

/* Affichage : propre à chaque appareil, hors de l'export — importer une
   sauvegarde ne change ni la vue, ni le thème, ni les colonnes repliées. */
const UIKEY = "horizons-ui-v1";
export const ui = Object.assign({
  space: "", theme: "system", hideDone: false, hzMode: "all", hzOffsets: {}, hzCollapsed: {},
  calMonth: "", calMode: "month", lastRoute: "#/horizons",
}, (() => { try { return JSON.parse(localStorage.getItem(UIKEY) || "{}") || {}; } catch (e) { return {}; } })());
["hzOffsets", "hzCollapsed"].forEach((k) => { if (!ui[k] || typeof ui[k] !== "object") ui[k] = {}; });
export function saveUI(noRender) {
  try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { /* stockage indisponible */ }
  if (!noRender) scheduleRender();
}

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (typeof x === "string" ? x : "");

export function normalize(d) {
  d = d && typeof d === "object" ? d : {};
  const s = {
    v: 1,
    rev: typeof d.rev === "number" && d.rev >= 0 ? d.rev : 0,
    touchedAt: str(d.touchedAt),
    items: arr(d.items).filter((x) => x && typeof x === "object"),
    spaces: arr(d.spaces).filter((x) => x && typeof x === "object"),
    boards: arr(d.boards).filter((x) => x && typeof x === "object"),
    climbs: arr(d.climbs).filter((x) => x && typeof x === "object"),
    runs: arr(d.runs).filter((x) => x && typeof x === "object"),
    settings: d.settings && typeof d.settings === "object" ? d.settings : {},
  };
  if (!s.spaces.length) s.spaces.push({ id: uid(), name: "Personnel", emoji: "🌱" });
  s.spaces.forEach((sp, i) => {
    if (!sp.id) sp.id = uid();
    sp.name = str(sp.name) || "Espace " + (i + 1);
    sp.emoji = str(sp.emoji);
  });
  const spaceIds = new Set(s.spaces.map((x) => x.id));
  const firstSpace = s.spaces[0].id;

  s.boards.forEach((b, i) => {
    if (!b.id) b.id = uid();
    if (!spaceIds.has(b.spaceId)) b.spaceId = firstSpace;
    b.name = str(b.name) || "Tableau " + (i + 1);
    b.emoji = str(b.emoji); b.tone = str(b.tone);
    b.view = b.view === "list" ? "list" : "kanban";
    b.lists = arr(b.lists).filter((l) => l && typeof l === "object");
    if (!b.lists.length) b.lists.push({ id: uid(), name: "À faire", collapsed: false });
    b.lists.forEach((l, j) => { if (!l.id) l.id = uid(); l.name = str(l.name) || "Liste " + (j + 1); l.collapsed = !!l.collapsed; });
  });
  const boards = new Map(s.boards.map((b) => [b.id, b]));

  const t = today();
  s.items.forEach((it) => {
    if (!it.id) it.id = uid();
    if (!spaceIds.has(it.spaceId)) it.spaceId = firstSpace;
    it.title = it.title == null ? "" : String(it.title);
    it.done = !!it.done;
    it.doneAt = it.done ? str(it.doneAt) || t : null;
    it.createdAt = str(it.createdAt) || t;
    if (it.h != null && (hzIdx(it.h) < 0 || !validKey(it.h, it.key))) {
      it.h = hzIdx(it.h) >= 0 ? it.h : "day";
      it.key = periodOf(it.h, t);
    }
    if (it.h == null) { it.h = null; it.key = null; }
    if (typeof it.order !== "number") it.order = 0;
    const b = boards.get(it.boardId);
    if (!b) { it.boardId = null; it.listId = null; }
    else if (!b.lists.some((l) => l.id === it.listId)) it.listId = b.lists[0].id;
    if (typeof it.border !== "number") it.border = 0;
    it.parent = str(it.parent);
    it.collapsed = !!it.collapsed;
    it.note = str(it.note);
    it.tags = arr(it.tags).filter((x) => typeof x === "string" && x).map((x) => x.toLowerCase());
    it.tone = str(it.tone); it.emoji = str(it.emoji);
    it.time = toMin(it.time) == null ? "" : it.time;
    it.dur = typeof it.dur === "number" && it.dur > 0 ? it.dur : 60;
    it.remind = toMin(it.remind) == null ? "" : it.remind;
    it.lastFired = str(it.lastFired);
    if (it.repeat && typeof it.repeat === "object" && it.h) {
      const r = it.repeat;
      r.freq = ["daily", "weekdays", "weekly", "monthly", "yearly", "period"].includes(r.freq) ? r.freq : "period";
      r.n = typeof r.n === "number" && r.n >= 1 ? Math.floor(r.n) : 1;
      r.days = arr(r.days).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
      r.until = str(r.until);
    } else it.repeat = null;
    it.skip = arr(it.skip).filter((x) => typeof x === "string");
    it.seriesId = str(it.seriesId); it.occ = str(it.occ);
    it.runId = str(it.runId);
    it.carried = typeof it.carried === "number" ? it.carried : 0;
  });
  /* Un parent doit exister et ne pas créer de boucle. */
  const byId = new Map(s.items.map((x) => [x.id, x]));
  s.items.forEach((it) => {
    let p = it.parent, n = 0;
    while (p && n < 50) { if (p === it.id) { it.parent = ""; break; } const q = byId.get(p); p = q ? q.parent : ""; n++; }
    if (it.parent && !byId.has(it.parent)) it.parent = "";
  });

  s.climbs.forEach((c) => {
    if (!c.id) c.id = uid();
    c.title = str(c.title) || "Ascension"; c.emoji = str(c.emoji) || "⛰️"; c.desc = str(c.desc);
    c.steps = arr(c.steps).filter((x) => x && typeof x.title === "string").map((x) => ({ d: Math.max(0, x.d | 0), title: x.title }));
  });
  s.runs.forEach((r) => { if (!r.id) r.id = uid(); r.title = str(r.title); r.emoji = str(r.emoji); r.start = str(r.start) || t; r.climbId = str(r.climbId); });

  const st = Object.assign(defaultSettings(), s.settings);
  st.carry = st.carry !== false;
  s.settings = st;

  /* Champs ajoutés par une version plus récente : conservés tels quels, pour
     qu'une sauvegarde importée dans une version plus ancienne ne les perde pas. */
  Object.keys(d).forEach((k) => { if (!(k in s)) s[k] = d[k]; });
  return s;
}

export function load() {
  storageOK = probe();
  const saved = readRaw();
  S.state = saved ? normalize(saved) : seed();
  writeLocal();   // la version réparée remplace aussitôt celle qui était abîmée
}
function writeLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(S.state)); return true; }
  catch (e) { storageOK = false; return false; }
}

/* Toute écriture fait avancer la révision du document. */
export function commit(opts) {
  if (!applying) {
    S.state.rev = (S.state.rev || 0) + 1;
    S.state.touchedAt = new Date().toISOString();
  }
  writeLocal();
  if (!applying) hooks.afterSave.forEach((f) => f());
  if (!(opts && opts.silent)) scheduleRender();
}
/* Remplacement complet (import, tout effacer, annulation). */
export function replaceState(next, fromServer) {
  applying = !!fromServer;
  S.state = normalize(next);
  if (fromServer && typeof next.rev === "number") S.state.rev = next.rev;
  commit();
  applying = false;
}
export const onRender = (f) => hooks.render.push(f);
export const afterSave = (f) => hooks.afterSave.push(f);

/* ── Rendu ──
   Un rendu remplace le contenu de la vue. S'il tombait pendant qu'un doigt
   ou la souris est appuyé, le clic en cours viserait un élément disparu : on
   attend donc le relâchement. */
let pending = false, pressed = false;
export function scheduleRender() {
  if (pending) return;
  pending = true;
  if (pressed) return;
  requestAnimationFrame(flushRender);
}
function flushRender() {
  if (!pending || pressed) return;
  pending = false;
  hooks.render.forEach((f) => f());
}
export function renderNow() { pending = true; pressed = false; flushRender(); }
document.addEventListener("pointerdown", () => { pressed = true; }, true);
const release = () => {
  if (!pressed) return;
  pressed = false;
  if (pending) setTimeout(flushRender, 0);   // après le clic qui suit le relâchement
};
document.addEventListener("pointerup", release, true);
document.addEventListener("pointercancel", release, true);
document.addEventListener("dragend", release, true);

/* ── Annuler ──
   On photographie seulement les éléments touchés : annuler ne défait pas ce
   qui a été fait ailleurs entre-temps. */
export function snapshot(ids) {
  const map = new Map(S.state.items.map((x) => [x.id, x]));
  return ids.map((id) => ({ id, copy: map.has(id) ? deepCopy(map.get(id)) : null, at: S.state.items.indexOf(map.get(id)) }));
}
export function restore(snap) {
  snap.forEach(({ id, copy, at }) => {
    const i = S.state.items.findIndex((x) => x.id === id);
    if (copy) {
      if (i >= 0) S.state.items[i] = copy;
      else S.state.items.splice(Math.min(at < 0 ? S.state.items.length : at, S.state.items.length), 0, copy);
    } else if (i >= 0) S.state.items.splice(i, 1);
  });
  commit();
}

export const settings = () => S.state.settings;
export const space = () => S.state.spaces.find((x) => x.id === ui.space) || S.state.spaces[0];
export const spaceId = () => space().id;
export { HZ };
