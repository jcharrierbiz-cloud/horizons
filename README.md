# Horizons

Planifier du jour à la vie. Chaque horizon — jour, semaine, mois, trimestre,
année, décennie, vie — a sa colonne ; on y pose ses objectifs, on rattache le
petit au grand, on glisse ce qui bouge.

Application web autonome : pas de compte, pas de serveur, pas de dépendance.
Les données restent dans le navigateur de l'appareil. Elle s'installe comme une
application (téléphone et ordinateur) et fonctionne hors connexion.

## Ce qu'elle fait

- **Horizons** : vue « Ensemble » (une colonne par horizon, chacune navigable
  dans le temps et repliable) et vue « bande » (un horizon, ses périodes à la
  suite, « Plus tôt » / « Plus tard »).
- **Objectifs liés** : un élément se rattache à un élément d'un horizon plus
  large qui couvre sa période ; le parent affiche « faits / total » et transmet
  sa couleur. Sous-objectifs imbriqués sous n'importe quel élément.
- **Report automatique** de ce qui n'est pas fait vers la période en cours
  (désactivable : l'élément reste alors en retard, à ramener d'un geste).
- **Récurrence** : chaque jour ou tous les N jours, jours ouvrés, jours choisis,
  chaque mois, chaque année ; chaque période pour les autres horizons. Une
  occurrence se coche, se déplace, se détache ou se passe.
- **Notes en markdown** (titres, gras, listes, cases à cocher, citations,
  liens), **étiquettes** `#comme-ça`, **espaces** séparés (Personnel, Travail…).
- **Tableaux** hors du temps, en colonnes ou en liste, listes repliables.
- **Calendrier** du mois avec glisser-déposer, et **grille horaire** d'une
  journée pour bloquer du temps (glisser sur une heure, tirer la durée, toucher
  une plage libre pour créer).
- **Ascensions** : programmes guidés (lecture, routine du matin, course 5 km,
  méditation, revue hebdomadaire, désencombrement, finances, écriture) et
  programmes personnels, une étape par jour.
- **Progrès** : faits du jour, de la semaine, du mois, série, tenue sur 30 jours,
  12 dernières semaines, objectifs suivis.
- **Recherche**, **À ranger**, **rappels** (notification tant que l'application
  est ouverte), **thème** clair ou sombre, **export / import / tout effacer**
  avec annulation.
- **Glisser-déposer** à la souris, ou au doigt par appui long (un balayage reste
  un défilement).

### Raccourcis clavier

| Touche | Action |
|---|---|
| `N` | Nouvel élément |
| `/` ou `Ctrl K` | Rechercher |
| `H` `C` `J` | Horizons, Calendrier, Journée |
| `A` `P` `I` | Ascensions, Progrès, À ranger |
| `T` | Revenir à aujourd'hui |
| `←` `→` | Colonne, mois ou jour précédent / suivant |
| `0` – `7` | Horizons : ensemble, puis jour → vie |
| `?` | Aide |

## Mettre en ligne

Le site est statique : n'importe quel hébergement de fichiers convient.

- **GitHub Pages** : le flux `.github/workflows/pages.yml` publie à chaque envoi
  sur `main`. Dans *Settings → Pages*, choisir la source « GitHub Actions ».
  Sur un compte gratuit, GitHub Pages n'est disponible que pour un dépôt
  **public** (le dépôt ne contient aucun secret).
- **Netlify, Vercel, Cloudflare Pages** : importer le dépôt, sans commande de
  build, dossier publié = racine.

Ensuite, depuis le navigateur du téléphone : « Ajouter à l'écran d'accueil ».

## Lancer en local

```sh
python3 -m http.server 8080   # puis http://localhost:8080
```

L'application doit être servie par un serveur (même local) : ouverte en
`file://`, le navigateur bloque ses modules JavaScript.

## Données

Tout est enregistré dans le stockage local du navigateur, sur l'appareil, et
nulle part ailleurs. Vider les données du site efface tout : exporter
régulièrement (Réglages → Exporter, ou « Sauvegarder » dans la barre latérale).
Pour passer d'un appareil à l'autre : exporter ici, importer là-bas.

## Tests

```sh
npm install
npx playwright install chromium
npm test
```

`tests/app.test.cjs` sert l'application et la parcourt sous Chromium, sur
ordinateur et téléphone : saisie, rattachements, glisser à la souris et au
doigt, récurrences, report, tableaux, calendrier, grille horaire, ascensions,
recherche, markdown échappé, espaces, réglages, raccourcis, données abîmées,
semaines ISO autour du Nouvel An, et absence de toute requête hors du site.

## Structure

```
index.html            coquille de la page
app.css               styles (clair / sombre, ordinateur / téléphone)
js/main.js            navigation, barre latérale, saisie, raccourcis, réglages
js/store.js           document de données, sauvegarde locale, rendus, annulation
js/items.js           éléments : placement, récurrence, report, rattachements
js/dates.js           périodes (semaines ISO, trimestres, décennies…)
js/views/*.js         Horizons, tableaux, calendrier, ascensions, progrès, recherche
js/dnd.js             glisser-déposer souris et tactile
sw.js                 fonctionnement hors connexion
fonts/                police Inter (SIL Open Font License)
```

Le document de données conserve les champs qu'il ne connaît pas : une
sauvegarde faite avec une version plus récente s'importe sans rien perdre.
