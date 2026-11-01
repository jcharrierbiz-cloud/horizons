/* Synchronisation entre appareils, par un projet Supabase (hébergé à Paris).
   • Compte : adresse et mot de passe ; la session reste sur l'appareil.
   • Serveur : une ligne par compte (table horizons_docs) avec le document entier
     et un numéro de révision. Seul le premier compte confirmé peut en avoir une,
     et chacun ne voit que la sienne (règles côté serveur).
   • Échange : on lit la version du serveur, on la fusionne élément par élément
     avec celle de l'appareil (sync-merge.js), on applique le résultat ici et on
     le renvoie seulement si la révision du serveur n'a pas bougé entre-temps ;
     sinon on recommence.
   • Quand : au démarrage, peu après chaque modification, au retour sur
     l'application, au retour du réseau, et toutes les 45 s tant qu'elle est
     affichée.
   Sans session, rien ne part de l'appareil. */

import { $, esc, deepCopy, deviceName, plural } from "./util.js";
import { S, ui, normalize, replaceState, afterSave } from "./store.js";
import { mergeDocs, fingerprint } from "./sync-merge.js";
import { toast, ask, isSheetOpen } from "./ui.js";
import { isDragging } from "./dnd.js";

export const CFG = {
  url: "https://grgflajplpeszxrqhmwj.supabase.co",
  key: "sb_publishable_3V-RpSUlQOjNrr8McqsC4g_5zbwgBdO",   // clé publique : les règles du serveur protègent les données
};
const SKEY = "horizons-sync-v1";
const POLL = 45000;

/* Session et état, propres à l'appareil (hors export). */
let sess = (() => { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } })();
const meta = { status: sess ? "idle" : "off", msg: "", lastAt: sess && sess.lastAt || 0 };
let running = false, again = false, timer = null, gen = 0, cleanGen = -1, listeners = [];

function save() {
  try { if (sess) localStorage.setItem(SKEY, JSON.stringify(sess)); else localStorage.removeItem(SKEY); } catch (e) { /* stockage indisponible */ }
}
function setStatus(status, msg) {
  meta.status = status; meta.msg = msg || "";
  document.body.dataset.sync = status;
  const el = $("#syState"); if (el) el.textContent = statusText();
  listeners.forEach((f) => f(meta));
}
export const onStatus = (f) => listeners.push(f);
export const account = () => (sess && sess.uid ? { email: sess.email, joined: !!sess.joined } : null);
export const recovering = () => !!(sess && sess.recovery);

export function statusText() {
  const at = meta.lastAt ? new Date(meta.lastAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  switch (meta.status) {
    case "sync": return "Synchronisation…";
    case "ok": return "Synchronisé" + (at ? " à " + at : "") + ".";
    case "offline": return "Hors connexion : tes changements partiront au retour du réseau." + (at ? " Dernière synchronisation à " + at + "." : "");
    case "wait": return "En attente : la synchronisation reprend dès que la fiche ouverte est fermée.";
    case "error": return "Erreur : " + meta.msg;
    case "idle": return at ? "Dernière synchronisation à " + at + "." : "Pas encore synchronisé.";
    default: return "Non connecté.";
  }
}

/* ── Appels au serveur ── */
const MSG = {
  invalid_credentials: "Adresse ou mot de passe incorrect.",
  email_not_confirmed: "Adresse pas encore confirmée : ouvre le mail de confirmation, puis reconnecte-toi.",
  user_already_exists: "Un compte existe déjà avec cette adresse : connecte-toi.",
  weak_password: "Mot de passe trop faible : 8 caractères au moins.",
  over_email_send_rate_limit: "Trop de mails envoyés pour l'instant : réessaie dans une heure.",
  email_address_not_authorized: "Le serveur n'envoie de mail qu'à l'adresse de ton compte Supabase : crée le compte avec celle-ci.",
  email_address_invalid: "Adresse mail invalide.",
  signup_disabled: "La création de compte est fermée sur ce serveur.",
  refresh_token_not_found: "Session expirée : reconnecte-toi.",
  session_not_found: "Session expirée : reconnecte-toi.",
};
function explain(status, data) {
  const code = data && (data.error_code || data.code || data.error);
  if (MSG[code]) return MSG[code];
  if (code === "23503") return "Ce compte n'est pas celui qui synchronise ce serveur.";
  if (status === 429) return "Trop de demandes : réessaie dans un moment.";
  return (data && (data.msg || data.message || data.error_description)) || "réponse inattendue du serveur (" + status + ").";
}
async function call(path, opts, retried) {
  opts = opts || {};
  if (opts.auth !== false) await fresh();
  const headers = Object.assign({ apikey: CFG.key, "Content-Type": "application/json" }, opts.headers || {});
  if (opts.auth !== false && sess) headers.Authorization = "Bearer " + sess.at;
  let r;
  try {
    r = await fetch(CFG.url + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch (e) {
    throw Object.assign(new Error("hors connexion"), { offline: true });
  }
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
  if (r.status === 401 && opts.auth !== false && !retried && sess && sess.rt) {
    await refresh();
    return call(path, opts, true);
  }
  if (!r.ok) throw Object.assign(new Error(explain(r.status, data)), { status: r.status, data });
  return data;
}
function takeSession(d) {
  sess = Object.assign(sess || {}, {
    at: d.access_token, rt: d.refresh_token, exp: Date.now() + (+d.expires_in || 3600) * 1000,
    uid: d.user ? d.user.id : sess && sess.uid, email: d.user ? d.user.email : sess && sess.email,
  });
  save();
}
async function refresh() {
  const d = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: sess.rt } })
    .catch((e) => {
      if (!e.offline && e.status >= 400 && e.status < 500) { endSession(); setStatus("off"); toast("Session expirée : reconnecte-toi dans les Réglages"); }
      throw e;
    });
  takeSession(d);
}
async function fresh() { if (sess && sess.rt && sess.exp - Date.now() < 60000) await refresh(); }
function endSession() { sess = null; save(); meta.lastAt = 0; }
const back = () => location.origin + location.pathname;   // où ramènent les mails (si l'URL du site est réglée côté serveur)

/* ── Compte ── */
export async function signUp(email, password) {
  const d = await call("/auth/v1/signup?redirect_to=" + encodeURIComponent(back()), { method: "POST", auth: false, body: { email, password } });
  if (d && d.access_token) { takeSession(d); await join(); return "in"; }
  return "confirm";
}
export async function signIn(email, password) {
  const d = await call("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password } });
  takeSession(d);
  await join();
}
export async function forgot(email) {
  await call("/auth/v1/recover?redirect_to=" + encodeURIComponent(back()), { method: "POST", auth: false, body: { email } });
}
export async function setPassword(password) {
  await call("/auth/v1/user", { method: "PUT", body: { password } });
  if (sess) { delete sess.recovery; save(); }
}
export async function signOut() {
  const s = sess;
  endSession(); setStatus("off");
  if (s) fetch(CFG.url + "/auth/v1/logout", { method: "POST", headers: { apikey: CFG.key, Authorization: "Bearer " + s.at } }).catch(() => {});
}

/* Retour d'un mail (confirmation d'adresse, mot de passe oublié) : la session arrive dans l'adresse. */
export async function captureRedirect() {
  const h = location.hash;
  if (!/(access_token|error_description)=/.test(h)) return false;
  const p = new URLSearchParams(h.replace(/^#\/?/, ""));
  history.replaceState(null, "", location.pathname + location.search + (ui.lastRoute && !/access_token/.test(ui.lastRoute) ? ui.lastRoute : "#/horizons"));
  if (p.get("error_description")) { toast("Lien du mail : " + p.get("error_description").replace(/\+/g, " ")); return true; }
  sess = { at: p.get("access_token"), rt: p.get("refresh_token"), exp: Date.now() + (+p.get("expires_in") || 3600) * 1000 };
  try {
    const u = await call("/auth/v1/user");
    sess.uid = u.id; sess.email = u.email;
    if (p.get("type") === "recovery") sess.recovery = true;
    save();
    await join();
    toast(sess && sess.recovery ? "Choisis ton nouveau mot de passe dans les Réglages" : "Connecté · synchronisation activée");
  } catch (e) {
    endSession(); setStatus("off");
    toast("Connexion impossible : " + e.message);
  }
  return true;
}

/* Première connexion de cet appareil : que faire de ce qu'il contient déjà ? */
function pristine(d) {
  return !d.items.length && !d.runs.length && !d.climbs.length && d.spaces.length <= 1
    && d.boards.length <= 1 && d.boards.every((b) => b.name === "Idées");
}
async function join() {
  if (!sess || sess.joined) { await syncNow(true); return; }
  setStatus("sync");
  const rows = await call("/rest/v1/horizons_docs?select=doc,rev&user_id=eq." + sess.uid);
  const row = rows && rows[0];
  if (row) {
    const remote = normalize(deepCopy(row.doc));
    let take = pristine(S.state);
    if (!take) {
      const choice = await ask("Ce compte contient déjà des données (" + plural(remote.items.length, "élément") + "), et cet appareil aussi ("
        + plural(S.state.items.length, "élément") + "). Fusionner garde tout ; l'autre choix remplace ce qu'il y a sur cet appareil.",
        [{ v: "merge", label: "Fusionner les deux", kind: "primary" }, { v: "remote", label: "Garder celles du compte" }]);
      if (!choice) { await signOut(); toast("Connexion annulée : rien n'a changé sur cet appareil"); return; }
      take = choice === "remote";
    }
    if (take) replaceState(remote, true);
  }
  sess.joined = true; save();
  await syncNow(true);
}

/* ── Échange ── */
/* Remplacer le document pendant qu'une fiche est ouverte ou qu'un élément est
   saisi ou déplacé ferait perdre la saisie : on attend. */
function busy() {
  const a = document.activeElement;
  return isSheetOpen() || isDragging() || !$("#dialog").hidden || !!(a && a.closest && a.closest("#main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
export function syncSoon(ms) {
  if (!sess || !sess.joined) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms == null ? 1500 : ms);
}
export async function syncNow(force) {
  if (!sess || !sess.uid) return;
  if (running) { again = true; return; }
  running = true;
  const startGen = gen;
  setStatus("sync");
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = await call("/rest/v1/horizons_docs?select=doc,rev&user_id=eq." + sess.uid);
      const row = rows && rows[0];
      if (!row) {
        try {
          await call("/rest/v1/horizons_docs", { method: "POST", headers: { Prefer: "return=minimal" }, body: { user_id: sess.uid, doc: S.state, device: deviceName() } });
        } catch (e) {
          if (e.status === 409 && e.data && e.data.code === "23505") continue;   // un autre appareil vient de créer la ligne
          throw e;
        }
        sess.rev = 1;
        break;
      }
      const remote = normalize(deepCopy(row.doc));
      const merged = mergeDocs(S.state, remote);
      const fm = fingerprint(merged);
      if (fm !== fingerprint(S.state)) {
        if (!force && busy()) { running = false; setStatus("wait"); syncSoon(4000); return; }
        replaceState(merged, true);
      }
      if (fm !== fingerprint(remote)) {
        const done = await call("/rest/v1/horizons_docs?user_id=eq." + sess.uid + "&rev=eq." + row.rev,
          { method: "PATCH", headers: { Prefer: "return=representation" }, body: { doc: S.state, rev: row.rev + 1, device: deviceName() } })
          .catch((e) => { if (e.data && e.data.code === "40001") return []; throw e; });
        if (!done || !done.length) continue;   // le serveur a bougé entre-temps : on refait la fusion
        sess.rev = row.rev + 1;
      } else sess.rev = row.rev;
      break;
    }
    if (gen === startGen) cleanGen = gen;
    meta.lastAt = sess.lastAt = Date.now();
    save();
    setStatus("ok");
  } catch (e) {
    if (!sess) return;
    setStatus(e.offline ? "offline" : "error", e.message);
  } finally {
    running = false;
    if (again) { again = false; syncSoon(300); }
  }
}
/* Toutes les 45 s : un coup d'œil à la révision du serveur, et l'échange complet seulement si quelque chose a bougé. */
async function poll() {
  if (!sess || !sess.joined || document.hidden || running) return;
  if (cleanGen !== gen) { syncNow(); return; }
  try {
    const rows = await call("/rest/v1/horizons_docs?select=rev&user_id=eq." + sess.uid);
    const rev = rows && rows[0] ? rows[0].rev : 0;
    if (rev !== sess.rev) syncNow();
    else if (meta.status !== "ok") setStatus("ok");
  } catch (e) { if (sess) setStatus(e.offline ? "offline" : "error", e.message); }
}

export function initSync() {
  document.body.dataset.sync = meta.status;
  afterSave(() => { gen++; syncSoon(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncSoon(200); });
  window.addEventListener("online", () => syncSoon(200));
  setInterval(poll, POLL);
  if (sess && sess.joined) syncSoon(400);
}

/* ── Réglages ── */
export function settingsHtml() {
  const acc = account();
  let h = '<div class="f-sec sync-sec"><div class="lbl">Synchronisation</div>';
  if (acc && sess.recovery) {
    return h + '<p class="hint">Connecté en tant que <b>' + esc(acc.email) + "</b>. Choisis un nouveau mot de passe :</p>"
      + '<div class="f-grid"><label class="grow"><span class="lbl">Nouveau mot de passe</span><input type="password" id="syNew" autocomplete="new-password" minlength="8"></label></div>'
      + '<div class="f-acts"><button class="btn primary sm" data-sy="setpw">Enregistrer</button></div></div>';
  }
  if (acc) {
    return h + '<p class="sync-who">Connecté : <b>' + esc(acc.email) + '</b></p><p class="hint" id="syState">' + esc(statusText()) + "</p>"
      + '<div class="f-acts"><button class="btn ghost sm" data-sy="now">Synchroniser maintenant</button><button class="btn ghost sm" data-sy="out">Me déconnecter</button></div></div>';
  }
  return h + '<p class="hint">Retrouve tes données sur ton téléphone et ton ordinateur. Elles sont copiées sur un serveur Supabase à Paris ; seul ton compte y a accès.</p>'
    + '<div class="f-grid"><label class="grow"><span class="lbl">Adresse mail</span><input type="email" id="syEmail" autocomplete="username" inputmode="email"></label>'
    + '<label class="grow"><span class="lbl">Mot de passe</span><input type="password" id="syPass" autocomplete="current-password" minlength="8"></label></div>'
    + '<div class="f-acts"><button class="btn primary sm" data-sy="in">Me connecter</button><button class="btn ghost sm" data-sy="up">Créer mon compte</button>'
    + '<button class="btn ghost sm" data-sy="forgot">Mot de passe oublié</button></div>'
    + '<p class="hint">Premier appareil : « Créer mon compte » avec l\'adresse de ton compte Supabase, ouvre le mail de confirmation, puis « Me connecter ». Sur les autres appareils : « Me connecter ».</p></div>';
}
export async function onSettings(act, body) {
  const v = (id) => { const el = body.querySelector("#" + id); return el ? el.value.trim() : ""; };
  const email = v("syEmail"), pw = body.querySelector("#syPass") ? body.querySelector("#syPass").value : "";
  try {
    if (act === "in" || act === "up") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Adresse mail invalide."); return; }
      if (pw.length < 8) { toast("Mot de passe : 8 caractères au moins."); return; }
      if (act === "up") {
        const r = await signUp(email, pw);
        toast(r === "confirm" ? "Compte créé · ouvre le mail de confirmation, puis « Me connecter »" : "Connecté · synchronisation activée");
      } else {
        await signIn(email, pw);
        if (sess) toast("Connecté · synchronisation activée");
      }
    }
    if (act === "forgot") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Écris ton adresse mail, puis « Mot de passe oublié »."); return; }
      await forgot(email);
      toast("Mail envoyé · son lien te ramène ici pour choisir un nouveau mot de passe");
    }
    if (act === "setpw") {
      const n = body.querySelector("#syNew").value;
      if (n.length < 8) { toast("Mot de passe : 8 caractères au moins."); return; }
      await setPassword(n);
      toast("Mot de passe enregistré");
    }
    if (act === "now") await syncNow(true);
    if (act === "out") { await signOut(); toast("Déconnecté · tes données restent sur cet appareil"); }
  } catch (e) {
    toast(e.offline ? "Pas de connexion internet." : e.message);
  }
}
