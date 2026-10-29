/* Ascensions : des programmes guidés qui remplissent tes journées d'étapes.
   On en lance une à une date ; chaque étape devient un élément du jour,
   marqué comme faisant partie de l'ascension. On peut créer les siennes. */

import { esc, uid, plural, EMOJIS } from "../util.js";
import { today, addDays, fmtD, dNum, weekday } from "../dates.js";
import { S, commit, snapshot, restore, spaceId } from "../store.js";
import { createItem } from "../items.js";
import { icon, toast, ask, openSheet, closeSheet } from "../ui.js";

const days = (n, title) => Array.from({ length: n }, (_, d) => ({ d, title: typeof title === "function" ? title(d) : title }));
const ZONES = ["le tiroir à couverts", "le dessous de l'évier", "le placard de l'entrée", "la table de nuit", "le sac du quotidien",
  "le frigo", "les épices et conserves", "la salle de bain", "les produits de beauté", "les chaussures", "les manteaux",
  "un étage de la penderie", "les t-shirts", "les chaussettes", "les papiers en attente", "le bureau", "les câbles et chargeurs",
  "les livres", "la boîte mail (100 messages)", "les photos du téléphone", "les applications inutiles", "les jouets ou loisirs",
  "la voiture ou le vélo", "le balcon ou la cave", "les produits ménagers", "le linge de maison", "les sacs et cabas",
  "les souvenirs", "la cuisine, plan de travail", "un dernier tour de la maison"];
const RUN = ["8 × (1 min de course, 1 min 30 de marche)", "6 × (2 min de course, 1 min de marche)", "5 × (3 min de course, 1 min de marche)",
  "4 × (5 min de course, 1 min de marche)", "3 × (8 min de course, 1 min de marche)", "2 × (12 min de course, 1 min de marche)",
  "25 min de course continue", "30 min de course : tes premiers 5 km"];

export const LIBRARY = [
  { id: "b-lire", emoji: "📚", title: "Lire chaque jour", desc: "Trente jours, vingt pages par jour : de quoi finir deux livres.", steps: days(30, "Lire 20 pages") },
  { id: "b-matin", emoji: "🌅", title: "Routine du matin", desc: "Trois semaines pour installer un matin qui te ressemble, une brique après l'autre.",
    steps: days(21, (d) => d < 7 ? "Lever à heure fixe + un grand verre d'eau" : d < 14 ? "Lever fixe, eau, 5 min d'étirements" : "Lever fixe, eau, étirements, écrire 3 priorités") },
  { id: "b-course", emoji: "🏃", title: "Courir 5 km", desc: "Huit semaines, trois sorties par semaine, du fractionné marche-course jusqu'aux 5 km.",
    steps: RUN.flatMap((t, w) => [0, 2, 5].map((o) => ({ d: w * 7 + o, title: "Course : " + t }))) },
  { id: "b-medit", emoji: "🧘", title: "Méditer dix jours", desc: "De 3 à 12 minutes, une minute de plus chaque jour.", steps: days(10, (d) => "Méditer " + (3 + d) + " min") },
  { id: "b-revue", emoji: "🗓️", title: "Revue hebdomadaire", desc: "Douze semaines d'une revue du dimanche : bilan, priorités, agenda.", steps: Array.from({ length: 12 }, (_, w) => ({ d: w * 7, title: "Revue de la semaine : bilan, 3 priorités, agenda" })) },
  { id: "b-desenc", emoji: "📦", title: "Désencombrer en 30 jours", desc: "Une zone par jour, quinze minutes chacune.", steps: days(30, (d) => "Désencombrer " + ZONES[d] + " (15 min)") },
  { id: "b-finances", emoji: "💰", title: "Finances au clair", desc: "Quatre semaines pour voir où va l'argent et l'orienter.",
    steps: [[0, "Lister tous ses abonnements"], [2, "Résilier au moins un abonnement inutile"], [5, "Relever le solde de tous ses comptes"],
      [7, "Classer les dépenses du mois dernier en 5 catégories"], [10, "Fixer un budget par catégorie"], [14, "Programmer un virement d'épargne automatique"],
      [17, "Renégocier un contrat (assurance, énergie, téléphone)"], [21, "Faire le point du budget à mi-mois"], [27, "Bilan : ce qui a changé, ce qui reste"]].map(([d, title]) => ({ d, title })) },
  { id: "b-ecrire", emoji: "✍️", title: "Écrire chaque jour", desc: "Quatorze jours, trois cents mots, sans se relire.", steps: days(14, "Écrire 300 mots") },
];

const climbById = (id) => LIBRARY.find((c) => c.id === id) || S.state.climbs.find((c) => c.id === id) || null;

function runStats(run) {
  const items = S.state.items.filter((x) => x.runId === run.id);
  const done = items.filter((x) => x.done).length;
  const next = items.filter((x) => !x.done).sort((a, b) => (a.key || "").localeCompare(b.key || ""))[0];
  return { items, done, total: items.length, next };
}

export function render(main) {
  const runs = S.state.runs.filter((r) => S.state.items.some((x) => x.runId === r.id && x.spaceId === spaceId()));
  let html = '<header class="view-h"><div><h1>Ascensions</h1><p class="view-sub">Des programmes guidés qui posent une étape par jour dans tes horizons. Lance-en un, ou écris le tien.</p></div>'
    + '<div class="view-tools"><button class="btn primary sm" data-act="cnew">' + icon("plus") + "Créer une ascension</button></div></header>";

  html += '<h2 class="sec-h">En cours</h2>';
  html += runs.length ? '<div class="cards">' + runs.map((r) => {
    const st = runStats(r), pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    return '<article class="card run"><div class="card-h"><span class="emo lg">' + esc(r.emoji) + "</span><div><b>" + esc(r.title) + "</b>"
      + "<span>Commencée le " + esc(fmtD(r.start, { day: "numeric", month: "long" })) + " · " + st.done + "/" + st.total + "</span></div></div>"
      + '<div class="bar"><i style="width:' + pct + '%"></i></div>'
      + (st.next ? '<p class="hint">Prochaine étape : <b>' + esc(st.next.title) + "</b> · " + esc(fmtD(st.next.key, { weekday: "long", day: "numeric", month: "short" })) + "</p>" : '<p class="hint ok">Toutes les étapes sont faites. Bravo.</p>')
      + '<div class="card-acts"><button class="btn ghost sm" data-act="rstop" data-run="' + r.id + '">' + icon("stop") + (st.next ? "Arrêter" : "Ranger") + "</button></div></article>";
  }).join("") + "</div>" : '<div class="empty">Aucune ascension en cours.</div>';

  const mine = S.state.climbs;
  if (mine.length) {
    html += '<h2 class="sec-h">Mes ascensions</h2><div class="cards">' + mine.map((c) => card(c, true)).join("") + "</div>";
  }
  html += '<h2 class="sec-h">Bibliothèque</h2><div class="cards">' + LIBRARY.map((c) => card(c, false)).join("") + "</div>";
  main.innerHTML = html;
}

function card(c, mine) {
  const last = c.steps.length ? Math.max(...c.steps.map((s) => s.d)) + 1 : 0;
  return '<article class="card"><div class="card-h"><span class="emo lg">' + esc(c.emoji) + "</span><div><b>" + esc(c.title) + "</b>"
    + "<span>" + plural(c.steps.length, "étape") + " · " + plural(last, "jour") + "</span></div></div>"
    + (c.desc ? "<p>" + esc(c.desc) + "</p>" : "")
    + '<div class="card-acts"><button class="btn primary sm" data-act="cstart" data-climb="' + c.id + '">' + icon("play") + "Commencer</button>"
    + (mine ? '<button class="btn ghost sm" data-act="cedit" data-climb="' + c.id + '">Modifier</button><button class="btn ghost sm" data-act="cdel" data-climb="' + c.id + '">' + icon("trash") + "</button>" : "")
    + "</div></article>";
}

export function startRun(climb, start) {
  const run = { id: uid(), climbId: climb.id, title: climb.title, emoji: climb.emoji, start };
  S.state.runs.push(run);
  /* « Jours ouvrés » se calcule depuis le vrai premier jour, pour ne jamais tomber un week-end. */
  let offs = climb.steps.map((s) => s.d);
  if (climb.cadence === "weekdays") {
    offs = []; let d = 0;
    while (offs.length < climb.steps.length) { if (weekday(addDays(start, d)) < 5) offs.push(d); d++; }
  }
  climb.steps.forEach((s, i) => {
    createItem({ title: s.title, h: "day", key: addDays(start, offs[i]), runId: run.id, emoji: climb.emoji, keepTags: true });
  });
  return run;
}

export async function onAct(act, el) {
  const c = el.dataset.climb ? climbById(el.dataset.climb) : null;
  switch (act) {
    case "cstart": {
      if (!c) return true;
      const body = openSheet("Commencer · " + c.title,
        '<p class="hint">' + plural(c.steps.length, "étape") + " seront posées dans tes journées à partir de la date choisie. Tu pourras les cocher, les déplacer ou arrêter l'ascension.</p>"
        + '<label class="f-row"><span class="lbl">Premier jour</span><input type="date" id="cDate" value="' + today() + '"></label>'
        + '<div class="f-acts end"><button class="btn primary" id="cGo">' + icon("play") + "C'est parti</button></div>", {});
      body.onclick = (e) => {
        if (!e.target.closest("#cGo")) return;
        const d = document.getElementById("cDate").value || today();
        if (!dNum(d)) return;
        startRun(c, d); commit(); closeSheet();
        toast("Ascension lancée · " + plural(c.steps.length, "étape") + " posées");
      };
      return true;
    }
    case "rstop": {
      const run = S.state.runs.find((r) => r.id === el.dataset.run); if (!run) return true;
      const st = runStats(run), t = today();
      const rest = st.items.filter((x) => !x.done && (x.key || "") >= t);
      const ok = await ask(rest.length ? "Arrêter « " + run.title + " » ? Les " + plural(rest.length, "étape") + " à venir non faites seront retirées ; ce qui est fait reste."
        : "Ranger « " + run.title + " » ? Les étapes restent dans tes journées.", [{ v: true, label: rest.length ? "Arrêter" : "Ranger", kind: "danger" }]);
      if (!ok) return true;
      const snap = snapshot(rest.map((x) => x.id)), at = S.state.runs.indexOf(run);
      S.state.items = S.state.items.filter((x) => !rest.includes(x));
      S.state.items.forEach((x) => { if (x.runId === run.id) x.runId = ""; });
      S.state.runs.splice(at, 1);
      commit();
      toast("Ascension arrêtée", () => { S.state.runs.splice(at, 0, run); S.state.items.forEach((x) => { if (st.items.some((y) => y.id === x.id)) x.runId = run.id; }); restore(snap); });
      return true;
    }
    case "cnew": editClimb(null); return true;
    case "cedit": editClimb(c); return true;
    case "cdel": {
      if (!c) return true;
      const ok = await ask("Supprimer le modèle « " + c.title + " » ? Les ascensions déjà lancées ne bougent pas.", [{ v: true, label: "Supprimer", kind: "danger" }]);
      if (!ok) return true;
      const at = S.state.climbs.indexOf(c);
      S.state.climbs.splice(at, 1); commit();
      toast("Modèle supprimé", () => { S.state.climbs.splice(at, 0, c); commit(); });
      return true;
    }
  }
  return false;
}

/* Créer ou modifier son ascension : une étape par ligne, et un rythme. */
function editClimb(c) {
  const isNew = !c;
  const cad = c && c.cadence ? c.cadence : "daily";
  const body = openSheet(isNew ? "Créer une ascension" : "Modifier l'ascension",
    '<div class="f-title"><button class="emo-btn" id="ceEmo" data-e="' + esc(c ? c.emoji : "⛰️") + '">' + esc(c ? c.emoji : "⛰️") + "</button>"
    + '<input id="ceTitle" placeholder="Nom de l\'ascension" maxlength="80" value="' + esc(c ? c.title : "") + '"></div>'
    + '<div class="emo-grid" id="ceGrid" hidden>' + ["⛰️"].concat(EMOJIS).map((e) => '<button data-emoji="' + esc(e) + '">' + esc(e) + "</button>").join("") + "</div>"
    + '<label class="f-row col"><span class="lbl">En une phrase</span><input id="ceDesc" maxlength="160" value="' + esc(c ? c.desc : "") + '" placeholder="Ce que ça change, pour qui"></label>'
    + '<label class="f-row col"><span class="lbl">Étapes — une par ligne</span><textarea id="ceSteps" rows="8" placeholder="Marcher 20 min\nMarcher 25 min\n…">' + esc(c ? c.steps.map((s) => s.title).join("\n") : "") + "</textarea></label>"
    + '<div class="f-row col"><span class="lbl">Rythme</span><div class="seg wrap" id="ceCad">'
    + [["daily", "Chaque jour"], ["alt", "Un jour sur deux"], ["weekdays", "Jours ouvrés"], ["weekly", "Chaque semaine"]].map(([v, l]) => '<button data-cad="' + v + '" aria-pressed="' + (v === cad) + '">' + l + "</button>").join("")
    + "</div></div>"
    + '<div class="f-acts end"><button class="btn primary" id="ceSave">' + (isNew ? "Créer" : "Enregistrer") + "</button></div>", {});
  let cadence = cad;
  body.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "ceEmo") { document.getElementById("ceGrid").hidden = !document.getElementById("ceGrid").hidden; return; }
    if (b.dataset.emoji) { const em = document.getElementById("ceEmo"); em.textContent = b.dataset.emoji; em.dataset.e = b.dataset.emoji; document.getElementById("ceGrid").hidden = true; return; }
    if (b.dataset.cad) { cadence = b.dataset.cad; body.querySelectorAll("[data-cad]").forEach((x) => x.setAttribute("aria-pressed", x === b)); return; }
    if (b.id === "ceSave") {
      const title = document.getElementById("ceTitle").value.trim();
      const lines = document.getElementById("ceSteps").value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!title || !lines.length) { toast("Il faut un nom et au moins une étape."); return; }
      const steps = offsets(lines.length, cadence).map((d, i) => ({ d, title: lines[i] }));
      const data = { title, emoji: document.getElementById("ceEmo").dataset.e || "⛰️", desc: document.getElementById("ceDesc").value.trim(), steps, cadence };
      if (isNew) S.state.climbs.push(Object.assign({ id: uid() }, data)); else Object.assign(c, data);
      commit(); closeSheet(); toast(isNew ? "Ascension créée" : "Ascension enregistrée");
    }
  };
}
function offsets(n, cadence) {
  const out = [];
  if (cadence === "alt") for (let i = 0; i < n; i++) out.push(i * 2);
  else if (cadence === "weekly") for (let i = 0; i < n; i++) out.push(i * 7);
  else if (cadence === "weekdays") {
    /* À partir d'un lundi fictif : on saute les samedis et dimanches. */
    let d = 0; const base = "2024-01-01";
    while (out.length < n) { if (weekday(addDays(base, d)) < 5) out.push(d); d++; }
  } else for (let i = 0; i < n; i++) out.push(i);
  return out;
}
