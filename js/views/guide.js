/* Mode d'emploi : l'idée, les écrans, les gestes, un démarrage guidé (avec des
   boutons qui font le travail), des repères pour un premier business, et la
   synchronisation entre appareils. */

import { esc, uid } from "../util.js";
import { S, ui, saveUI, commit, space } from "../store.js";
import { icon, toast } from "../ui.js";
import * as KV from "./climbs.js";
import * as SY from "../sync.js";

/* Tableaux proposés : nom, emoji, listes. */
const BOARDS = {
  produits: ["Produits", "🛍️", ["Idées", "En préparation", "En ligne", "Qui se vendent"]],
  apprendre: ["Apprendre", "📚", ["À lire ou à suivre", "En cours", "Fini · à appliquer"]],
};
const business = () => S.state.spaces.find((s) => /^business$/i.test(s.name.trim())) || null;
const boardIn = (spId, name) => S.state.boards.find((b) => b.spaceId === spId && b.name.trim().toLowerCase() === name.toLowerCase()) || null;
const revue = () => S.state.runs.find((r) => r.climbId === "b-revue") || null;

const done = '<span class="chip ok">' + icon("check") + "Fait</span>";
const act = (a, label, ic, extra) => '<button class="btn ghost sm" data-act="' + a + '"' + (extra || "") + ">" + (ic ? icon(ic) : "") + esc(label) + "</button>";
function boardBtn(key) {
  const [name] = BOARDS[key], b = boardIn((business() || space()).id, name);
  return b ? '<a class="btn ghost sm" href="#/b/' + esc(b.id) + '">' + icon("board") + "Ouvrir « " + esc(name) + " »</a>"
    : act("gboard", "Créer le tableau « " + name + " »", "board", ' data-board="' + key + '"');
}

function screens() {
  return [
    ["#/horizons", "horizons", "Horizons", "Les colonnes du jour à l'année ; on glisse d'une colonne à l'autre."],
    ["#/day/today", "clock", "Journée", "La grille horaire pour bloquer du temps."],
    ["#/cal", "calendar", "Calendrier", "Le mois d'un coup d'œil."],
    ["#/life", "life", "Vie", "Tes années, l'année jour par jour, tes objectifs de vie."],
    ["#/inbox", "list", "À ranger", "Ce que tu notes vite, sans savoir encore quand."],
    ["#/climbs", "climb", "Ascensions", "Des programmes guidés, une étape par jour."],
    ["#/progress", "chart", "Progrès", "Ce que tu termines vraiment, semaine après semaine."],
    ["#/search", "search", "Recherche", "Par mot, dans les notes, ou par #étiquette."],
  ].map(([h, ic, t, d]) => '<a class="g-card" href="' + h + '">' + icon(ic) + "<span><b>" + t + "</b>" + d + "</span></a>").join("")
    + '<div class="g-card static">' + icon("board") + "<span><b>Tableaux</b>Des listes hors du temps, en colonnes ; dans le panneau de gauche.</span></div>";
}

function devices() {
  const acc = SY.account();
  if (acc) {
    return '<section class="g-sec"><h2>Plusieurs appareils</h2><div class="g-ok">'
      + "<p><b>Synchronisation active</b> avec le compte " + esc(acc.email) + ". Ce que tu changes ici arrive sur tes autres appareils en quelques secondes, et inversement.</p>"
      + "<ul><li>Hors connexion, tu continues normalement : tout part au retour du réseau.</li>"
      + "<li>Si tu modifies la même chose sur deux appareils en même temps, la modification la plus récente l'emporte ; le reste se fusionne.</li>"
      + "<li>Sur un nouvel appareil : Réglages → « Me connecter » avec la même adresse et le même mot de passe.</li>"
      + "<li>Garde quand même une copie à toi de temps en temps : Réglages → Exporter.</li></ul>"
      + '<div class="g-act">' + act("gsettings", "Ouvrir les Réglages", "settings") + act("gexport", "Exporter maintenant", "download") + "</div></div></section>";
  }
  return '<section class="g-sec"><h2>Plusieurs appareils</h2><div class="g-warn">'
    + "<p><b>La synchronisation n'est pas encore activée sur cet appareil</b> : ce que tu ajoutes ici reste ici.</p>"
    + "<ul><li><b>Premier appareil</b> : Réglages → Synchronisation → « Créer mon compte », avec l'adresse de ton compte Supabase. Ouvre le mail de confirmation, puis « Me connecter ».</li>"
    + "<li><b>Autres appareils</b> : Réglages → « Me connecter », même adresse, même mot de passe. Si l'appareil contient déjà des données, tu choisis de les fusionner ou de les remplacer.</li>"
    + "<li><b>Sur téléphone, installe l'application</b> (menu du navigateur → « Ajouter à l'écran d'accueil » ou « Installer »).</li></ul>"
    + '<div class="g-act">' + act("gsettings", "Activer la synchronisation", "settings") + act("gexport", "Exporter maintenant", "download") + "</div></div></section>";
}

export function render(main) {
  const bz = business(), rv = revue();
  main.innerHTML = '<div class="guide">'
    + '<header class="view-h"><div><h1>Mode d\'emploi</h1><p class="view-sub">Comprendre Horizons en cinq minutes, puis s\'y mettre en quinze.</p></div></header>'

    + '<section class="g-sec"><h2>L\'idée</h2>'
    + "<p>Un agenda range des rendez-vous. Horizons range des <b>intentions</b>, chacune à l'échelle de temps où elle vit :</p>"
    + '<ul class="g-hz"><li><b>Vie</b> : ce qui compte, sans date.</li><li><b>Décennie, année</b> : les caps.</li>'
    + "<li><b>Trimestre, mois</b> : les étapes qui y mènent.</li><li><b>Semaine, jour</b> : les actions.</li></ul>"
    + "<p>Trois mécanismes font le lien :</p>"
    + "<ul><li><b>Rattacher.</b> Dans la fiche d'un élément, le champ « Rattaché à » le relie à un objectif plus large. Le parent affiche « 2/5 » et prête sa couleur : chaque action dit à quoi elle sert.</li>"
    + "<li><b>Reporter.</b> Ce qui n'est pas fait glisse dans la période en cours, marqué « reporté 2× ». Au troisième report, pose-toi la question : ce n'est pas une priorité, ou c'est trop gros et il faut le découper. (Désactivable dans les Réglages.)</li>"
    + "<li><b>Zoomer.</b> La vue Ensemble montre le jour, la semaine, le mois et l'année d'un même moment. La pastille ‹ Aujourd'hui › en bas déplace ce moment, et toutes les colonnes suivent.</li></ul></section>"

    + '<section class="g-sec"><h2>Les écrans</h2><div class="g-cards">' + screens() + "</div></section>"

    + '<section class="g-sec"><h2>Les gestes</h2><table class="keys">'
    + [["Ajouter", "« Ajouter… » en bas d'une colonne, ou la touche <kbd>N</kbd>"],
      ["Ouvrir la fiche", "Toucher l'intitulé : couleur, note, récurrence, rappel, rattachement"],
      ["Déplacer", "Glisser ; au doigt, appui long puis glisser"],
      ["Mettre à une heure", "Glisser sur la grille horaire ; tirer le bas du bloc pour la durée ; toucher une plage libre pour créer"],
      ["Changer de jour", "‹ › sur la pastille, ou <kbd>←</kbd> <kbd>→</kbd> ; <kbd>T</kbd> pour revenir à aujourd'hui"],
      ["Étiqueter", "Écrire <code>#projet</code> dans l'intitulé"],
      ["Rechercher", "<kbd>/</kbd> ou <kbd>Ctrl K</kbd> ; <kbd>?</kbd> pour tous les raccourcis"]]
      .map(([a, b]) => "<tr><td>" + a + "</td><td>" + b + "</td></tr>").join("") + "</table></section>"

    + '<section class="g-sec"><h2>Démarrer en quinze minutes</h2><ol class="g-steps">'
    + "<li><div><b>Sépare tes deux mondes.</b> L'espace actuel sert pour le perso (lycée, sport, créativité) ; un espace « Business » garde tes projets à part. On passe de l'un à l'autre dans le panneau de gauche."
    + '<div class="g-act">' + (bz ? done : act("gspace", "Créer l'espace Business", "plus")) + "</div></div></li>"
    + "<li><div><b>Fixe deux ou trois caps dans la colonne Année.</b> Pas plus de trois : au-delà, ce ne sont plus des priorités. Chacun doit pouvoir se juger par oui ou non à la fin de l'année."
    + '<div class="g-act"><a class="btn ghost sm" href="#/horizons">' + icon("horizons") + "Ouvrir l'Ensemble</a></div></div></li>"
    + "<li><div><b>Découpe chaque cap en une ou deux étapes du mois</b>, rattachées à leur cap.</div></li>"
    + "<li><div><b>Remplis demain</b> (‹ › sur la pastille) et rattache chaque tâche à une étape. Ce qui ne se rattache à rien mérite une question : pourquoi le faire ?</div></li>"
    + "<li><div><b>Installe le rituel : une revue chaque semaine.</b> Vingt minutes pour regarder ce qui a été reporté, ce qui a avancé, et choisir les trois priorités de la semaine. C'est elle qui fait marcher le reste."
    + '<div class="g-act">' + (rv ? done : act("grevue", "Lancer la revue hebdomadaire", "play")) + "</div></div></li></ol></section>"

    + '<section class="g-sec"><h2>Pour ton business</h2><ul>'
    + "<li><b>Un tableau « Produits »</b> : " + BOARDS.produits[2].join(" → ") + ". Chaque produit est une carte qui avance vers la droite ; une carte qui reste longtemps à gauche demande une décision : la faire ou l'abandonner."
    + '<div class="g-act">' + boardBtn("produits") + "</div></li>"
    + "<li><b>Un tableau « Apprendre »</b> pour les livres et les formations : " + BOARDS.apprendre[2].join(" → ") + ". Un livre n'est vraiment fini que quand une idée en est appliquée : écris-la dans sa fiche."
    + '<div class="g-act">' + boardBtn("apprendre") + "</div></li>"
    + "<li><b>Des caps chiffrés</b>, du plus petit au plus grand : première vente, premiers 100 € de bénéfice, premier mois à 1 000 €. Le chiffre de l'année se mérite étape par étape.</li>"
    + "<li><b>Une étiquette par projet</b> (<code>#vidéo</code>, <code>#lycée</code>…) : la recherche retrouve tout, et Progrès montre où passe ton énergie.</li></ul></section>"

    + devices()

    + '<section class="g-sec"><h2>Ce qu\'elle ne fait pas</h2><ul>'
    + "<li>Les rappels ne sonnent que si l'application est ouverte : pour un rendez-vous important, garde ton agenda habituel.</li>"
    + "<li>Pas de travail à plusieurs : ni partage, ni attribution.</li>"
    + "<li>Pas de lien avec ton agenda, tes mails ou ta comptabilité.</li>"
    + "<li>C'est un outil de plus : décide ce qu'il fait et ce que font les autres. Deux endroits pour la même chose, c'est zéro.</li></ul></section>"
    + "</div>";
}

export async function onAct(a, b, main, ctx) {
  switch (a) {
    case "gspace": {
      if (business()) return true;
      S.state.spaces.push({ id: uid(), name: "Business", emoji: "💼" });
      commit();
      toast("Espace « Business » créé · change d'espace dans le panneau de gauche");
      return true;
    }
    case "gboard": {
      const def = BOARDS[b.dataset.board]; if (!def) return true;
      const [name, emoji, lists] = def, sp = business() || space();
      let board = boardIn(sp.id, name);
      if (!board) {
        board = { id: uid(), spaceId: sp.id, name, emoji, tone: "", view: "kanban", lists: lists.map((n) => ({ id: uid(), name: n, collapsed: false })) };
        S.state.boards.push(board);
      }
      if (ui.space !== sp.id) { ui.space = sp.id; saveUI(true); }
      commit();
      location.hash = "#/b/" + board.id;
      toast("Tableau « " + name + " » prêt · espace " + sp.name);
      return true;
    }
    case "grevue":
      if (revue()) { location.hash = "#/climbs"; return true; }
      await KV.onAct("cstart", { dataset: { climb: "b-revue" } });
      return true;
    case "gexport": ctx.exportData(); return true;
    case "gsettings": ctx.openSettings(); return true;
  }
  return false;
}
