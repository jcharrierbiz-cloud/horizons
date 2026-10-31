/* Mode d'emploi : l'idée, les écrans, les gestes, un démarrage guidé (avec des
   boutons qui font le travail), un exemple pour une activité d'agence, et ce
   qu'il faut savoir quand on utilise plusieurs appareils. */

import { esc, uid } from "../util.js";
import { S, ui, saveUI, commit, space } from "../store.js";
import { icon, toast } from "../ui.js";
import * as KV from "./climbs.js";

const DEAL_LISTS = ["Prospects", "En discussion", "Signés", "En production", "Livrés"];
const agence = () => S.state.spaces.find((s) => /^agence$/i.test(s.name.trim())) || null;
const dealsIn = (spId) => S.state.boards.find((b) => b.spaceId === spId && /^deals$/i.test(b.name.trim())) || null;
const revue = () => S.state.runs.find((r) => r.climbId === "b-revue") || null;

const done = '<span class="chip ok">' + icon("check") + "Fait</span>";
const act = (a, label, ic) => '<button class="btn ghost sm" data-act="' + a + '">' + (ic ? icon(ic) : "") + esc(label) + "</button>";

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

export function render(main) {
  const ag = agence(), deals = dealsIn((ag || space()).id), rv = revue();
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
      ["Étiqueter", "Écrire <code>#client</code> dans l'intitulé"],
      ["Rechercher", "<kbd>/</kbd> ou <kbd>Ctrl K</kbd> ; <kbd>?</kbd> pour tous les raccourcis"]]
      .map(([a, b]) => "<tr><td>" + a + "</td><td>" + b + "</td></tr>").join("") + "</table></section>"

    + '<section class="g-sec"><h2>Démarrer en quinze minutes</h2><ol class="g-steps">'
    + "<li><div><b>Sépare tes deux mondes.</b> L'espace actuel sert pour le perso ; un espace « Agence » garde le travail à part. On passe de l'un à l'autre dans le panneau de gauche."
    + '<div class="g-act">' + (ag ? done : act("gspace", "Créer l'espace Agence", "plus")) + "</div></div></li>"
    + "<li><div><b>Fixe deux ou trois caps dans la colonne Année.</b> Pas plus de trois : au-delà, ce ne sont plus des priorités."
    + '<div class="g-act"><a class="btn ghost sm" href="#/horizons">' + icon("horizons") + "Ouvrir l'Ensemble</a></div></div></li>"
    + "<li><div><b>Découpe chaque cap en une ou deux étapes du mois</b>, rattachées à leur cap.</div></li>"
    + "<li><div><b>Remplis demain</b> (‹ › sur la pastille) et rattache chaque tâche à une étape. Ce qui ne se rattache à rien mérite une question : pourquoi le faire ?</div></li>"
    + "<li><div><b>Installe le rituel : une revue chaque semaine.</b> Vingt minutes pour regarder ce qui a été reporté, ce qui a avancé, et choisir les trois priorités de la semaine. C'est elle qui fait marcher le reste."
    + '<div class="g-act">' + (rv ? done : act("grevue", "Lancer la revue hebdomadaire", "play")) + "</div></div></li></ol></section>"

    + '<section class="g-sec"><h2>Pour l\'agence</h2><ul>'
    + "<li><b>Un tableau « Deals »</b> pour suivre chaque affaire : " + DEAL_LISTS.join(" → ") + ". C'est un suivi léger : pas de montants, pas de contacts, pas de relances automatiques ; pour ça, il faut un CRM."
    + '<div class="g-act">' + (deals ? '<a class="btn ghost sm" href="#/b/' + esc(deals.id) + '">' + icon("board") + "Ouvrir le tableau Deals</a>" : act("gdeals", "Créer le tableau Deals", "board")) + "</div></li>"
    + "<li><b>Des caps qui changent la structure, pas seulement le volume.</b> Par exemple : « documenter le process pour pouvoir déléguer », « tester une offre vendue au forfait », « décider d'ici juin, chiffres à l'appui ».</li>"
    + "<li><b>Une étiquette par client</b> (<code>#nomduclient</code>) : la recherche retrouve tout ce qui le concerne, et Progrès montre ce qui est fait, étiquette par étiquette.</li></ul></section>"

    + '<section class="g-sec"><h2>Plusieurs appareils</h2><div class="g-warn">'
    + "<p><b>Pour l'instant, chaque appareil a ses propres données : rien ne se synchronise.</b> Ce que tu ajoutes sur ton téléphone n'apparaît pas sur ton ordinateur.</p>"
    + "<ul><li><b>Choisis un appareil principal</b> : c'est là que tu modifies.</li>"
    + "<li><b>Pour passer à un autre</b> : Exporter ici (Réglages → Exporter, ou « Sauvegarder » dans la barre), envoie-toi le fichier, puis Importer là-bas. L'import <b>remplace</b> tout le contenu de l'appareil qui le reçoit.</li>"
    + "<li><b>Ne modifie jamais sur deux appareils entre deux transferts</b> : le dernier import écrase l'autre.</li>"
    + "<li><b>Sur iPhone, ajoute l'application à l'écran d'accueil</b> : Safari peut effacer les données d'un site resté plusieurs jours sans être ouvert.</li>"
    + "<li><b>Exporte une fois par semaine</b>, à la fin de ta revue par exemple.</li></ul>"
    + '<div class="g-act">' + act("gexport", "Exporter maintenant", "download") + "</div></div></section>"

    + '<section class="g-sec"><h2>Ce qu\'elle ne fait pas</h2><ul>'
    + "<li>Les rappels ne sonnent que si l'application est ouverte : pour un rendez-vous important, garde ton agenda habituel.</li>"
    + "<li>Pas de travail à plusieurs : ni partage, ni attribution.</li>"
    + "<li>Pas de lien avec ton agenda, tes mails ou ta facturation.</li>"
    + "<li>C'est un outil de plus : décide ce qu'il fait et ce que font les autres. Deux endroits pour la même chose, c'est zéro.</li></ul></section>"
    + "</div>";
}

export async function onAct(a, b, main, ctx) {
  switch (a) {
    case "gspace": {
      if (agence()) return true;
      S.state.spaces.push({ id: uid(), name: "Agence", emoji: "💼" });
      commit();
      toast("Espace « Agence » créé · change d'espace dans le panneau de gauche");
      return true;
    }
    case "gdeals": {
      const sp = agence() || space();
      let board = dealsIn(sp.id);
      if (!board) {
        board = { id: uid(), spaceId: sp.id, name: "Deals", emoji: "🤝", tone: "", view: "kanban",
          lists: DEAL_LISTS.map((name) => ({ id: uid(), name, collapsed: false })) };
        S.state.boards.push(board);
      }
      if (ui.space !== sp.id) { ui.space = sp.id; saveUI(true); }
      commit();
      location.hash = "#/b/" + board.id;
      toast("Tableau « Deals » prêt" + (sp.name ? " · espace " + sp.name : ""));
      return true;
    }
    case "grevue":
      if (revue()) { location.hash = "#/climbs"; return true; }
      await KV.onAct("cstart", { dataset: { climb: "b-revue" } });
      return true;
    case "gexport": ctx.exportData(); return true;
  }
  return false;
}
