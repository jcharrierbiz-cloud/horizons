/* Briques d'interface : panneau latéral (feuille du bas sur téléphone),
   toast avec annulation, boîte de confirmation, menu de choix, icônes. */

import { $, esc } from "./util.js";

/* ── Icônes (traits, 24×24) ── */
const P = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  horizons: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  climb: '<path d="m3 20 6-10 4 6 3-4 5 8z"/><path d="M14 6l2-2 2 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  collapse: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  expand: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  space: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  upload: '<path d="M12 21V9m0 0-4 4m4-4 4 4M4 3h16"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  zoom: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 17h.01"/>',
  life: '<path d="M6 3h12M6 21h12M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3"/>',
};
export function icon(name, cls) {
  return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
}

/* ── Panneau ── */
let sheetOpen = false, onClose = null, pushed = false, popPending = 0;
export const isSheetOpen = () => sheetOpen;
export function openSheet(title, html, opts) {
  opts = opts || {};
  const sh = $("#sheet"), sc = $("#scrim");
  if (!sheetOpen && !pushed) { try { history.pushState({ hzSheet: 1 }, ""); pushed = true; } catch (e) { /* cadre */ } }
  const body = $("#sheetBody");
  body.onclick = null; body.oninput = null; body.onchange = null; body.onkeydown = null;
  $("#sheetTitle").textContent = title;
  body.innerHTML = html;
  sh.classList.toggle("wide", !!opts.wide);
  sh.style.setProperty("--a", opts.tone || "var(--accent)");
  sc.hidden = false; sh.hidden = false;
  void sh.offsetWidth;
  sc.classList.add("on"); sh.classList.add("on");
  sheetOpen = true;
  onClose = opts.onClose || null;
  body.scrollTop = 0;
  return body;
}
export function closeSheet(fromBack) {
  if (!sheetOpen) return;
  sheetOpen = false;
  /* Le champ du panneau qui se ferme ne doit pas garder le clavier : les raccourcis reprennent tout de suite. */
  const a = document.activeElement;
  if (a && $("#sheet").contains(a) && a.blur) a.blur();
  if (pushed) { pushed = false; if (!fromBack) { try { popPending++; history.back(); } catch (e) { popPending--; } } }
  const sh = $("#sheet"), sc = $("#scrim");
  sc.classList.remove("on"); sh.classList.remove("on");
  setTimeout(() => { if (sheetOpen) return; sc.hidden = true; sh.hidden = true; $("#sheetBody").innerHTML = ""; }, 260);
  if (onClose) { const f = onClose; onClose = null; f(); }
}
export function setSheetTitle(t) { $("#sheetTitle").textContent = t; }
window.addEventListener("popstate", () => {
  if (popPending > 0) { popPending--; return; }
  if (sheetOpen) closeSheet(true); else pushed = false;
});

/* ── Toast ── */
let toastTimer = null, undoFn = null;
export function toast(msg, undo) {
  const el = $("#toast");
  $("#toastMsg").textContent = msg;
  el.hidden = false; void el.offsetWidth; el.classList.add("on");
  const act = $("#toastAct");
  act.hidden = !undo; undoFn = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 6500 : 2400);
}
function hideToast() {
  const el = $("#toast");
  el.classList.remove("on"); undoFn = null;
  setTimeout(() => { if (!el.classList.contains("on")) el.hidden = true; }, 240);
}
export function initToast() {
  $("#toastAct").onclick = () => { const f = undoFn; undoFn = null; hideToast(); if (f) f(); };
}

/* ── Boîte de dialogue : confirmation ou choix ── */
export function ask(message, options) {
  /* options : [{v, label, kind}] ; renvoie une promesse de la valeur choisie (null si fermé). */
  options = options || [{ v: true, label: "Confirmer", kind: "primary" }];
  return new Promise((res) => {
    const dlg = $("#dialog");
    dlg.innerHTML = '<div class="dlgBox" role="alertdialog" aria-modal="true"><p>' + esc(message) + "</p>"
      + '<div class="dlgBtns">' + options.map((o, i) => '<button class="btn ' + (o.kind || "") + '" data-i="' + i + '">' + esc(o.label) + "</button>").join("")
      + '<button class="btn ghost" data-i="-1">Annuler</button></div></div>';
    dlg.hidden = false;
    const done = (v) => { dlg.hidden = true; dlg.innerHTML = ""; document.removeEventListener("keydown", onKey, true); res(v); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } };
    document.addEventListener("keydown", onKey, true);
    dlg.onclick = (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) { if (e.target === dlg) done(null); return; }
      const i = +b.dataset.i;
      done(i < 0 ? null : options[i].v);
    };
    const first = dlg.querySelector("[data-i='0']"); if (first) first.focus();
  });
}

/* ── Petit menu ancré à un bouton ── */
export function menu(anchor, entries) {
  /* entries : [{label, act, danger}] → promesse de act */
  return new Promise((res) => {
    const m = $("#menu");
    m.innerHTML = entries.map((e, i) => e.sep ? '<hr>' : '<button data-i="' + i + '"' + (e.danger ? ' class="danger"' : "") + ">" + esc(e.label) + "</button>").join("");
    m.hidden = false;
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let x = Math.min(r.right - w, window.innerWidth - w - 8), y = r.bottom + 4;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4);
    m.style.left = Math.max(8, x) + "px"; m.style.top = y + "px";
    const close = (v) => {
      m.hidden = true; m.innerHTML = "";
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
      res(v);
    };
    const away = (e) => { if (!m.contains(e.target)) close(null); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    setTimeout(() => { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", key, true); }, 0);
    m.onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) close(entries[+b.dataset.i].act); };
  });
}

/* ── Saisie d'un texte court (nom de liste, de tableau…) ── */
export function promptText(message, value, okLabel) {
  return new Promise((res) => {
    const dlg = $("#dialog");
    dlg.innerHTML = '<div class="dlgBox" role="dialog" aria-modal="true"><p>' + esc(message) + "</p>"
      + '<input id="dlgIn" maxlength="80" value="' + esc(value || "") + '">'
      + '<div class="dlgBtns"><button class="btn primary" data-i="ok">' + esc(okLabel || "Valider") + "</button>"
      + '<button class="btn ghost" data-i="no">Annuler</button></div></div>';
    dlg.hidden = false;
    const inp = $("#dlgIn");
    const done = (v) => { dlg.hidden = true; dlg.innerHTML = ""; document.removeEventListener("keydown", onKey, true); res(v); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(null); }
      if (e.key === "Enter" && e.target === inp) { e.preventDefault(); done(inp.value.trim() || null); }
    };
    document.addEventListener("keydown", onKey, true);
    dlg.onclick = (e) => {
      const b = e.target.closest("[data-i]");
      if (!b) { if (e.target === dlg) done(null); return; }
      done(b.dataset.i === "ok" ? (inp.value.trim() || null) : null);
    };
    inp.focus(); inp.select();
  });
}
