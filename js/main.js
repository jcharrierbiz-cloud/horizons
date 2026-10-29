/* Horizons — chef d'orchestre : navigation, barre latérale, saisie rapide,
   glisser-déposer, raccourcis, rappels, report automatique, réglages. */

import { $, $$, esc, isTyping, plural, uid, deepCopy } from "./util.js";
import { HZ, hzIdx, today, periodOf, addDays, where, hm, toMin } from "./dates.js";
import {
  S, load, commit, onRender, scheduleRender, renderNow, snapshot, restore, ui, saveUI, space, spaceId, storageOK, replaceState, normalize, seed,
} from "./store.js";
import {
  buildIndex, createItem, resolve, real, moveTo, setBoard, unplace, toggle, carryOver, placeLabel, kidsOf, matches,
} from "./items.js";
import { itemRow } from "./render.js";
import { icon, toast, initToast, ask, menu, promptText, openSheet, closeSheet, isSheetOpen } from "./ui.js";
import { initDnd, isDragging } from "./dnd.js";
import { openItem, quickAdd } from "./sheet-item.js";
import * as HV from "./views/horizons.js";
import * as BV from "./views/board.js";
import * as CV from "./views/calendar.js";
import * as KV from "./views/climbs.js";
import * as PV from "./views/progress.js";
import * as SV from "./views/search.js";

/* ── Route ── */
function route() {
  const h = location.hash || ui.lastRoute || "#/horizons";
  const parts = h.replace(/^#\/?/, "").split("/");
  const v = parts[0] || "horizons";
  const known = ["horizons", "cal", "day", "b", "climbs", "progress", "search", "inbox"];
  return { view: known.includes(v) ? v : "horizons", arg: parts.slice(1).join("/") };
}
const TITLES = { horizons: "Horizons", cal: "Calendrier", day: "Journée", b: "Tableau", climbs: "Ascensions", progress: "Progrès", search: "Recherche", inbox: "À ranger" };

/* ── Saisie rapide en bas de colonne ── */
let addState = null;   // { dest, value }

function createAt(dest, title) {
  const [type, rest] = [dest.split(":")[0], dest.slice(dest.indexOf(":") + 1)];
  if (type === "col") { const [h, k] = rest.split("|"); return createItem({ title, h, key: k }); }
  if (type === "list") { const [b, l] = rest.split("|"); return createItem({ title, boardId: b, listId: l }); }
  return createItem({ title });
}
function openAdd(slot, value) {
  const other = $(".add-in");
  if (other && other.closest(".add-slot") !== slot) commitAdd(other, false);
  const dest = slot.dataset.add;
  addState = { dest, value: value || "" };
  slot.innerHTML = '<input class="add-in" placeholder="Nouvel élément — Entrée pour valider" maxlength="300" enterkeyhint="done" aria-label="Nouvel élément">';
  const inp = slot.firstChild;
  inp.value = addState.value;
  try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
}
function commitAdd(inp, keep) {
  const slot = inp.closest(".add-slot"); if (!slot) return;
  const v = inp.value.trim(), dest = slot.dataset.add;
  inp.value = "";
  if (v) {
    const it = createAt(dest, v);
    commit({ silent: true });
    const ix = buildIndex();
    slot.insertAdjacentHTML("beforebegin", itemRow(ix, it, dest.startsWith("list:") ? { place: true, board: false } : { dur: true }));
  }
  if (keep) { addState = { dest, value: "" }; return; }
  addState = null;
  scheduleRender();
}

/* ── Rendu ── */
const main = () => $("#main");
function render() {
  const m = main(), r = route();
  if (isDragging()) { scheduleRender(); return; }
  /* On garde : défilements, champ actif, saisie en cours. */
  const scrolls = {};
  $$("[data-scroll-key]", m).forEach((el) => { scrolls[el.dataset.scrollKey] = [el.scrollLeft, el.scrollTop]; });
  const act = document.activeElement, focusId = act && m.contains(act) && act.id ? act.id : null;
  const sel = focusId && act.setSelectionRange ? [act.selectionStart, act.selectionEnd] : null;
  const winY = window.scrollY, sameView = m.dataset.view === r.view + "/" + r.arg;
  const addInput = $(".add-in", m);
  if (addInput && addState) addState.value = addInput.value;

  m.dataset.view = r.view + "/" + r.arg;
  document.title = TITLES[r.view] + " · Horizons";
  $("#topTitle").textContent = r.view === "b" ? ((BV.boardOf(r.arg) || {}).name || "Tableau") : TITLES[r.view];
  switch (r.view) {
    case "cal": CV.renderMonth(m); break;
    case "day": CV.renderDay(m, r.arg === "today" ? today() : r.arg); break;
    case "b": BV.render(m, r.arg); break;
    case "climbs": KV.render(m); break;
    case "progress": PV.render(m); break;
    case "search": SV.render(m, r.arg); break;
    case "inbox": SV.renderInbox(m); break;
    default: HV.render(m);
  }
  const skip = m.dataset.skipRestore; delete m.dataset.skipRestore;
  if (sameView) {
    $$("[data-scroll-key]", m).forEach((el) => {
      const s = scrolls[el.dataset.scrollKey];
      if (s && el.dataset.scrollKey !== skip) { el.scrollLeft = s[0]; el.scrollTop = s[1]; }
    });
    if (Math.abs(window.scrollY - winY) > 1) window.scrollTo(0, winY);
  }
  HV.afterRender(m);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { try { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignoré */ } }
  }
  if (addState) {
    const slot = $$(".add-slot", m).find((s) => s.dataset.add === addState.dest);
    if (slot) openAdd(slot, addState.value); else addState = null;
  }
  renderSidebar();
}

/* ── Barre latérale ── */
function renderSidebar() {
  const r = route(), sp = space();
  const boards = S.state.boards.filter((b) => b.spaceId === sp.id);
  const inbox = S.state.items.filter((x) => x.spaceId === sp.id && !x.h && !x.boardId && !x.parent && !x.repeat && !x.done).length;
  const link = (hash, ic, label, extra, zone) => {
    const on = ("#/" + r.view + (r.arg && r.view === "b" ? "/" + r.arg : "")) === hash || (hash === "#/day/today" && r.view === "day");
    return '<a class="nav' + (on ? " on" : "") + '" href="' + hash + '"' + (zone ? ' data-zone="' + esc(zone) + '"' : "") + ">" + ic + "<span>" + esc(label) + "</span>" + (extra || "") + "</a>";
  };
  $("#sidebar").innerHTML = '<div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span><b>Horizons</b></div>'
    + '<div class="spaces">' + S.state.spaces.map((s) => '<button class="space' + (s.id === sp.id ? " on" : "") + '" data-space="' + s.id + '" title="' + esc(s.name) + '">'
      + (s.emoji ? esc(s.emoji) + " " : "") + esc(s.name) + "</button>").join("")
    + '<button class="space add" data-sb="space-add" aria-label="Nouvel espace">' + icon("plus") + "</button></div>"
    + '<button class="btn primary block" data-sb="add">' + icon("plus") + 'Nouvel élément <kbd>N</kbd></button>'
    + '<nav class="sb-nav">'
    + link("#/horizons", icon("horizons"), "Horizons")
    + link("#/cal", icon("calendar"), "Calendrier")
    + link("#/day/today", icon("clock"), "Journée")
    + link("#/inbox", icon("list"), "À ranger", inbox ? '<span class="cnt">' + inbox + "</span>" : "", "inbox")
    + link("#/climbs", icon("climb"), "Ascensions")
    + link("#/progress", icon("chart"), "Progrès")
    + link("#/search", icon("search"), "Recherche", "<kbd>/</kbd>")
    + "</nav>"
    + '<div class="sb-h"><span>Tableaux</span><button class="icon-btn sm" data-sb="board-add" aria-label="Nouveau tableau">' + icon("plus") + "</button></div>"
    + '<nav class="sb-nav boards">' + (boards.length ? boards.map((b) => link("#/b/" + b.id, b.emoji ? '<span class="emo">' + esc(b.emoji) + "</span>" : icon("board"), b.name,
      '<span class="cnt">' + S.state.items.filter((x) => x.boardId === b.id && !x.done).length + "</span>", "board:" + b.id)).join("")
      : '<p class="hint">Aucun tableau.</p>') + "</nav>"
    + '<div class="sb-foot"><button class="nav" data-sb="settings">' + icon("settings") + "<span>Réglages</span></button>"
    + '<button class="nav" data-sb="export">' + icon("download") + "<span>Sauvegarder</span></button></div>";
}

/* ── Glisser-déposer : où l'élément atterrit ── */
function onDrop(d) {
  const r = resolve(d.id); if (!r) return;
  const baseId = r.virtual ? null : r.it.id;
  const known = new Set(S.state.items.map((x) => x.id));
  const touched = baseId ? [baseId].concat(S.state.items.filter((x) => x.parent === baseId).map((x) => x.id)) : [];
  const snap = snapshot(touched);
  const from = r.virtual ? where(r.it.h, r.it.key) : placeLabel(r.it);
  const type = d.zone.split(":")[0], rest = d.zone.slice(type.length + 1);
  let it = null;
  if (type === "col") { const [h, k] = rest.split("|"); it = moveTo(d.id, h, k, d.beforeId); }
  else if (type === "cal") it = moveTo(d.id, "day", rest, d.beforeId);
  else if (type === "time") { it = moveTo(d.id, "day", rest, null); if (it && d.minutes != null) { it.time = hm(d.minutes); if (!it.dur) it.dur = 60; } }
  else if (type === "unsched") { it = moveTo(d.id, "day", rest, d.beforeId); if (it) it.time = ""; }
  else if (type === "list") { const [b, l] = rest.split("|"); it = setBoard(d.id, b, l, d.beforeId); }
  else if (type === "board") { const b = BV.boardOf(rest); if (b) it = setBoard(d.id, b.id, b.lists[0].id, null); }
  else if (type === "inbox") { it = real(d.id); if (it) { unplace(it.id); setBoard(it.id, null); it.parent = ""; } }
  if (!it) return;
  /* Ce qui vient d'être créé (une occurrence rendue réelle) disparaît aussi à l'annulation. */
  S.state.items.forEach((x) => { if (!known.has(x.id)) snap.push({ id: x.id, copy: null, at: -1 }); });
  commit();
  const to = placeLabel(it);
  if (to !== from || type === "time") toast("Déplacé · " + (type === "time" ? where("day", it.key) + " à " + it.time : to), () => restore(snap));
}

/* ── Événements de la zone principale ── */
async function onMainClick(e) {
  const m = main(), r = route();
  if (r.view === "day" && CV.onTimelineTap(e)) return;
  const b = e.target.closest("button, a[data-act]");
  if (!b) { if (r.view === "cal") CV.onCellTap(e, m); return; }
  const act = b.dataset.act;
  const row = b.closest("[data-id]");
  if (act === "toggle" && row) {
    const it = toggle(row.dataset.id);
    commit();
    if (it && it.done) {
      const ix = buildIndex(), p = it.parent && ix.byId.get(it.parent);
      if (p) { const k = kidsOf(ix, p.id); if (k.length > 1 && k.every((x) => x.done)) toast("« " + p.title + " » : tous ses éléments sont faits"); }
    }
    return;
  }
  if (act === "open") { const id = (row || b).dataset.id; if (id) openItem(id); return; }
  if (act === "fold" && row) { ui.ifold = ui.ifold || {}; if (ui.ifold[row.dataset.id]) delete ui.ifold[row.dataset.id]; else ui.ifold[row.dataset.id] = true; saveUI(); return; }
  if (act === "add") { openAdd(b.closest(".add-slot")); return; }
  if (r.view === "horizons" && HV.onAct(act, b, m)) return;
  if (r.view === "b" && await BV.onAct(act, b, m, r.arg)) return;
  if ((r.view === "cal" || r.view === "day") && CV.onAct(act, b, m)) return;
  if (r.view === "climbs" && await KV.onAct(act, b)) return;
  if (r.view === "search") SV.onAct(act);
}

function onKey(e) {
  if (e.target.classList && e.target.classList.contains("add-in")) {
    if (e.key === "Enter") { e.preventDefault(); commitAdd(e.target, true); }
    else if (e.key === "Escape") { e.preventDefault(); e.target.value = ""; commitAdd(e.target, false); }
    return;
  }
  if (isSheetOpen() || !$("#dialog").hidden || !$("#menu").hidden || isTyping(e.target) || e.altKey) return;
  const mod = e.metaKey || e.ctrlKey, r = route(), k = e.key;
  if (mod && k.toLowerCase() === "k") { e.preventDefault(); go("#/search"); setTimeout(SV.focusSearch, 30); return; }
  if (mod) return;
  if (k === "/") { e.preventDefault(); go("#/search"); setTimeout(SV.focusSearch, 30); return; }
  if (k === "n" || k === "N" || k === "+") { e.preventDefault(); addHere(); return; }
  if (k === "?") { e.preventDefault(); shortcuts(); return; }
  const nav = { h: "#/horizons", c: "#/cal", j: "#/day/today", a: "#/climbs", p: "#/progress", i: "#/inbox" }[k.toLowerCase()];
  if (nav) { e.preventDefault(); go(nav); return; }
  if (k === "t" || k === "T") {
    if (r.view === "horizons") HV.onAct("hztoday", { dataset: {} }, main());
    else if (r.view === "cal") CV.onAct("mtoday", { dataset: {} }, main());
    else if (r.view === "day") go("#/day/" + today());
    return;
  }
  if (k === "ArrowLeft" || k === "ArrowRight") {
    const dir = k === "ArrowLeft" ? -1 : 1;
    if (r.view === "horizons" || r.view === "b") { e.preventDefault(); HV.stepColumns(dir); }
    else if (r.view === "cal") CV.onAct(dir < 0 ? "mprev" : "mnext", { dataset: {} }, main());
    else if (r.view === "day") go("#/day/" + addDays(r.arg === "today" || !r.arg ? today() : r.arg, dir));
    return;
  }
  if (r.view === "horizons" && /^[0-7]$/.test(k)) {
    HV.onAct("hzmode", { dataset: { m: k === "0" ? "all" : HZ[+k - 1].id } }, main());
  }
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

/* Nouvel élément, là où l'on se trouve. */
function addHere() {
  const r = route();
  if (r.view === "day") return quickAdd({ h: "day", key: r.arg === "today" || !r.arg ? today() : r.arg });
  if (r.view === "b") {
    const b = BV.boardOf(r.arg);
    if (b) return quickAdd({ h: null, extra: { boardId: b.id, listId: b.lists[0].id } });
  }
  if (r.view === "inbox") return quickAdd({ h: null });
  if (r.view === "horizons" && ui.hzMode !== "all") return quickAdd({ h: ui.hzMode });
  return quickAdd({ h: "day" });
}

function shortcuts() {
  const rows = [["N", "Nouvel élément"], ["/ ou Ctrl K", "Rechercher"], ["H · C · J", "Horizons · Calendrier · Journée"], ["A · P · I", "Ascensions · Progrès · À ranger"],
    ["T", "Revenir à aujourd'hui"], ["← →", "Colonne, mois ou jour précédent / suivant"], ["0 – 7", "Horizons : ensemble, puis jour → vie"], ["Échap", "Fermer"], ["?", "Cette aide"]];
  openSheet("Raccourcis clavier", '<table class="keys">' + rows.map(([a, b]) => "<tr><td><kbd>" + esc(a) + "</kbd></td><td>" + esc(b) + "</td></tr>").join("") + "</table>", {});
}

/* ── Réglages ── */
let installEvt = null;
function openSettings() {
  const st = S.state.settings;
  const notif = "Notification" in window ? Notification.permission : "absent";
  const html = '<div class="f-sec"><div class="lbl">Apparence</div><div class="seg">'
    + [["light", "Clair"], ["dark", "Sombre"], ["system", "Système"]].map(([v, l]) => '<button data-theme="' + v + '" aria-pressed="' + (ui.theme === v) + '">' + l + "</button>").join("") + "</div></div>"
    + '<div class="f-sec"><label class="switch"><input type="checkbox" id="setCarry"' + (st.carry ? " checked" : "") + '><span><b>Reporter ce qui n\'est pas fait</b>'
    + "<small>Un élément non coché d'une période passée glisse dans la période en cours du même horizon (sauf les séries et les ascensions). Désactivé, il reste en retard à sa place.</small></span></label></div>"
    + '<div class="f-sec"><div class="lbl">Espaces</div><p class="hint">Chaque espace a ses horizons et ses tableaux : par exemple Personnel et Travail.</p>'
    + S.state.spaces.map((s) => '<div class="sp-row"><span>' + esc((s.emoji ? s.emoji + " " : "") + s.name) + '</span><button class="btn ghost sm" data-sp-ren="' + s.id + '">Renommer</button>'
      + (S.state.spaces.length > 1 ? '<button class="btn ghost sm" data-sp-del="' + s.id + '">' + icon("trash") + "</button>" : "") + "</div>").join("")
    + '<button class="btn ghost sm" data-set="space-add">' + icon("plus") + "Nouvel espace</button></div>"
    + '<div class="f-sec"><div class="lbl">Rappels</div><p class="hint">' + (notif === "granted" ? "Notifications autorisées. Un rappel sonne tant que l'application est ouverte, même en arrière-plan ; fermée, il t'attend à la réouverture."
      : notif === "denied" ? "Notifications refusées pour ce site : les rappels s'affichent dans l'application." : notif === "absent" ? "Ce navigateur ne gère pas les notifications : les rappels s'affichent dans l'application." : "Autorise les notifications pour être prévenu à l'heure d'un rappel.") + "</p>"
    + (notif === "default" ? '<button class="btn ghost sm" data-set="notif">' + icon("bell") + "Autoriser les notifications</button>" : "") + "</div>"
    + '<div class="f-sec"><div class="lbl">Données</div><p class="hint">' + (storageOK
      ? "Tout vit dans ce navigateur, sur cet appareil, et nulle part ailleurs. Exporte de temps en temps : vider le cache du navigateur efface tout. Pour passer d'un appareil à l'autre, exporte ici et importe là-bas."
      : "<b>Stockage local indisponible ici : rien ne survivra à la fermeture.</b> Exporte à la main.") + "</p>"
    + '<div class="f-acts"><button class="btn ghost sm" data-set="export">' + icon("download") + 'Exporter</button><button class="btn ghost sm" data-set="import">' + icon("upload") + "Importer</button>"
    + '<button class="btn ghost sm danger-t" data-set="reset">Tout effacer</button></div><input type="file" id="impFile" accept="application/json,.json" hidden></div>'
    + '<div class="f-sec"><div class="f-acts"><button class="btn ghost sm" data-set="keys">' + icon("keyboard") + "Raccourcis clavier</button>"
    + (installEvt ? '<button class="btn ghost sm" data-set="install">Installer l\'application</button>' : "") + "</div></div>";
  const body = openSheet("Réglages", html, {});
  body.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.theme) { ui.theme = b.dataset.theme; saveUI(true); applyTheme(); openSettings(); return; }
    if (b.dataset.spRen) {
      const s = S.state.spaces.find((x) => x.id === b.dataset.spRen);
      const v = await promptText("Nom de l'espace", s.name); if (v) { s.name = v; commit(); openSettings(); }
      return;
    }
    if (b.dataset.spDel) {
      const s = S.state.spaces.find((x) => x.id === b.dataset.spDel), dest = S.state.spaces.find((x) => x.id !== s.id);
      const ok = await ask("Supprimer l'espace « " + s.name + " » ? Ses éléments et tableaux passent dans « " + dest.name + " ».", [{ v: true, label: "Supprimer", kind: "danger" }]);
      if (!ok) return;
      S.state.items.forEach((x) => { if (x.spaceId === s.id) x.spaceId = dest.id; });
      S.state.boards.forEach((x) => { if (x.spaceId === s.id) x.spaceId = dest.id; });
      S.state.spaces = S.state.spaces.filter((x) => x !== s);
      if (ui.space === s.id) { ui.space = dest.id; saveUI(true); }
      commit(); openSettings(); return;
    }
    const a = b.dataset.set;
    if (a === "space-add") { await addSpace(); openSettings(); }
    if (a === "notif") { try { await Notification.requestPermission(); } catch (err) { /* refusé */ } openSettings(); }
    if (a === "export") exportData();
    if (a === "import") importData();
    if (a === "reset") {
      if (!await ask("Tout effacer : éléments, tableaux, espaces, ascensions ? Pense à exporter avant.", [{ v: true, label: "Tout effacer", kind: "danger" }])) return;
      const backup = deepCopy(S.state);
      replaceState(seed(), false); closeSheet();
      toast("Tout a été effacé", () => replaceState(backup, false));
    }
    if (a === "keys") shortcuts();
    if (a === "install" && installEvt) { const ev = installEvt; installEvt = null; ev.prompt(); closeSheet(); }
  };
  body.onchange = (e) => {
    if (e.target.id === "setCarry") {
      st.carry = e.target.checked; commit();
      if (st.carry) runCarry();
    }
  };
}
async function addSpace() {
  const v = await promptText("Nom du nouvel espace (ex : Travail)", "", "Créer");
  if (!v) return;
  const s = { id: uid(), name: v, emoji: "" };
  S.state.spaces.push(s);
  ui.space = s.id; saveUI(true);
  commit();
  toast("Espace « " + v + " » créé");
}

function exportData() {
  const json = JSON.stringify(S.state, null, 2), name = "horizons-" + today() + ".json";
  const body = openSheet("Exporter", '<p class="hint">Tout ton contenu, dans un fichier à garder en lieu sûr. Il se réimporte depuis les réglages, ici ou sur un autre appareil.</p>'
    + '<div class="f-acts"><button class="btn primary sm" data-x="dl">' + icon("download") + 'Télécharger</button><button class="btn ghost sm" data-x="copy">Copier</button></div>'
    + '<textarea readonly class="mono" id="expBox" rows="10">' + esc(json) + "</textarea>", {});
  body.onclick = (e) => {
    const b = e.target.closest("[data-x]"); if (!b) return;
    if (b.dataset.x === "copy") {
      const ta = $("#expBox"); ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => toast("Copié"), () => { try { document.execCommand("copy"); toast("Copié"); } catch (err) { toast("Sélectionne le texte à la main."); } });
    } else {
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      } catch (err) { toast("Téléchargement bloqué ici — utilise « Copier »."); }
    }
  };
}
function importData() {
  const body = openSheet("Importer", '<p class="hint">Choisis un fichier exporté, ou colle son contenu. Cela remplace tout le contenu actuel.</p>'
    + '<div class="f-acts"><button class="btn ghost sm" data-x="pick">Choisir un fichier</button></div>'
    + '<textarea class="mono" id="impBox" rows="8" placeholder="… ou colle ici le contenu JSON"></textarea>'
    + '<div class="f-acts end"><button class="btn primary" data-x="go">Importer</button></div><input type="file" id="impF" accept="application/json,.json" hidden>', {});
  const apply = async (txt) => {
    let d; try { d = JSON.parse(txt); } catch (err) { toast("Fichier illisible : ce n'est pas une sauvegarde Horizons."); return; }
    if (!d || typeof d !== "object" || !Array.isArray(d.items)) { toast("Ce fichier n'est pas une sauvegarde Horizons."); return; }
    if (!await ask("Remplacer tout le contenu actuel par cette sauvegarde (" + plural(d.items.length, "élément") + ") ?", [{ v: true, label: "Remplacer", kind: "danger" }])) return;
    const backup = deepCopy(S.state);
    replaceState(d, false); closeSheet();
    toast("Sauvegarde importée", () => replaceState(backup, false));
  };
  body.onclick = (e) => {
    const b = e.target.closest("[data-x]"); if (!b) return;
    if (b.dataset.x === "pick") $("#impF").click();
    if (b.dataset.x === "go") apply($("#impBox").value);
  };
  body.onchange = (e) => {
    if (e.target.id !== "impF" || !e.target.files[0]) return;
    const r = new FileReader(); r.onload = () => apply(r.result); r.readAsText(e.target.files[0]);
  };
}

/* ── Thème ── */
function applyTheme() {
  const root = document.documentElement;
  if (ui.theme === "light" || ui.theme === "dark") root.dataset.theme = ui.theme; else delete root.dataset.theme;
  const dark = ui.theme === "dark" || (ui.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#16171b" : "#f6f5f2";
}

/* ── Report automatique, rappels, changement de jour ── */
let lastDay = today();
function runCarry() {
  const moved = carryOver();
  if (!moved.length) return;
  commit();
  toast(plural(moved.length, "élément") + " non fait" + (moved.length > 1 ? "s" : "") + " reporté" + (moved.length > 1 ? "s" : "") + " à aujourd'hui");
}
function notify(title, body) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png", tag: "horizons-rappel" }));
    } else new Notification(title, { body });
  } catch (e) { /* sans notification */ }
}
function tick() {
  const t = today();
  if (t !== lastDay) {
    lastDay = t; scheduleRender();
    runCarry();
  }
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const due = [];
  /* « Déjà sonné » est un état de l'appareil, pas une donnée : il n'entre ni
     dans l'export ni dans la révision du document. */
  ui.fired = ui.fired && ui.fired.day === t ? ui.fired : { day: t, ids: {} };
  S.state.items.forEach((x) => {
    if (!x.remind || x.done || ui.fired.ids[x.id] || (x.seriesId && ui.fired.ids[x.seriesId]) || x.h !== "day") return;
    /* Une série sonne pour son occurrence du jour, tant que celle-ci n'a pas été rendue réelle. */
    const isToday = x.repeat
      ? matches(x, t) && !x.skip.includes(t) && !S.state.items.some((o) => o.seriesId === x.id && o.occ === t)
      : x.key === t;
    const m = toMin(x.remind);
    if (isToday && m != null && m <= cur) due.push(x);
  });
  if (!due.length) return;
  due.forEach((x) => { ui.fired.ids[x.id] = 1; notify("Horizons — rappel", (x.emoji ? x.emoji + " " : "") + x.title); });
  saveUI(true);
  showDue(due);
}
function showDue(list) {
  const el = $("#due");
  el.innerHTML = icon("bell") + '<div><b>Rappel</b><span>' + list.map((x) => esc((x.emoji ? x.emoji + " " : "") + x.title)).join(" · ") + "</span></div>"
    + '<button class="btn sm" id="dueOk">Vu</button>';
  el.hidden = false;
  $("#dueOk").onclick = () => { el.hidden = true; };
}

/* ── Démarrage ── */
function start() {
  load();
  if (!S.state.spaces.some((s) => s.id === ui.space)) { ui.space = S.state.spaces[0].id; saveUI(true); }
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  initToast();
  initDnd(onDrop);
  CV.initResize();
  onRender(render);

  const m = main();
  m.addEventListener("click", onMainClick);
  m.addEventListener("input", (e) => {
    if (e.target.classList.contains("add-in") && addState) { addState.value = e.target.value; return; }
    if (SV.onInput(e)) return;
  });
  m.addEventListener("focusout", (e) => {
    const inp = e.target;
    if (!inp.classList || !inp.classList.contains("add-in")) return;
    setTimeout(() => { if (inp.isConnected && document.activeElement !== inp) commitAdd(inp, false); }, 0);
  });
  document.addEventListener("keydown", onKey);
  $("#sheetClose").onclick = () => closeSheet();
  $("#scrim").onclick = () => closeSheet();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isSheetOpen() && $("#dialog").hidden && $("#menu").hidden) closeSheet(); });

  /* Barre latérale */
  $("#sidebar").addEventListener("click", async (e) => {
    const b = e.target.closest("button, a"); if (!b) return;
    if (b.dataset.space) {
      ui.space = b.dataset.space; saveUI(true); closeDrawer();
      if (route().view === "b") go("#/horizons"); else renderNow();
      return;
    }
    const a = b.dataset.sb;
    if (a === "add") { closeDrawer(); addHere(); return; }
    if (a === "space-add") { await addSpace(); return; }
    if (a === "board-add") {
      const v = await promptText("Nom du nouveau tableau", "", "Créer");
      if (v) { const nb = BV.createBoard(v); commit(); closeDrawer(); go("#/b/" + nb.id); }
      return;
    }
    if (a === "settings") { closeDrawer(); openSettings(); return; }
    if (a === "export") { closeDrawer(); exportData(); return; }
    if (b.tagName === "A") closeDrawer();
  });
  $("#menuBtn").onclick = () => { document.body.classList.toggle("drawer"); };
  $("#sbScrim").onclick = closeDrawer;
  $("#topSearch").onclick = () => { go("#/search"); setTimeout(SV.focusSearch, 30); };
  $("#topAdd").onclick = addHere;

  window.addEventListener("hashchange", () => {
    ui.lastRoute = location.hash; saveUI(true);
    if (route().view === "horizons") HV.requestScrollNow();
    window.scrollTo(0, 0);
    renderNow();
  });
  window.addEventListener("resize", () => scheduleRender());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); scheduleRender(); } });

  if (!location.hash) history.replaceState(null, "", ui.lastRoute || "#/horizons");
  renderNow();
  runCarry();
  tick();
  setInterval(tick, 30000);

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    let top = true; try { top = window.self === window.top; } catch (e) { top = false; }
    if (top) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}
function closeDrawer() { document.body.classList.remove("drawer"); }

start();
