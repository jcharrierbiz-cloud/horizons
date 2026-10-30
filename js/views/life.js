/* Calendrier de vie.
   • Les années, de la naissance à l'horizon choisi (80 ans par défaut) : celles
     qui sont passées sont barrées, l'année en cours est en rouge. Chaque année
     montre ce qui y a été accompli (Réflexion) ou ce qui y est prévu (Futur).
   • L'année en cours, jour par jour : douze lignes de mois, les jours passés
     barrés, aujourd'hui entouré, les week-ends en gris.
   • Dessous, les objectifs de vie et ceux de la décennie, modifiables sur place. */

import { esc, plural } from "../util.js";
import { today, iso, periodOf, weekday, fmtD } from "../dates.js";
import { S, ui, saveUI, commit, settings } from "../store.js";
import { buildIndex, colItems, colKey } from "../items.js";
import { itemRow, addSlot } from "../render.js";
import { toast } from "../ui.js";
import { requestScrollNow, narrow } from "./horizons.js";

let prevBirth = 0;     // « modifier » : l'ancienne année reste dans le champ
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

/* Par année : faits (Réflexion) et à faire (Futur), tous horizons datés confondus. */
function perYear(sp) {
  const done = {}, open = {}, days = {};
  S.state.items.forEach((x) => {
    if (x.spaceId !== sp || x.repeat || !x.h || x.h === "life" || x.h === "decade") return;
    const y = x.key.slice(0, 4);
    if (x.done) done[y] = (done[y] || 0) + 1; else open[y] = (open[y] || 0) + 1;
    if (x.h === "day") { const d = days[x.key] || (days[x.key] = { n: 0, done: 0 }); d.n++; if (x.done) d.done++; }
  });
  return { done, open, days };
}

export function render(main) {
  const st = settings(), t = today(), yNow = +t.slice(0, 4), ix = buildIndex();
  const mode = ui.lifeMode === "future" ? "future" : "past";
  const stats = perYear(ix.space);
  let html = '<header class="view-h"><div><h1>Vie</h1><p class="view-sub">'
    + (st.birth ? "Ta vie en années, puis cette année jour par jour. Touche une année ou un jour pour t'y rendre." : "Donne ton année de naissance pour voir ta vie en années.") + "</p></div>"
    + '<div class="view-tools"><div class="seg" role="group" aria-label="Lecture">'
    + '<button data-act="lifemode" data-m="past" aria-pressed="' + (mode === "past") + '">Réflexion</button>'
    + '<button data-act="lifemode" data-m="future" aria-pressed="' + (mode === "future") + '">Futur</button></div></div></header>';

  if (!st.birth) {
    html += '<div class="life-ask"><label for="lifeBirth">Année de naissance</label>'
      + '<input id="lifeBirth" type="number" inputmode="numeric" min="1900" max="' + yNow + '" placeholder="ex : 1992"' + (prevBirth ? ' value="' + prevBirth + '"' : "") + ">"
      + '<button class="btn primary" data-act="lifebirth">Afficher ma vie</button></div>';
  } else {
    const end = st.birth + st.lifespan - 1, src = mode === "past" ? stats.done : stats.open;
    html += '<section class="life-years" aria-label="Années de vie">';
    for (let row = st.birth; row <= end; row += 10) {
      html += '<div class="ly-row"><span class="ly-age num">' + (row - st.birth) + " ans</span>";
      for (let y = row; y < row + 10 && y <= end; y++) {
        const n = src[y] || 0, cls = y < yNow ? "past" : y === yNow ? "now" : "future";
        html += '<button class="ly ' + cls + '" data-act="lifeyear" data-y="' + y + '" title="' + y + " · " + (y - st.birth) + " ans"
          + (n ? " · " + plural(n, mode === "past" ? "fait" : "à faire", mode === "past" ? "faits" : "à faire") : "") + '">'
          + '<span class="num">' + y + "</span>" + (n ? '<i class="num">' + n + "</i>" : "") + "</button>";
      }
      html += "</div>";
    }
    const lived = Math.max(0, Math.min(st.lifespan, yNow - st.birth));
    html += '<p class="life-foot num">' + lived + " ans vécus · " + Math.max(0, st.lifespan - lived) + " à écrire"
      + ' · <button class="link" data-act="lifeedit">modifier</button></p></section>';
  }

  /* L'année en cours, jour par jour. */
  html += '<section class="life-days" aria-label="Année ' + yNow + '"><h2 class="life-h">' + yNow + "</h2>";
  for (let m = 0; m < 12; m++) {
    html += '<div class="ld-row"><span class="ld-m">' + MONTHS[m] + "</span>";
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(yNow, m, d, 12);
      if (dt.getMonth() !== m) { html += '<span class="ld none"></span>'; continue; }
      const k = iso(dt), info = stats.days[k];
      const cls = (k < t ? " past" : k === t ? " now" : "") + (weekday(k) >= 5 ? " we" : "") + (info ? (info.done === info.n ? " full" : " some") : "");
      html += '<button class="ld' + cls + '" data-act="lifeday" data-d="' + k + '" aria-label="' + esc(fmtD(k, { weekday: "long", day: "numeric", month: "long" }))
        + (info ? " · " + info.done + "/" + info.n : "") + '"><span class="num">' + d + "</span></button>";
    }
    html += "</div>";
  }
  html += "</section>";

  /* Objectifs de vie et de la décennie. */
  const dk = periodOf("decade", t);
  html += '<div class="life-goals">';
  [["life", "vie", "Objectifs de vie"], ["decade", dk, "Années " + dk]].forEach(([h, k, title]) => {
    const items = colItems(ix, h, k), shown = ui.hideDone ? items.filter((x) => !x.done) : items;
    html += '<section class="col" data-zone="' + esc("col:" + colKey(h, k)) + '" data-col="' + esc(colKey(h, k)) + '">'
      + '<header class="col-h"><div class="col-tt"><h2 class="col-title">' + esc(title) + '</h2><span class="col-count num">'
      + (items.length ? items.filter((x) => x.done).length + "/" + items.length : "") + "</span></div></header>"
      + '<div class="col-b"><div class="dz">' + shown.map((it) => itemRow(ix, it, {})).join("") + addSlot("col:" + colKey(h, k)) + "</div></div></section>";
  });
  html += "</div>";
  main.innerHTML = html;
}

function goFocus(date, yearOnly) {
  if (narrow()) ui.hzMode = yearOnly ? "year" : "day";
  else { ui.hzMode = "all"; ui.focus = date === today() ? "" : date; }
  requestScrollNow();
  saveUI(true);
  location.hash = "#/horizons";
}

export function onAct(act, b, main) {
  const st = settings();
  switch (act) {
    case "lifemode": ui.lifeMode = b.dataset.m; saveUI(); return true;
    case "lifebirth": {
      const inp = main.querySelector("#lifeBirth"), y = Math.round(+(inp && inp.value));
      if (!(y >= 1900 && y <= new Date().getFullYear())) { toast("Année de naissance entre 1900 et " + new Date().getFullYear() + "."); return true; }
      st.birth = y; commit(); return true;
    }
    case "lifeedit": prevBirth = st.birth; st.birth = 0; commit(); setTimeout(() => { const i = main.querySelector("#lifeBirth"); if (i) i.focus(); }, 0); return true;
    case "lifeyear": {
      const y = b.dataset.y, t = today();
      goFocus(y === t.slice(0, 4) ? t : y + "-01-01", true);
      return true;
    }
    case "lifeday": goFocus(b.dataset.d, false); return true;
  }
  return false;
}

/* Entrée dans le champ d'année de naissance. */
export function onKey(e, main) {
  if (e.target.id !== "lifeBirth" || e.key !== "Enter") return false;
  e.preventDefault();
  onAct("lifebirth", e.target, main);
  return true;
}

