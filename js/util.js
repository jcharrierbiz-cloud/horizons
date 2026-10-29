/* Petits outils partagés. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid() {
  try { return crypto.randomUUID(); }
  catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;");
}

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
export function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
export function plural(n, one, many) { return n + " " + (n > 1 ? (many || one + "s") : one); }

export function deepCopy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

/* Mots-dièse d'un intitulé : « Appeler Paul #client #urgent » → ["client","urgent"]. */
export function hashTags(text) {
  const out = [];
  String(text || "").replace(/(^|\s)#([\p{L}\p{N}_-]{1,40})/gu, (m, sp, t) => {
    const k = t.toLowerCase();
    if (!out.includes(k)) out.push(k);
    return m;
  });
  return out;
}
export function stripTags(text) {
  return String(text || "").replace(/(^|\s)#([\p{L}\p{N}_-]{1,40})/gu, "$1").replace(/\s{2,}/g, " ").trim();
}

export const TONES = [
  { id: "rouge", hex: "#e5534b", name: "Rouge" },
  { id: "orange", hex: "#ec8a37", name: "Orange" },
  { id: "jaune", hex: "#d9b02b", name: "Jaune" },
  { id: "vert", hex: "#3fa66a", name: "Vert" },
  { id: "menthe", hex: "#2fa6a0", name: "Menthe" },
  { id: "bleu", hex: "#3d7fe0", name: "Bleu" },
  { id: "violet", hex: "#7c62e0", name: "Violet" },
  { id: "rose", hex: "#d8589a", name: "Rose" },
  { id: "gris", hex: "#8a8f98", name: "Gris" },
];
export function toneHex(id) {
  const t = TONES.find((x) => x.id === id);
  return t ? t.hex : "";
}

export const EMOJIS = ["🎯", "⭐", "🔥", "💡", "📌", "✅", "📚", "🏃", "💪", "🧘", "💰", "💼", "📈", "🏠", "✈️", "❤️",
  "🎨", "🎵", "🍎", "💤", "🧠", "🛠️", "📝", "📞", "🌱", "🌍", "🎓", "👨‍👩‍👧", "🙏", "🚀", "🏆", "⏳"];

export function deviceName() {
  const u = navigator.userAgent || "";
  if (/Android/i.test(u)) return "Android";
  if (/iPhone|iPad|iPod/i.test(u)) return "iOS";
  if (/Windows/i.test(u)) return "Windows";
  if (/Macintosh/i.test(u)) return "Mac";
  return "Ordinateur";
}

export function ago(isoStr) {
  if (!isoStr) return "jamais";
  const s = Math.round((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 60) return "à l'instant";
  if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
  if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
  return "il y a " + Math.round(s / 86400) + " j";
}

export function isTyping(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}
