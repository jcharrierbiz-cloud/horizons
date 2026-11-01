/* Fusion de deux versions du document, sans serveur ni horloge commune.
   Chaque entité (élément, espace, tableau, ascension, programme en cours, et les
   réglages) porte l'heure de sa dernière modification dans `stamps` ; chaque
   suppression laisse une pierre tombale datée dans `gone`. La fusion garde, pour
   chaque entité, la version modifiée le plus récemment, sauf si elle a été
   supprimée après. Deux appareils qui fusionnent les mêmes versions obtiennent
   le même résultat, dans n'importe quel ordre. */

export const KINDS = ["items", "spaces", "boards", "climbs", "runs"];
const ONE = { items: "item", spaces: "space", boards: "board", climbs: "climb", runs: "run" };
export const keyOf = (kind, id) => ONE[kind] + ":" + id;
const TOMB_DAYS = 120;   // au-delà, une pierre tombale est oubliée

const ok = (e) => e && typeof e === "object" && e.id;

/* JSON aux clés triées : deux objets égaux s'écrivent pareil, quel que soit l'ordre de leurs clés. */
export function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

/* Empreinte de chaque entité, pour repérer ce qu'un enregistrement a changé. */
export function snapOf(doc) {
  const m = new Map();
  KINDS.forEach((k) => (doc[k] || []).forEach((e) => { if (ok(e)) m.set(keyOf(k, e.id), stable(e)); }));
  m.set("settings", stable(doc.settings || {}));
  return m;
}

/* Date les changements entre deux empreintes : modifiés ou nouveaux → stamps, disparus → gone. */
export function stampChanges(doc, before, now) {
  const after = snapOf(doc), stamps = doc.stamps || (doc.stamps = {}), gone = doc.gone || (doc.gone = {});
  after.forEach((v, k) => { if (before.get(k) !== v) { stamps[k] = now; delete gone[k]; } });
  before.forEach((_, k) => { if (!after.has(k)) { gone[k] = now; delete stamps[k]; } });
  return after;
}

export function pruneGone(gone, now) {
  const out = {}, limit = now - TOMB_DAYS * 86400000;
  Object.keys(gone || {}).forEach((k) => { const t = +gone[k]; if (t > limit) out[k] = t; });
  return out;
}

export function mergeDocs(a, b, now) {
  now = now || Date.now();
  const sa = a.stamps || {}, sb = b.stamps || {};
  const gone = {};
  [a.gone || {}, b.gone || {}].forEach((g) => Object.keys(g).forEach((k) => { gone[k] = Math.max(gone[k] || 0, +g[k] || 0); }));
  const newer = (b.touchedAt || "") > (a.touchedAt || "") ? [b, a] : [a, b];
  const out = Object.assign({}, newer[1], newer[0]);   // champs inconnus : la version la plus récente l'emporte
  const stamps = {};
  /* Entre deux versions d'une même entité : la plus récente ; à égalité, un choix
     arbitraire mais identique sur tous les appareils. */
  const pick = (key, ea, eb) => {
    const ta = ea ? +sa[key] || 0 : -1, tb = eb ? +sb[key] || 0 : -1;
    if (ta !== tb) return ta > tb ? [ea, ta] : [eb, tb];
    return stable(ea) >= stable(eb) ? [ea, ta] : [eb, tb];
  };
  KINDS.forEach((kind) => {
    const ma = new Map((a[kind] || []).filter(ok).map((e) => [e.id, e]));
    const mb = new Map((b[kind] || []).filter(ok).map((e) => [e.id, e]));
    const ids = [], seen = new Set();
    newer.forEach((d) => (d[kind] || []).forEach((e) => { if (ok(e) && !seen.has(e.id)) { seen.add(e.id); ids.push(e.id); } }));
    out[kind] = [];
    ids.forEach((id) => {
      const key = keyOf(kind, id), [e, t] = pick(key, ma.get(id), mb.get(id));
      if (gone[key] && gone[key] >= t) return;   // supprimé après sa dernière modification
      delete gone[key];
      if (t > 0) stamps[key] = t;
      out[kind].push(e);
    });
  });
  const [st, t] = pick("settings", a.settings || {}, b.settings || {});
  out.settings = st;
  if (t > 0) stamps.settings = t;
  out.stamps = stamps;
  out.gone = pruneGone(gone, now);
  out.rev = Math.max(a.rev || 0, b.rev || 0);
  out.touchedAt = newer[0].touchedAt || "";
  return out;
}

/* Contenu d'un document, sans ce qui ne compte que pour un appareil (révision
   locale, heure du dernier enregistrement, dates de modification). Deux
   documents de même empreinte n'ont rien à s'échanger. */
export function fingerprint(doc) {
  const parts = KINDS.map((k) => k + "=" + (doc[k] || []).filter(ok).map(stable).sort().join("\u0001"));
  parts.push(stable(doc.settings || {}), stable(doc.gone || {}));
  return parts.join("\u0002");
}
