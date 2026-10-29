/* Le temps, horizon par horizon.
   Clés de période :
     jour       2026-10-29
     semaine    2026-W44   (ISO 8601 : du lundi au dimanche, la semaine 1 contient le 4 janvier)
     mois       2026-10
     trimestre  2026-Q4
     année      2026
     décennie   2020       (2020 → 2029)
     vie        vie
   Toutes les clés d'un même horizon ont la même longueur : comparer deux
   chaînes compare deux périodes. */

import { cap1 } from "./util.js";

export const HZ = [
  { id: "day", one: "Jour", many: "Jours", now: "Aujourd'hui", win: [-3, 27], step: 14 },
  { id: "week", one: "Semaine", many: "Semaines", now: "Cette semaine", win: [-2, 15], step: 8 },
  { id: "month", one: "Mois", many: "Mois", now: "Ce mois-ci", win: [-2, 17], step: 6 },
  { id: "quarter", one: "Trimestre", many: "Trimestres", now: "Ce trimestre", win: [-1, 11], step: 4 },
  { id: "year", one: "Année", many: "Années", now: "Cette année", win: [-1, 9], step: 5 },
  { id: "decade", one: "Décennie", many: "Décennies", now: "Cette décennie", win: [-1, 5], step: 3 },
  { id: "life", one: "Vie", many: "Vie", now: "Vie", win: [0, 0], step: 0 },
];
export const hzIdx = (h) => HZ.findIndex((x) => x.id === h);
export const hzDef = (h) => HZ[hzIdx(h)] || HZ[0];

export function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export const today = () => iso(new Date());
export function dNum(s) { const d = new Date(s + "T12:00:00"); return isNaN(d) ? null : d; }
export function addDays(s, n) { const d = dNum(s); d.setDate(d.getDate() + n); return iso(d); }
export function daysBetween(a, b) { return Math.round((dNum(b) - dNum(a)) / 86400000); }
/* 0 = lundi … 6 = dimanche */
export function weekday(s) { return (dNum(s).getDay() + 6) % 7; }

export function isoWeekKey(s) {
  const t = dNum(s);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);          // jeudi de la semaine
  const y = t.getFullYear(), w1 = new Date(y, 0, 4, 12);
  w1.setDate(w1.getDate() - ((w1.getDay() + 6) % 7) + 3);       // jeudi de la semaine 1
  return y + "-W" + String(1 + Math.round((t - w1) / 604800000)).padStart(2, "0");
}
export function weekMonday(k) {
  const m = new Date(parseInt(k.slice(0, 4), 10), 0, 4, 12);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + (parseInt(k.slice(6), 10) - 1) * 7);
  return iso(m);
}

export function periodOf(h, s) {
  if (h === "day") return s;
  if (h === "week") return isoWeekKey(s);
  if (h === "month") return s.slice(0, 7);
  if (h === "quarter") return s.slice(0, 4) + "-Q" + (Math.floor((parseInt(s.slice(5, 7), 10) - 1) / 3) + 1);
  if (h === "year") return s.slice(0, 4);
  if (h === "decade") return String(Math.floor(parseInt(s.slice(0, 4), 10) / 10) * 10);
  return "vie";
}

/* Premier et dernier jour de la période. */
export function periodSpan(h, k) {
  if (h === "day") return [k, k];
  if (h === "week") { const m = weekMonday(k); return [m, addDays(m, 6)]; }
  if (h === "month") return [k + "-01", iso(new Date(+k.slice(0, 4), +k.slice(5, 7), 0, 12))];
  if (h === "quarter") {
    const y = +k.slice(0, 4), q = +k.slice(6);
    return [iso(new Date(y, (q - 1) * 3, 1, 12)), iso(new Date(y, q * 3, 0, 12))];
  }
  if (h === "year") return [k + "-01-01", k + "-12-31"];
  if (h === "decade") return [k + "-01-01", (+k + 9) + "-12-31"];
  return ["0000-01-01", "9999-12-31"];
}

function quarterIndex(k) { return +k.slice(0, 4) * 4 + (+k.slice(6) - 1); }
function quarterKey(i) { return Math.floor(i / 4) + "-Q" + ((i % 4) + 1); }

export function shiftPeriod(h, k, n) {
  if (!n || h === "life") return k;
  if (h === "day") return addDays(k, n);
  if (h === "week") return isoWeekKey(addDays(weekMonday(k), 7 * n));
  if (h === "month") return iso(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1 + n, 1, 12)).slice(0, 7);
  if (h === "quarter") return quarterKey(quarterIndex(k) + n);
  if (h === "year") return String(+k + n);
  return String(+k + 10 * n);
}

/* Nombre de périodes de a à b (b − a). */
export function periodDiff(h, a, b) {
  if (h === "day") return daysBetween(a, b);
  if (h === "week") return Math.round((dNum(weekMonday(b)) - dNum(weekMonday(a))) / 604800000);
  if (h === "month") return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  if (h === "quarter") return quarterIndex(b) - quarterIndex(a);
  if (h === "year") return +b - +a;
  if (h === "decade") return (+b - +a) / 10;
  return 0;
}
export const periodDelta = (h, k) => periodDiff(h, periodOf(h, today()), k);

export function validKey(h, k) {
  const re = {
    day: /^\d{4}-\d{2}-\d{2}$/, week: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, month: /^\d{4}-(0[1-9]|1[0-2])$/,
    quarter: /^\d{4}-Q[1-4]$/, year: /^\d{4}$/, decade: /^\d{3}0$/, life: /^vie$/,
  }[h];
  return !!re && re.test(String(k || "")) && (h !== "day" || !!dNum(k));
}

/* Jour d'appui d'une période : aujourd'hui s'il en fait partie, sinon son premier jour. */
export function anchorDay(h, k) {
  const s = periodSpan(h, k), t = today();
  return t >= s[0] && t <= s[1] ? t : s[0];
}

export function fmtD(s, o) { return dNum(s).toLocaleDateString("fr-FR", o); }

export function periodLabel(h, k) {
  const n = periodDelta(h, k), yNow = today().slice(0, 4), L = { tag: "", title: "", sub: "" };
  if (h === "day") {
    L.tag = n === 0 ? "Aujourd'hui" : n === 1 ? "Demain" : n === -1 ? "Hier" : "";
    L.title = cap1(fmtD(k, { weekday: "long", day: "numeric", month: "short" }));
    if (k.slice(0, 4) !== yNow) L.sub = k.slice(0, 4);
  } else if (h === "week") {
    L.tag = n === 0 ? "Cette semaine" : n === 1 ? "Semaine prochaine" : n === -1 ? "Semaine dernière" : "";
    L.title = "Semaine " + parseInt(k.slice(6), 10);
    const s = periodSpan(h, k), a = dNum(s[0]), b = dNum(s[1]);
    L.sub = (a.getMonth() === b.getMonth() ? a.getDate() : fmtD(s[0], { day: "numeric", month: "short" }))
      + " – " + fmtD(s[1], { day: "numeric", month: "short" }) + (k.slice(0, 4) !== yNow ? " " + k.slice(0, 4) : "");
  } else if (h === "month") {
    L.tag = n === 0 ? "Ce mois-ci" : n === 1 ? "Le mois prochain" : n === -1 ? "Le mois dernier" : "";
    L.title = cap1(fmtD(k + "-01", { month: "long", year: "numeric" }));
  } else if (h === "quarter") {
    L.tag = n === 0 ? "Ce trimestre" : n === 1 ? "Le prochain" : n === -1 ? "Le précédent" : "";
    const s = periodSpan(h, k);
    L.title = "T" + k.slice(6) + " " + k.slice(0, 4);
    L.sub = fmtD(s[0], { month: "short" }) + " – " + fmtD(s[1], { month: "short" });
  } else if (h === "year") {
    L.tag = n === 0 ? "Cette année" : n === 1 ? "L'an prochain" : n === -1 ? "L'an dernier" : "";
    L.title = k;
  } else if (h === "decade") {
    L.tag = n === 0 ? "Cette décennie" : n === 1 ? "La suivante" : n === -1 ? "La précédente" : "";
    L.title = "Années " + k;
    L.sub = k + " – " + (+k + 9);
  } else {
    L.tag = "Sans échéance"; L.title = "Vie"; L.sub = "Ce qui compte, au-delà des dates";
  }
  return L;
}
/* Libellé court : « Demain », « Semaine 44 », « Octobre 2026 »… */
export function where(h, k) {
  if (!h) return "Sans date";
  const L = periodLabel(h, k);
  return h === "day" ? (L.tag || L.title) : L.title;
}

export const WD_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
export const WD_ONE = ["L", "M", "M", "J", "V", "S", "D"];

export function hm(min) {
  min = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}
export function toMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
export function durLabel(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? h + " h" + (m ? " " + String(m).padStart(2, "0") : "") : m + " min";
}
