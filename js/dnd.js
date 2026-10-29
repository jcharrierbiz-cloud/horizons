/* Glisser-déposer commun à toutes les vues.

   • Souris : le glisser commence dès que le pointeur bouge de quelques pixels.
   • Doigt : appui long (≈ 350 ms) ; un balayage avant le délai reste un
     défilement, rien ne bouge.
   Éléments déplaçables : [data-drag][data-id]. Zones de dépôt : [data-zone],
   dont la valeur dit ce qu'elles reçoivent (« col:day|2026-10-29 »,
   « list:board|liste », « cal:2026-10-29 », « time:2026-10-29 », « board:id »…).
   Dans une zone, les éléments sont rangés dans .dz (ou la zone elle-même) :
   un trait indique où l'élément sera inséré. Une zone « time » montre à la
   place un bloc à l'heure visée, calée au quart d'heure. */

import { hm } from "./dates.js";

let cfg = null, drag = null, lastEnd = 0;
const LONG = 350;

export function initDnd(onDrop) {
  cfg = { onDrop };
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", () => { if (drag && drag.mouse) end(false); });
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: false });
  document.addEventListener("touchcancel", () => { if (drag && drag.touch) end(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag && drag.active) end(true); }, true);
  /* Le clic qui suit un dépôt n'ouvre rien. */
  document.addEventListener("click", (e) => {
    if (Date.now() - lastEnd < 300) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener("contextmenu", (e) => { if (drag && drag.touch) e.preventDefault(); });
}
export const isDragging = () => !!(drag && drag.active);

function source(target) {
  if (!target || !target.closest) return null;
  if (target.closest(".check, input, textarea, select, .rs, [data-nodrag]")) return null;
  const el = target.closest("[data-drag]");
  return el && el.dataset.id ? el : null;
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const el = source(e.target); if (!el) return;
  drag = { el, id: el.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, mouse: true };
}
function onMouseMove(e) {
  if (!drag || !drag.mouse) return;
  if (!drag.active) {
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 6) return;
    drag.x = e.clientX; drag.y = e.clientY;
    start();
    return;
  }
  e.preventDefault();
  move(e.clientX, e.clientY);
}
function onTouchStart(e) {
  if (e.touches.length !== 1) { if (drag) end(true); return; }
  const el = source(e.target); if (!el) return;
  const t = e.touches[0];
  const d = drag = { el, id: el.dataset.id, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, touch: true };
  d.timer = setTimeout(() => { if (drag === d) start(); }, LONG);
}
function onTouchMove(e) {
  const d = drag; if (!d || !d.touch) return;
  const t = e.touches[0];
  if (!d.active) {
    if (Math.abs(t.clientX - d.sx) + Math.abs(t.clientY - d.sy) > 10) { clearTimeout(d.timer); drag = null; }
    return;
  }
  e.preventDefault();
  move(t.clientX, t.clientY);
}
function onTouchEnd(e) {
  const d = drag; if (!d || !d.touch) return;
  if (d.active) { e.preventDefault(); end(false); }
  else { clearTimeout(d.timer); drag = null; }
}

function start() {
  const d = drag;
  d.active = true;
  const r = d.el.getBoundingClientRect();
  d.dx = d.sx - r.left; d.dy = d.sy - r.top; d.h = r.height;
  const g = d.el.cloneNode(true);
  g.classList.add("drag-ghost");
  g.style.width = r.width + "px";
  document.body.appendChild(g);
  d.ghost = g;
  d.el.classList.add("lifted");
  d.mark = document.createElement("div");
  d.mark.className = "dz-mark";
  d.dur = +(d.el.dataset.dur || 60);
  document.body.classList.add("dragging");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  try { if (d.touch && navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sans vibreur */ }
  move(d.x, d.y);
  d.raf = requestAnimationFrame(autoScroll);
}

function move(x, y) {
  const d = drag; if (!d || !d.active) return;
  d.x = x; d.y = y;
  d.ghost.style.transform = "translate(" + (x - d.dx) + "px," + (y - d.dy) + "px)";
  const hit = document.elementFromPoint(x, y);
  const zone = hit && hit.closest("[data-zone]");
  if (d.zone && d.zone !== zone) d.zone.classList.remove("over");
  d.zone = zone || null;
  d.beforeId = null; d.minutes = null;
  if (!zone) { if (d.mark.parentNode) d.mark.remove(); return; }
  zone.classList.add("over");
  if (zone.dataset.zone.startsWith("time:")) {
    const ppm = +zone.dataset.ppm || 1, zr = zone.getBoundingClientRect();
    let min = Math.round(((y - d.dy) - zr.top) / ppm / 15) * 15;
    min = Math.max(0, Math.min(24 * 60 - 15, min));
    d.minutes = min;
    d.mark.className = "dz-time";
    d.mark.style.top = (min * ppm) + "px";
    d.mark.style.height = Math.max(15, Math.min(d.dur, 24 * 60 - min)) * ppm + "px";
    d.mark.textContent = hm(min);
    if (d.mark.parentNode !== zone) zone.appendChild(d.mark);
    return;
  }
  d.mark.className = "dz-mark"; d.mark.style.top = ""; d.mark.style.height = ""; d.mark.textContent = "";
  const list = zone.querySelector(".dz") || zone;
  const items = Array.from(list.children).filter((c) => c.matches("[data-drag]") && !c.classList.contains("lifted"));
  let ref = null;
  for (const it of items) {
    const r = it.getBoundingClientRect();
    if (r.top + r.height / 2 > y) { ref = it; break; }
  }
  d.beforeId = ref ? ref.dataset.id : null;
  if (ref) { if (d.mark.nextSibling !== ref || d.mark.parentNode !== list) list.insertBefore(d.mark, ref); }
  else if (d.mark.parentNode !== list || d.mark.nextSibling) {
    const tail = list.querySelector(":scope > .dz-tail");
    if (tail) list.insertBefore(d.mark, tail); else list.appendChild(d.mark);
  }
}

/* Défilement automatique près des bords : conteneurs [data-autoscroll] sous
   le pointeur, et la page elle-même. */
function autoScroll() {
  const d = drag; if (!d || !d.active) return;
  let moved = false;
  const edge = 56;
  const els = document.elementsFromPoint(d.x, d.y).filter((e) => e.hasAttribute && e.hasAttribute("data-autoscroll"));
  els.forEach((sc) => {
    const r = sc.getBoundingClientRect();
    let vx = 0, vy = 0;
    if (sc.scrollWidth > sc.clientWidth) {
      if (d.x < r.left + edge) vx = -Math.ceil((r.left + edge - d.x) / 4);
      else if (d.x > r.right - edge) vx = Math.ceil((d.x - (r.right - edge)) / 4);
    }
    if (sc.scrollHeight > sc.clientHeight) {
      if (d.y < r.top + edge) vy = -Math.ceil((r.top + edge - d.y) / 4);
      else if (d.y > r.bottom - edge) vy = Math.ceil((d.y - (r.bottom - edge)) / 4);
    }
    if (vx || vy) { sc.scrollLeft += vx; sc.scrollTop += vy; moved = true; }
  });
  let w = 0;
  if (d.y < 64) w = -Math.ceil((64 - d.y) / 5);
  else if (d.y > window.innerHeight - 64) w = Math.ceil((d.y - (window.innerHeight - 64)) / 5);
  if (w) { window.scrollBy(0, w); moved = true; }
  if (moved) move(d.x, d.y);
  d.raf = requestAnimationFrame(autoScroll);
}

function end(cancel) {
  const d = drag; drag = null;
  if (!d) return;
  clearTimeout(d.timer);
  if (!d.active) return;
  cancelAnimationFrame(d.raf);
  lastEnd = Date.now();
  document.body.classList.remove("dragging");
  d.ghost.remove();
  d.el.classList.remove("lifted");
  if (d.zone) d.zone.classList.remove("over");
  const zone = d.zone, ok = !cancel && zone && (d.mark.parentNode || d.minutes != null);
  if (d.mark.parentNode) d.mark.remove();
  if (!ok) return;
  cfg.onDrop({ id: d.id, el: d.el, zone: zone.dataset.zone, zoneEl: zone, beforeId: d.beforeId, minutes: d.minutes });
}
