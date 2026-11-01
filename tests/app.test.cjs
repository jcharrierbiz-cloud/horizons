// Vérification de bout en bout d'Horizons sous Chromium (Playwright).
// Lancement : npm test   (ou : node tests/app.test.cjs)
// Le script sert lui-même le dossier de l'application sur un port libre.
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const f = path.join(ROOT, p.endsWith("/") ? p + "index.html" : p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
}
let U = "";
const outside = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("ÉCHEC:", m); } };
const section = (t) => console.log("— " + t);

function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const D = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

async function fresh(browser, opts, seed, ui) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
  /* Indépendance : la page ne doit contacter que son propre serveur. */
  ctx.on("request", (r) => { if (!r.url().startsWith(new URL(U).origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.push(r.url()); });
  const page = await ctx.newPage();
  /* Un humain n'agit jamais dans la même image que le rendu qu'il vient de provoquer. */
  for (const fn of ["click", "tap", "selectOption", "fill"]) {
    const orig = page[fn].bind(page);
    page[fn] = async (...args) => { const r = await orig(...args); await page.waitForTimeout(80); return r; };
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/net::|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(U);
  if (seed || ui) {
    await page.evaluate(([s, u]) => {
      if (s) localStorage.setItem("horizons-v1", JSON.stringify(s));
      if (u) localStorage.setItem("horizons-ui-v1", JSON.stringify(u));
    }, [seed, ui]);
    await page.reload();
  }
  await page.waitForTimeout(250);
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("horizons-v1")));
const item = async (page, title) => (await st(page)).items.find((x) => x.title === title);
const nav = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(250); };

const base = (o) => Object.assign({ done: false, doneAt: null, createdAt: D(-5), h: null, key: null, order: 0, boardId: null, listId: null, border: 0, parent: "",
  note: "", tags: [], tone: "", emoji: "", time: "", dur: 60, remind: "", lastFired: "", repeat: null, skip: [], seriesId: "", occ: "", runId: "", carried: 0 }, o);
function seedWith(items, extra) {
  return Object.assign({ v: 1, rev: 3, touchedAt: "", items: items.map((x) => base(Object.assign({ spaceId: "sp" }, x))),
    spaces: [{ id: "sp", name: "Perso", emoji: "" }],
    boards: [{ id: "bd", spaceId: "sp", name: "Idées", emoji: "💡", tone: "", view: "kanban", lists: [{ id: "l1", name: "À explorer" }, { id: "l2", name: "Retenues" }] }],
    climbs: [], runs: [], settings: { carry: true } }, extra || {});
}
async function drag(page, fromSel, toSel, toOffset) {
  await page.waitForTimeout(120);   // laisser passer le rendu du geste précédent
  const a = await (await page.$(fromSel)).boundingBox();
  const b = await (await page.$(toSel)).boundingBox();
  const tx = b.x + (toOffset ? toOffset.x : b.width / 2), ty = b.y + (toOffset ? toOffset.y : Math.min(b.height / 2, 30));
  await page.mouse.move(a.x + 40, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 25, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

(async () => {
  const srv = await serve();
  U = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const T = D(0), Y = D(-1), TM = D(1);

  /* ── 1. Démarrage, saisie, coche, étiquettes ── */
  section("démarrage et saisie");
  {
    const { ctx, page, errors } = await fresh(browser);
    ok((await page.$$("#main .col")).length === 4, "4 horizons côte à côte par défaut");
    const heads = await page.$$eval("#main .col .col-title", (e) => e.map((x) => x.textContent.trim()));
    ok(heads.join(",") === "Aujourd'hui,Semaine,Mois,Année", "ordre des horizons (" + heads + ")");
    ok(await page.$('[data-col="day|' + T + '"] .tl.mini'), "la colonne du jour porte sa grille horaire");
    ok(await page.isVisible(".navpill .np-today"), "pastille « Aujourd'hui »");
    ok(/Idées/.test(await page.textContent("#sidebar")), "tableau d'exemple dans la barre latérale");
    await page.click('[data-col="day|' + T + '"] .add-btn');
    await page.keyboard.type("Appeler Paul #client #Urgent");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Relancer le devis");
    await page.keyboard.press("Enter");
    ok(await page.isVisible('[data-col="day|' + T + '"] .add-in'), "la saisie reste ouverte après Entrée");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    let s = await st(page);
    const a = s.items.find((x) => x.title === "Appeler Paul");
    ok(a && a.tags.join() === "client,urgent", "étiquettes tirées du titre (" + (a && a.tags) + ")");
    ok(a && a.h === "day" && a.key === T && a.order === 0, "posé aujourd'hui, en tête");
    ok(s.items.find((x) => x.title === "Relancer le devis").order === 1, "ordre de saisie gardé");
    ok((await page.$$('[data-col="day|' + T + '"] .it')).length === 2, "deux lignes dans la colonne");
    await page.click('.it[data-id="' + a.id + '"] .check');
    await page.waitForTimeout(100);
    s = await st(page);
    ok(s.items.find((x) => x.id === a.id).done && s.items.find((x) => x.id === a.id).doneAt === T, "coché, daté");
    ok(await page.$eval('[data-col="day|' + T + '"] .col-count', (e) => e.textContent) === "1/2", "compteur 1/2");
    // Brouillon validé au clic ailleurs
    await page.click('[data-col="day|' + T + '"] .add-btn');
    await page.keyboard.type("Brouillon perdu ?");
    await page.click("#main .col:nth-child(3) .col-title");
    await page.waitForTimeout(150);
    ok(!!(await item(page, "Brouillon perdu ?")), "brouillon validé en cliquant ailleurs");
    ok(errors.length === 0, "aucune erreur JS (1) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 2. Rattachements, sous-objectifs, glisser, annuler ── */
  section("rattachements et glisser");
  {
    const wk = await (async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto(U); const k = await p.$eval('#main .col:nth-child(2)', (e) => e.dataset.col); await b.close(); return k; })();
    const seed = seedWith([
      { id: "w1", title: "Signer deux clients", h: "week", key: wk.split("|")[1], tone: "violet" },
      { id: "t1", title: "Relancer Martin", h: "day", key: T, order: 0 },
      { id: "t2", title: "Préparer le devis", h: "day", key: T, order: 1 },
    ]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await page.click('.it[data-id="t1"] .it-body');
    ok(await page.isVisible("#sheet.on"), "fiche ouverte");
    await page.selectOption('#sheetBody select[data-f="parent"]', "w1");
    await page.waitForTimeout(100);
    ok((await item(page, "Relancer Martin")).parent === "w1", "rattaché à l'objectif de la semaine");
    // Sous-objectif imbriqué
    await page.fill("#fKid", "Trouver son numéro");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    const kid = await item(page, "Trouver son numéro");
    ok(kid && kid.parent === "t1" && !kid.h && !kid.boardId, "sous-objectif imbriqué créé");
    await page.click("#sheetClose");
    await page.waitForTimeout(350);
    ok(/↳ Signer deux clients/.test(await page.textContent('.it[data-id="t1"]')), "puce du parent");
    ok(await page.isVisible('.it[data-id="t1"] + .it-kids .it[data-id="' + kid.id + '"]'), "sous-objectif affiché sous son parent");
    ok(/0\/1/.test(await page.textContent('.it[data-id="w1"]')), "parent : 0/1");
    const tone = await page.$eval('.it[data-id="t1"]', (e) => getComputedStyle(e).getPropertyValue("--tone").trim());
    ok(tone === "#7c62e0", "couleur héritée du parent (" + tone + ")");
    await page.click('.it[data-id="t1"] .fold');
    await page.waitForTimeout(150);
    ok(!(await page.$('.it[data-id="' + kid.id + '"]')), "repli des sous-objectifs");
    const r0 = (await st(page)).rev;
    await page.click('.it[data-id="t1"] .fold');
    await page.waitForTimeout(150);
    ok((await st(page)).rev === r0, "replier ne touche pas aux données (révision inchangée)");
    // Glisser jour → semaine
    await drag(page, '.it[data-id="t2"] .it-body', '[data-col="' + wk + '"] .col-b');
    let s = await st(page);
    ok(s.items.find((x) => x.id === "t2").h === "week", "glissé du jour vers la semaine");
    ok(/Déplacé/.test(await page.textContent("#toastMsg")), "toast de déplacement");
    await page.click('.it[data-id="t1"] .check');   // une coche pendant le toast
    await page.click("#toastAct");
    await page.waitForTimeout(200);
    s = await st(page);
    ok(s.items.find((x) => x.id === "t2").h === "day" && s.items.find((x) => x.id === "t2").key === T, "annulation du déplacement");
    ok(s.items.find((x) => x.id === "t1").done === true, "la coche faite pendant le toast survit à l'annulation");
    // Réordonner dans la colonne
    await drag(page, '.it[data-id="t2"] .it-body', '.it[data-id="t1"]', { x: 60, y: 4 });
    s = await st(page);
    ok(s.items.find((x) => x.id === "t2").order < s.items.find((x) => x.id === "t1").order, "réordonné au-dessus");
    // Glisser vers un tableau de la barre latérale
    await drag(page, '.it[data-id="t2"] .it-body', '#sidebar a[data-zone="board:bd"]');
    s = await st(page);
    ok(s.items.find((x) => x.id === "t2").boardId === "bd" && s.items.find((x) => x.id === "t2").h === "day", "posé dans un tableau en gardant sa date");
    // Lien qui ne tient plus : la semaine descend au jour
    await page.click('.it[data-id="w1"] .it-body');
    await page.click('#sheetBody [data-mh="day"]');
    await page.waitForTimeout(100);
    s = await st(page);
    ok(s.items.find((x) => x.id === "t1").parent === "", "un parent devenu aussi petit que l'enfant perd le lien");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    // Pastille : toutes les colonnes suivent le jour de référence
    await page.waitForTimeout(200);
    await page.click('.navpill [data-act="fprev"]');
    ok(await page.$('[data-col="day|' + Y + '"]'), "‹ : la colonne du jour recule d'un jour");
    ok(/Hier/.test(await page.textContent('[data-col="day|' + Y + '"] .col-title')), "titre « Hier »");
    await page.click('.navpill [data-act="ftoday"]');
    ok(await page.$('[data-col="day|' + T + '"]'), "« Aujourd'hui » : retour au jour même");
    const rv = (await st(page)).rev;
    await page.click('.navpill [data-act="hzmenu"]');
    await page.click('#menu button:has-text("Trimestre")');
    ok(await page.$('#main .col[data-col^="quarter|"]'), "colonne du trimestre ajoutée");
    ok((await page.$$("#main .col")).length === 5, "cinq colonnes");
    await page.click('.navpill [data-act="hzmenu"]');
    await page.click('#menu button:has-text("Trimestre")');
    ok(!(await page.$('#main .col[data-col^="quarter|"]')), "colonne du trimestre retirée");
    ok((await st(page)).rev === rv, "choisir ses colonnes ne touche pas aux données");
    // Mode bande
    await page.click('#sidebar [data-sb="mode"][data-m="day"]');
    ok((await page.$$("#main .col")).length === 31, "bande des jours : 31 colonnes");
    const left = await page.evaluate((t) => { const s = document.querySelector(".strip"), c = s.querySelector('[data-col="day|' + t + '"]'); return Math.round(c.getBoundingClientRect().left - s.getBoundingClientRect().left); }, T);
    ok(Math.abs(left) <= 30, "aujourd'hui calé à gauche (" + left + ")");
    await page.evaluate(() => { document.querySelector(".strip").scrollLeft = 0; });
    await page.click('.strip [data-act="earlier"]');
    await page.waitForTimeout(500);
    ok((await page.$$("#main .col")).length === 45, "plus tôt : 14 jours de plus");
    await page.click('#sidebar [data-sb="mode"][data-m="all"]');
    ok(errors.length === 0, "aucune erreur JS (2) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 3. Récurrence ── */
  section("récurrence");
  {
    const seed = seedWith([{ id: "r1", title: "Lire 20 pages", h: "day", key: T }]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await page.click('.it[data-id="r1"] .it-body');
    await page.selectOption('#sheetBody select[data-f="freq"]', "daily");
    await page.waitForTimeout(100);
    let s = await st(page);
    ok(s.items.find((x) => x.id === "r1").repeat.freq === "daily", "série quotidienne");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    ok(await page.$('.it[data-id="r1@' + T + '"].virtual'), "occurrence du jour affichée");
    ok(!(await page.$('.it[data-id="r1"]')), "le modèle n'apparaît pas lui-même");
    await page.click('.it[data-id="r1@' + T + '"] .check');
    await page.waitForTimeout(100);
    s = await st(page);
    const occ = s.items.find((x) => x.seriesId === "r1" && x.occ === T);
    ok(occ && occ.done, "cocher une occurrence la rend réelle et faite");
    ok((await page.$$('[data-col="day|' + T + '"] .it')).length === 1, "pas de doublon après la coche");
    await nav(page, "#/cal");
    ok(await page.$('.cell[data-date="' + TM + '"] .it[data-id="r1@' + TM + '"]'), "le calendrier montre demain");
    // Passer l'occurrence de demain
    await page.click('.cell[data-date="' + TM + '"] .it[data-id="r1@' + TM + '"] .it-body');
    ok(/Occurrence/.test(await page.textContent("#sheetBody .banner")), "bandeau d'occurrence");
    await page.click('#sheetBody [data-act="skipocc"]');
    await page.waitForTimeout(350);
    ok(!(await page.$('.it[data-id="r1@' + TM + '"]')), "occurrence passée");
    ok(await page.$('.it[data-id="r1@' + D(2) + '"]'), "les suivantes restent");
    // Hebdomadaire lundi + mercredi
    await page.click('.cell .it[data-id="r1@' + D(2) + '"] .it-body');
    await page.selectOption('#sheetBody select[data-f="freq"]', "weekly");
    await page.waitForTimeout(100);
    const wdNow = await page.$$eval('#sheetBody .wd [aria-pressed="true"]', (e) => e.length);
    ok(wdNow === 1, "hebdomadaire : jour de départ coché");
    await page.click('#sheetBody .wd [data-wd="0"]'); // lundi
    await page.click('#sheetBody .wd [data-wd="2"]'); // mercredi
    s = await st(page);
    const days = s.items.find((x) => x.id === "r1").repeat.days.sort().join();
    ok(days.includes("0") && days.includes("2"), "jours choisis (" + days + ")");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    const shown = await page.$$eval('.cell .it[data-id^="r1@"]', (e) => e.map((x) => x.dataset.id.split("@")[1]));
    const wds = new Set(shown.map((d) => (new Date(d + "T12:00").getDay() + 6) % 7));
    ok(shown.length > 0 && [...wds].every((w) => days.split(",").map(Number).includes(w)), "seuls les jours choisis apparaissent");
    ok(errors.length === 0, "aucune erreur JS (3) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 4. Report automatique et retard ── */
  section("report");
  {
    const seed = seedWith([
      { id: "o1", title: "Oubliée hier", h: "day", key: Y },
      { id: "o2", title: "Faite hier", h: "day", key: Y, done: true, doneAt: Y },
      { id: "o3", title: "Vieille semaine", h: "week", key: "2020-W10" },
      { id: "o4", title: "Étape d'ascension", h: "day", key: Y, runId: "run" },
    ]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    let s = await st(page);
    ok(s.items.find((x) => x.id === "o1").key === T && s.items.find((x) => x.id === "o1").carried === 1, "non fait d'hier reporté à aujourd'hui");
    ok(s.items.find((x) => x.id === "o2").key === Y, "le fait reste à sa date");
    ok(s.items.find((x) => x.id === "o3").key !== "2020-W10", "vieille semaine reportée à cette semaine");
    ok(s.items.find((x) => x.id === "o4").key === Y, "une étape d'ascension n'est pas reportée");
    ok(/reporté/.test(await page.textContent("#toastMsg")), "toast de report");
    ok(/reporté 1×/.test(await page.textContent('.it[data-id="o1"]')), "mention « reporté 1× »");
    await ctx.close();
    const seed2 = seedWith([{ id: "o1", title: "Oubliée hier", h: "day", key: Y }], { settings: { carry: false } });
    const r2 = await fresh(browser, {}, seed2, { space: "sp" });
    s = await st(r2.page);
    ok(s.items[0].key === Y, "report désactivé : l'élément reste");
    ok(/1 élément en retard/.test(await r2.page.textContent('[data-col="day|' + T + '"]')), "bouton « ramener ici »");
    await r2.page.click('[data-col="day|' + T + '"] .late-btn');
    s = await st(r2.page);
    ok(s.items[0].key === T, "ramené d'un geste");
    await r2.page.click("#toastAct"); await r2.page.waitForTimeout(150);
    ok((await st(r2.page)).items[0].key === Y, "annulation du rattrapage");
    ok(errors.length === 0 && r2.errors.length === 0, "aucune erreur JS (4) " + errors.concat(r2.errors).join(" | "));
    await r2.ctx.close();
  }

  /* ── 5. Tableaux ── */
  section("tableaux");
  {
    const seed = seedWith([{ id: "k1", title: "Podcast", boardId: "bd", listId: "l1" }, { id: "k2", title: "Atelier", boardId: "bd", listId: "l1", border: 1 }]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await nav(page, "#/b/bd");
    ok((await page.$$("#main .col.list")).length === 2, "deux listes en colonnes");
    await page.click('[data-zone="list:bd|l2"] .add-btn');
    await page.keyboard.type("Kit de démarrage"); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok((await item(page, "Kit de démarrage")).listId === "l2", "ajout dans une liste");
    await drag(page, '.it[data-id="k1"] .it-body', '[data-zone="list:bd|l2"] .col-b');
    ok((await item(page, "Podcast")).listId === "l2", "glissé d'une liste à l'autre");
    await page.click('#main .view-tools [data-act="ladd"]');
    await page.fill("#dlgIn", "Lancées"); await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    ok((await st(page)).boards[0].lists.length === 3, "nouvelle liste");
    await page.click('[data-act="bview"][data-v="list"]');
    ok(await page.$(".list-view .lsec"), "vue liste");
    const rev = (await st(page)).rev;
    await page.click('.lsec [data-act="lfold"]');
    ok((await st(page)).rev === rev, "replier une liste ne touche pas aux données");
    ok(await page.$(".lsec.closed"), "liste repliée");
    // Créer un tableau depuis la barre latérale
    await page.click('#sidebar [data-sb="board-add"]');
    await page.fill("#dlgIn", "Lectures"); await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    ok(/Lectures/.test(await page.textContent("#main h1")), "nouveau tableau ouvert");
    ok(errors.length === 0, "aucune erreur JS (5) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 6. Calendrier et grille horaire ── */
  section("calendrier");
  {
    const seed = seedWith([{ id: "c1", title: "Réunion", h: "day", key: T }, { id: "c2", title: "Sport", h: "day", key: T, time: "07:00", dur: 60 }]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await nav(page, "#/cal");
    ok((await page.$$(".cal .cell")).length === 42, "grille de 6 semaines");
    ok(await page.$('.cell.today[data-date="' + T + '"]'), "aujourd'hui marqué");
    await drag(page, '.cell[data-date="' + T + '"] .it[data-id="c1"] .it-body', '.cell[data-date="' + TM + '"]');
    ok((await item(page, "Réunion")).key === TM, "glissé d'un jour à l'autre");
    await page.click('.cell[data-date="' + T + '"] .cell-n');
    await page.waitForTimeout(250);
    ok(/Aujourd'hui/.test(await page.textContent("#main h1")), "vers la journée");
    ok(await page.$('.blk[data-id="c2"]'), "bloc horaire à 7 h");
    const top = await page.$eval('.blk[data-id="c2"]', (e) => parseInt(e.style.top, 10));
    ok(top === 420, "placé à 07:00 (" + top + ")");
    // Planifier : glisser depuis la colonne vers 14 h
    await nav(page, "#/day/" + TM);
    const tl = await page.$(".tl");
    await page.evaluate(() => { document.querySelector(".tl-wrap").scrollTop = 13 * 60; });
    await page.waitForTimeout(100);
    const tb = await tl.boundingBox();
    const src = await (await page.$('.unsched .it[data-id="c1"] .it-body')).boundingBox();
    await page.mouse.move(src.x + 30, src.y + 8); await page.mouse.down();
    await page.mouse.move(src.x + 50, src.y + 20, { steps: 3 });
    const y14 = tb.y + 14 * 60 + 8;
    await page.mouse.move(tb.x + 100, y14, { steps: 10 });
    await page.waitForTimeout(50);
    ok(await page.isVisible(".dz-time"), "aperçu de l'heure visée");
    await page.mouse.up(); await page.waitForTimeout(300);
    const c1 = await item(page, "Réunion");
    ok(c1.time === "14:00", "planifié à 14:00 (" + c1.time + ")");
    // Durée : tirer la poignée de 30 min
    const rs = await (await page.$('.blk[data-id="c1"] .rs')).boundingBox();
    await page.mouse.move(rs.x + rs.width / 2, rs.y + 3); await page.mouse.down();
    await page.mouse.move(rs.x + rs.width / 2, rs.y + 33, { steps: 6 });
    await page.mouse.up(); await page.waitForTimeout(250);
    ok((await item(page, "Réunion")).dur === 90, "durée allongée à 1 h 30 (" + (await item(page, "Réunion")).dur + ")");
    // Toucher une plage vide → saisie à l'heure
    await page.mouse.click(tb.x + 200, tb.y + 16 * 60 + 10);
    await page.waitForTimeout(200);
    ok(await page.isVisible("#sheet.on #qaTitle"), "plage vide : saisie rapide");
    await page.fill("#qaTitle", "Appel fournisseur");
    await page.click("#qaGo"); await page.waitForTimeout(250);
    const ap = await item(page, "Appel fournisseur");
    ok(ap && ap.time === "16:00" && ap.key === TM, "créé à 16:00 (" + (ap && ap.time) + ")");
    ok(errors.length === 0, "aucune erreur JS (6) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 7. Ascensions, progrès, recherche, à ranger ── */
  section("ascensions, progrès, recherche");
  {
    const seed = seedWith([
      { id: "p1", title: "Devis Martin #client", h: "day", key: T, tags: ["client"], note: "Appeler avant midi" },
      { id: "p2", title: "Ancienne", h: "day", key: D(-3), done: true, doneAt: D(-3) },
    ]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await nav(page, "#/climbs");
    ok((await page.$$("#main .card")).length >= 8, "bibliothèque d'ascensions");
    await page.click('[data-act="cstart"][data-climb="b-medit"]');
    await page.click("#cGo"); await page.waitForTimeout(250);
    let s = await st(page);
    const run = s.runs[0];
    const steps = s.items.filter((x) => x.runId === run.id);
    ok(steps.length === 10 && steps[0].key === T && steps[9].key === D(9), "10 étapes posées de jour en jour");
    ok(/Méditer 3 min/.test(steps.map((x) => x.title).join()), "étapes nommées");
    ok(/0\/10/.test(await page.textContent(".card.run")), "carte de progression");
    await page.click('[data-act="rstop"]');
    await page.click('#dialog [data-i="0"]'); await page.waitForTimeout(200);
    s = await st(page);
    ok(!s.items.some((x) => x.runId === run.id) && !s.runs.length, "arrêter retire les étapes à venir");
    await page.click('[data-act="cnew"]');
    await page.fill("#ceTitle", "Marche"); await page.fill("#ceSteps", "Marcher 20 min\nMarcher 25 min\nMarcher 30 min");
    await page.click('[data-cad="alt"]'); await page.click("#ceSave"); await page.waitForTimeout(200);
    s = await st(page);
    ok(s.climbs.length === 1 && s.climbs[0].steps.map((x) => x.d).join() === "0,2,4", "ascension perso un jour sur deux");
    await nav(page, "#/progress");
    const kv = await page.$$eval(".kpi .kv", (e) => e.map((x) => x.textContent));
    ok(kv.length === 5, "cinq indicateurs");
    ok((await page.$$(".bars .bcol")).length === 12, "douze semaines");
    await nav(page, "#/search");
    await page.fill("#sQ", "midi");
    await page.waitForTimeout(150);
    ok(await page.$('#main .results .it[data-id="p1"]'), "recherche dans les notes");
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "sQ"), "le champ garde le focus en tapant");
    await nav(page, "#/search/client");
    ok(await page.$('#main .results .it[data-id="p1"]'), "filtre par étiquette");
    // À ranger : saisie sans date
    await nav(page, "#/inbox");
    await page.click("#main .add-btn"); await page.keyboard.type("Idée en vrac"); await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const iv = await item(page, "Idée en vrac");
    ok(iv && !iv.h && !iv.boardId, "élément à ranger");
    ok(/1/.test(await page.textContent('#sidebar a[href="#/inbox"]')), "compteur « À ranger »");
    ok(errors.length === 0, "aucune erreur JS (7) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 8. Notes markdown, suppression, espaces, réglages, clavier ── */
  section("notes, espaces, réglages, clavier");
  {
    const seed = seedWith([{ id: "n1", title: "Note test", h: "day", key: T }]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await page.click('.it[data-id="n1"] .it-body');
    await page.fill("#fNote", "# Titre\n- [ ] case\n**gras** <img src=x onerror=alert(1)> [x](javascript:alert(1)) https://exemple.fr");
    await page.click('#sheetBody [data-note="view"]');
    ok(await page.$("#fNoteView h3"), "titre markdown");
    ok(await page.$("#fNoteView strong"), "gras");
    ok(!(await page.$("#fNoteView img")), "HTML échappé : pas d'image injectée");
    ok(!(await page.$('#fNoteView a[href^="javascript"]')), "pas de lien javascript:");
    ok(await page.$('#fNoteView a[href="https://exemple.fr"]'), "lien automatique https");
    await page.click("#fNoteView .box");
    ok(/- \[x\] case/.test((await item(page, "Note test")).note), "cocher dans l'aperçu modifie la note");
    // Supprimer, annuler
    await page.click('#sheetBody [data-act="del"]');
    await page.click('#dialog [data-i="0"]'); await page.waitForTimeout(200);
    ok(!(await item(page, "Note test")), "supprimé");
    await page.click("#toastAct"); await page.waitForTimeout(150);
    ok(!!(await item(page, "Note test")), "suppression annulée");
    // Espaces
    await page.click('#sidebar [data-sb="space-add"]');
    await page.fill("#dlgIn", "Travail"); await page.keyboard.press("Enter"); await page.waitForTimeout(250);
    let s = await st(page);
    ok(s.spaces.length === 2, "nouvel espace");
    ok(!(await page.$('.it[data-id="n1"]')), "l'espace neuf est vide");
    await page.click('#sidebar [data-space="sp"]'); await page.waitForTimeout(200);
    ok(await page.$('.it[data-id="n1"]'), "retour à l'espace d'origine");
    // Les choix d'affichage n'avancent pas la révision
    const rev = (await st(page)).rev;
    await page.click('#sidebar [data-sb="mode"][data-m="week"]');
    await page.click('.navpill [data-act="hzmenu"]');
    await page.click('#menu button:has-text("Masquer")');
    ok((await st(page)).rev === rev, "affichage local : révision inchangée");
    await page.click('#sidebar [data-sb="mode"][data-m="all"]');
    // Clavier
    await page.click("#main .col-title");
    await page.keyboard.press("n");
    ok(await page.isVisible("#qaTitle"), "N : nouvel élément");
    await page.keyboard.type("Par le clavier"); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
    ok((await item(page, "Par le clavier")).key === T, "créé aujourd'hui");
    await page.keyboard.press("c"); await page.waitForTimeout(200);
    ok(/Calendrier/.test(await page.textContent("#main h1")), "C : calendrier");
    await page.keyboard.press("/"); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.activeElement.id === "sQ"), "/ : recherche avec focus");
    await page.click("#main h1");
    await page.keyboard.press("?"); await page.waitForTimeout(150);
    ok(/Raccourcis/.test(await page.textContent("#sheetTitle")), "? : aide");
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    // Sauvegarde depuis la barre latérale
    await page.click('#sidebar [data-sb="export"]');
    ok(/Exporter/.test(await page.textContent("#sheetTitle")), "« Sauvegarder » ouvre l'export");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    // Réglages : thème, export, import
    await page.click('#sidebar [data-sb="settings"]');
    await page.click('#sheetBody [data-theme="dark"]');
    ok(await page.evaluate(() => document.documentElement.dataset.theme === "dark"), "thème sombre");
    await page.click('#sheetBody [data-set="export"]');
    const exp = JSON.parse(await page.inputValue("#expBox"));
    ok(exp.items.length >= 2 && Array.isArray(exp.boards), "export complet");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    await page.click('#sidebar [data-sb="settings"]');
    await page.click('#sheetBody [data-set="import"]');
    const imp = JSON.parse(JSON.stringify(exp)); imp.items = imp.items.slice(0, 1); imp.items[0].title = "Importé";
    await page.fill("#impBox", JSON.stringify(imp));
    await page.click('#sheetBody [data-x="go"]');
    await page.click('#dialog [data-i="0"]'); await page.waitForTimeout(250);
    s = await st(page);
    ok(s.items.length === 1 && s.items[0].title === "Importé", "import remplace le contenu");
    await page.click("#toastAct"); await page.waitForTimeout(200);
    ok((await st(page)).items.length >= 2, "import annulable");
    ok(errors.length === 0, "aucune erreur JS (8) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 9. Données abîmées, champs inconnus, rappels ── */
  section("robustesse et rappels");
  {
    const now = new Date(); const past = String(Math.max(0, now.getHours() - 1)).padStart(2, "0") + ":00";
    const bad = { items: [{ id: "x1", title: "Boucle A", parent: "x2", h: "week", key: "pas-une-cle" }, { id: "x2", title: "Boucle B", parent: "x1" },
      { id: "x3", title: "Rappel", h: "day", key: T, remind: past }, { title: "Sans id", h: "nimporte" }, null, 42],
      spaces: [], boards: [{ name: "Cassé", lists: "non" }], futur: { garde: true } };
    const { ctx, page, errors } = await fresh(browser, {}, bad);
    const s = await st(page);
    ok(s.items.length === 4, "éléments invalides écartés (" + s.items.length + ")");
    const a = s.items.find((x) => x.id === "x1"), b = s.items.find((x) => x.id === "x2");
    ok(!(a.parent === "x2" && b.parent === "x1"), "boucle de parents cassée");
    ok(/^\d{4}-W\d{2}$/.test(a.key), "clé de période réparée");
    ok(s.spaces.length === 1 && s.boards[0].lists.length === 1, "espace et liste par défaut");
    ok(s.futur && s.futur.garde === true, "champ inconnu conservé");
    if (now.getHours() >= 1) {
      await page.waitForTimeout(300);
      ok(await page.isVisible("#due"), "rappel affiché");
      ok(await page.evaluate((t) => { const u = JSON.parse(localStorage.getItem("horizons-ui-v1")); return u.fired && u.fired.day === t && !!u.fired.ids.x3; }, T), "rappel noté comme sonné, sur cet appareil");
      const r0 = (await st(page)).rev;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForTimeout(200);
      ok((await st(page)).rev === r0, "un rappel qui sonne ne modifie pas les données");
    }
    ok(errors.length === 0, "aucune erreur JS (9) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 10. Calendrier ISO autour du Nouvel An ── */
  section("semaines ISO");
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date("2026-12-31T10:00:00"));
    await page.goto(U); await page.waitForTimeout(300);
    const sub = (n) => page.$eval('#main .col:nth-child(' + n + ') .col-sub', (e) => e.textContent);
    ok(/28 déc\. – 3 janv\. · S53/.test(await sub(2)), "31 déc. 2026 : semaine 53, à cheval sur l'année (" + await sub(2) + ")");
    await page.click('.navpill [data-act="hzmenu"]');
    await page.click('#menu button:has-text("Trimestre")'); await page.waitForTimeout(150);
    ok(/^T4 2026/.test(await sub(4)), "trimestre T4 (" + await sub(4) + ")");
    await page.click('.navpill [data-act="fnext"]'); await page.waitForTimeout(150);
    ok(/S53/.test(await sub(2)), "1er janv. 2027 : toujours la semaine 53");
    ok(/^T1 2027/.test(await sub(4)) && (await sub(5)) === "2027", "1er janv. 2027 : T1 2027, année 2027");
    for (let i = 0; i < 3; i++) { await page.click('.navpill [data-act="fnext"]'); await page.waitForTimeout(120); }
    ok(/S1$/.test(await sub(2)), "4 janv. 2027 : semaine 1 (" + await sub(2) + ")");
    await page.keyboard.press("t"); await page.waitForTimeout(150);
    ok(/S53/.test(await sub(2)), "T : retour au jour même");
    await ctx.close();
  }

  /* ── 11. Calendrier de vie, fond d'écran ── */
  section("vie et fond d'écran");
  {
    const seed = seedWith([{ id: "v1", title: "Courir un marathon", h: "life", key: "vie" }, { id: "v2", title: "Fait en mars", h: "day", key: T.slice(0, 4) + "-03-02", done: true, doneAt: T }]);
    const { ctx, page, errors } = await fresh(browser, {}, seed, { space: "sp" });
    await page.keyboard.press("v"); await page.waitForTimeout(200);
    ok(/Vie/.test(await page.textContent("#main h1")), "V : calendrier de vie");
    ok(await page.isVisible("#lifeBirth"), "demande l'année de naissance");
    await page.fill("#lifeBirth", "1990"); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
    ok((await st(page)).settings.birth === 1990, "année de naissance enregistrée");
    const yNow = +T.slice(0, 4);
    ok((await page.$$("#main .ly")).length === 80, "80 années affichées");
    ok(await page.$('.ly.now[data-y="' + yNow + '"]') && await page.$('.ly.past[data-y="' + (yNow - 1) + '"]'), "année en cours marquée, années passées barrées");
    ok(/1/.test(await page.textContent('.ly[data-y="' + yNow + '"]')), "Réflexion : un élément fait cette année");
    ok(await page.$('.ld.now[data-d="' + T + '"]') && (await page.$$(".ld-row")).length === 12, "cette année jour par jour, aujourd'hui entouré");
    ok(await page.$('.life-goals .it[data-id="v1"]'), "objectifs de vie listés");
    await page.click('.ld[data-d="' + TM + '"]'); await page.waitForTimeout(250);
    ok(await page.$('#main [data-col="day|' + TM + '"]'), "toucher un jour : les horizons se calent dessus");
    ok(/Demain/.test(await page.textContent('[data-col="day|' + TM + '"] .col-title')), "colonne « Demain »");
    await page.click('#sidebar [data-sb="settings"]');
    await page.click('#sheetBody [data-wall="lagon"]');
    ok(await page.evaluate(() => document.body.dataset.wall === "lagon"), "fond d'écran appliqué");
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem("horizons-ui-v1")).wall === "lagon"), "fond d'écran gardé sur l'appareil");
    await page.click('#sheetBody [data-col="decade"]');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem("horizons-ui-v1")).hzCols.includes("decade")), "colonne ajoutée depuis les réglages");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    ok(await page.$('#main .col[data-col^="decade|"]'), "colonne de la décennie affichée");
    await page.click('#sidebar [data-sb="panel"]');
    ok(!(await page.isVisible("#sidebar .sb-panel")), "panneau masqué");
    await page.click('#sidebar [data-sb="panel"]');
    ok(await page.isVisible("#sidebar .sb-panel"), "panneau réaffiché");
    ok(errors.length === 0, "aucune erreur JS (11) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 11 bis. Mode d'emploi ── */
  section("mode d'emploi");
  {
    const { ctx, page, errors } = await fresh(browser, {}, seedWith([]), { space: "sp" });
    ok(await page.isVisible('#sidebar a[href="#/guide"]'), "lien « Mode d'emploi » dans le rail");
    await page.click('#sidebar a[href="#/guide"]'); await page.waitForTimeout(200);
    ok(/Mode d'emploi/.test(await page.textContent("#main h1")), "écran du mode d'emploi");
    const heads = await page.$$eval("#main .g-sec h2", (e) => e.map((x) => x.textContent));
    ok(heads.length === 7 && heads.includes("Plusieurs appareils"), "sept rubriques, dont « Plusieurs appareils » (" + heads + ")");
    ok((await page.$$("#main a.g-card")).length === 8, "les écrans, avec leurs liens");
    await page.click('[data-act="gspace"]'); await page.waitForTimeout(150);
    let s = await st(page);
    const ag = s.spaces.find((x) => x.name === "Agence");
    ok(ag && s.spaces.length === 2, "espace « Agence » créé");
    ok(!(await page.$('[data-act="gspace"]')), "étape marquée faite");
    await page.click('[data-act="gdeals"]'); await page.waitForTimeout(250);
    s = await st(page);
    const deals = s.boards.find((b) => b.name === "Deals");
    ok(deals && deals.spaceId === ag.id && deals.lists.map((l) => l.name).join() === "Prospects,En discussion,Signés,En production,Livrés", "tableau « Deals » en cinq étapes, dans l'espace Agence");
    ok(await page.evaluate((id) => location.hash === "#/b/" + id, deals.id) && (await page.$$("#main .col.list")).length === 5, "tableau ouvert");
    await nav(page, "#/guide");
    await page.click('[data-act="gdeals"]').catch(() => {});
    ok((await st(page)).boards.filter((b) => b.name === "Deals").length === 1, "pas de second tableau « Deals »");
    await nav(page, "#/guide");
    await page.click('[data-act="grevue"]'); await page.waitForTimeout(200);
    ok(/Revue hebdomadaire/.test(await page.textContent("#sheetTitle")), "revue hebdomadaire proposée");
    await page.click("#cGo"); await page.waitForTimeout(250);
    ok((await st(page)).runs.some((r) => r.climbId === "b-revue"), "revue hebdomadaire lancée");
    await page.click('[data-act="gexport"]'); await page.waitForTimeout(200);
    ok(/Exporter/.test(await page.textContent("#sheetTitle")), "export depuis le mode d'emploi");
    await page.click("#sheetClose"); await page.waitForTimeout(300);
    await page.keyboard.press("?"); await page.waitForTimeout(200);
    await page.click('#sheetBody [data-x="guide"]'); await page.waitForTimeout(300);
    ok(!(await page.isVisible("#sheet.on")) && /Mode d'emploi/.test(await page.textContent("#main h1")), "depuis l'aide des raccourcis");
    ok(errors.length === 0, "aucune erreur JS (guide) " + errors.join(" | "));
    await ctx.close();
  }

  /* ── 12. Téléphone : tiroir, appui long, balayage, fiche ── */
  section("téléphone");
  {
    const seed = seedWith([{ id: "m1", title: "Courir", h: "day", key: T }, { id: "m2", title: "Lire", h: "day", key: T, order: 1 }]);
    const { ctx, page, errors } = await fresh(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, seed, { space: "sp" });
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    ok(await page.isVisible(".topbar"), "barre du haut");
    ok(!(await page.isVisible("#sidebar .brand")) || (await page.$eval("#sidebar", (e) => e.getBoundingClientRect().right <= 0)), "barre latérale cachée");
    await page.tap("#menuBtn"); await page.waitForTimeout(300);
    ok(await page.$eval("#sidebar", (e) => e.getBoundingClientRect().left >= 0), "tiroir ouvert");
    await page.tap('#sidebar a[href="#/cal"]'); await page.waitForTimeout(350);
    ok(/Calendrier/.test(await page.textContent("#main h1")) && !(await page.evaluate(() => document.body.classList.contains("drawer"))), "navigation et fermeture du tiroir");
    ok(await page.$(".cal.mini"), "calendrier compact");
    await page.tap('.cell[data-date="' + TM + '"]'); await page.waitForTimeout(200);
    ok(await page.$('.col.agenda[data-zone="col:day|' + TM + '"]'), "jour choisi listé sous la grille");
    await nav(page, "#/horizons");
    await page.evaluate(() => window.scrollTo(0, 0));
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(ov <= 0, "pas de débordement horizontal (" + ov + ")");
    // Balayage rapide : défilement, pas de glisser
    const it = await (await page.$('.it[data-id="m1"] .it-body')).boundingBox();
    const before = await page.$eval(".board-x", (e) => e.scrollLeft);
    await touch("touchStart", it.x + 80, it.y + 10);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", it.x + 80 - i * 30, it.y + 10); await page.waitForTimeout(16); }
    await touch("touchEnd"); await page.waitForTimeout(400);
    ok(await page.$eval(".board-x", (e) => e.scrollLeft) > before, "balayage : la bande défile");
    ok(!(await page.$(".drag-ghost")) && (await item(page, "Courir")).h === "day", "balayage : rien ne bouge");
    // Appui long : réordonner dans la colonne
    await page.click('.navpill [data-act="ftoday"]'); await page.waitForTimeout(900);
    const off = await page.evaluate((t) => { const s = document.querySelector(".strip"), c = s.querySelector('[data-col="day|' + t + '"]'); return Math.round(c.getBoundingClientRect().left - s.getBoundingClientRect().left); }, T);
    ok(Math.abs(off) <= 20, "« Aujourd'hui » ramène la bande sur le jour (" + off + ")");
    ok(await page.isVisible(".tabs-b"), "onglets d'horizons en bas");
    await page.tap('.tabs-b [data-m="week"]'); await page.waitForTimeout(250);
    ok(await page.$('#main .strip .col[data-col^="week|"]'), "onglet Semaines");
    await page.tap('.tabs-b [data-m="day"]'); await page.waitForTimeout(400);
    const m2 = await (await page.$('.it[data-id="m2"] .it-body')).boundingBox();
    const m1 = await (await page.$('.it[data-id="m1"]')).boundingBox();
    await touch("touchStart", m2.x + 40, m2.y + 8);
    await page.waitForTimeout(450);
    ok(await page.isVisible(".drag-ghost"), "appui long : élément soulevé");
    for (let i = 1; i <= 6; i++) { await touch("touchMove", m2.x + 40, m2.y + 8 - i * ((m2.y - m1.y + 6) / 6)); await page.waitForTimeout(20); }
    await touch("touchEnd"); await page.waitForTimeout(350);
    const so = await st(page);
    ok(so.items.find((x) => x.id === "m2").order < so.items.find((x) => x.id === "m1").order, "appui long : réordonné");
    await page.waitForTimeout(350);
    await page.tap('.it[data-id="m1"] .it-body'); await page.waitForTimeout(350);
    ok(await page.isVisible("#sheet.on"), "toucher : fiche ouverte");
    const sh = await page.$eval("#sheet", (e) => e.getBoundingClientRect());
    ok(sh.left === 0 && sh.width === 390, "fiche en feuille du bas");
    ok(errors.length === 0, "aucune erreur JS (12) " + errors.join(" | "));
    await ctx.close();
  }

  ok(outside.length === 0, "aucune requête hors du site de l'application (" + outside.slice(0, 3).join(", ") + ")");
  await browser.close();
  srv.close();
  console.log(pass + " vérifications réussies, " + fail + " échec(s)");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
