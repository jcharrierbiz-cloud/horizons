/* Centre de progrès : ce qui avance, à chaque horizon, et le rythme des
   dernières semaines. Ne compte que ce qui a réellement été coché. */

import { esc, plural, trunc, toneHex } from "../util.js";
import { HZ, today, addDays, periodOf, isoWeekKey, weekMonday, shiftPeriod, where, fmtD } from "../dates.js";
import { S, spaceId } from "../store.js";
import { buildIndex, colItems, progressOf, effectiveTone, allTags } from "../items.js";

function streak(doneDays) {
  let d = today(), n = 0;
  if (!doneDays.has(d)) d = addDays(d, -1);
  while (doneDays.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function render(main) {
  const sp = spaceId(), ix = buildIndex(), t = today();
  const mine = S.state.items.filter((x) => x.spaceId === sp && !x.repeat);
  const done = mine.filter((x) => x.done && x.doneAt);
  const doneDays = new Set(done.map((x) => x.doneAt));
  const wk = isoWeekKey(t), mo = t.slice(0, 7);
  const dToday = done.filter((x) => x.doneAt === t).length;
  const dWeek = done.filter((x) => isoWeekKey(x.doneAt) === wk).length;
  const dMonth = done.filter((x) => x.doneAt.slice(0, 7) === mo).length;
  /* Taux sur 30 jours : éléments du jour dont la date tombe dans les 30 derniers jours. */
  const from = addDays(t, -29);
  const last30 = mine.filter((x) => x.h === "day" && x.key >= from && x.key <= t);
  const rate = last30.length ? Math.round(last30.filter((x) => x.done).length / last30.length * 100) : null;

  let html = '<header class="view-h"><div><h1>Progrès</h1><p class="view-sub">Ce que tu as tenu, horizon par horizon.</p></div></header>';
  html += '<div class="kpis">'
    + kpi("Aujourd'hui", dToday, "fait" + (dToday > 1 ? "s" : ""))
    + kpi("Cette semaine", dWeek, "fait" + (dWeek > 1 ? "s" : ""))
    + kpi("Ce mois-ci", dMonth, "fait" + (dMonth > 1 ? "s" : ""))
    + kpi("Série", streak(doneDays), "jour" + (streak(doneDays) > 1 ? "s" : "") + " d'affilée")
    + kpi("Tenue sur 30 jours", rate == null ? "—" : rate + " %", last30.length ? plural(last30.length, "élément") + " prévus" : "rien de prévu")
    + "</div>";

  /* Douze dernières semaines */
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const k = shiftPeriod("week", wk, -i);
    weeks.push({ k, n: done.filter((x) => isoWeekKey(x.doneAt) === k).length });
  }
  const max = Math.max(1, ...weeks.map((w) => w.n));
  html += '<section class="panel"><h2 class="sec-h">Faits par semaine</h2><div class="bars" role="img" aria-label="Éléments faits sur les 12 dernières semaines">'
    + weeks.map((w) => '<div class="bcol' + (w.k === wk ? " cur" : "") + '" title="' + esc(where("week", w.k)) + " : " + w.n + '"><span class="bv num">' + (w.n || "") + "</span>"
      + '<div class="btrack"><i style="height:' + Math.round(w.n / max * 100) + '%"></i></div>'
      + '<span class="bl">' + esc(fmtD(weekMonday(w.k), { day: "numeric", month: "short" })) + "</span></div>").join("") + "</div></section>";

  /* Horizons en cours */
  html += '<section class="panel"><h2 class="sec-h">Périodes en cours</h2><div class="hz-prog">';
  HZ.forEach((x) => {
    const k = periodOf(x.id, t), items = colItems(ix, x.id, k).filter((i) => !i.virtual || true);
    const d = items.filter((i) => i.done).length;
    const pct = items.length ? Math.round(d / items.length * 100) : 0;
    html += '<div class="hp"><div class="hp-h"><b>' + esc(x.one) + "</b><span>" + esc(where(x.id, k)) + '</span><span class="num">' + (items.length ? d + "/" + items.length : "—") + "</span></div>"
      + '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  });
  html += "</div></section>";

  /* Objectifs qui ont des sous-objectifs */
  const goals = mine.filter((x) => x.h && x.h !== "day" && !x.done).map((x) => ({ x, p: progressOf(ix, x) })).filter((g) => g.p)
    .sort((a, b) => b.p.done / b.p.total - a.p.done / a.p.total).slice(0, 12);
  html += '<section class="panel"><h2 class="sec-h">Objectifs suivis</h2>' + (goals.length ? goals.map((g) => {
    const tone = toneHex(effectiveTone(ix, g.x)) || "var(--accent)";
    return '<button class="goal-row" data-act="open" data-id="' + esc(g.x.id) + '" style="--tone:' + tone + '"><span class="gt">' + (g.x.emoji ? esc(g.x.emoji) + " " : "") + esc(trunc(g.x.title, 60))
      + '<small>' + esc(where(g.x.h, g.x.key)) + '</small></span><span class="num">' + g.p.done + "/" + g.p.total + '</span><span class="bar"><i style="width:' + Math.round(g.p.done / g.p.total * 100) + '%"></i></span></button>';
  }).join("") : '<div class="empty">Rattache des tâches à un objectif de la semaine, du mois ou de l\'année : sa progression s\'affichera ici.</div>') + "</section>";

  /* Étiquettes */
  const tags = allTags().slice(0, 16);
  if (tags.length) {
    html += '<section class="panel"><h2 class="sec-h">Étiquettes</h2><div class="tag-stats">' + tags.map(([tg]) => {
      const all = mine.filter((x) => x.tags.includes(tg)), d = all.filter((x) => x.done).length;
      return '<a class="chip tag big" href="#/search/' + encodeURIComponent(tg) + '">#' + esc(tg) + ' <b class="num">' + d + "/" + all.length + "</b></a>";
    }).join("") + "</div></section>";
  }
  main.innerHTML = html;
}

function kpi(label, value, sub) {
  return '<div class="kpi"><span class="kl">' + esc(label) + '</span><b class="kv num">' + esc(String(value)) + '</b><span class="ks">' + esc(sub) + "</span></div>";
}
