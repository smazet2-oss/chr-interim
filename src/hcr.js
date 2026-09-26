'use strict';
// Règles par défaut de la convention collective HCR (IDCC 1979) : taux horaire brut par poste
// (grille niveau / échelon, jamais sous le SMIC) et majorations selon les horaires (nuit, dimanche, jours fériés).
// Toutes les valeurs sont modifiables dans Paramètres › Convention HCR.
const P = require('./parametres');

const { SMIC_DEFAUT, NIVEAUX, POSTES, cleNiveau, clePoste } = require('./hcr-grille');

const r2 = n => Math.round(n * 100) / 100;
const smic = () => P.num('smic_horaire', Number(SMIC_DEFAUT));

/** Taux horaire brut minimum d'un poste : grille HCR de son niveau, jamais sous le SMIC. */
function tauxPoste(poste) {
  const nom = Object.keys(POSTES).find(p => p.toLowerCase() === String(poste || '').trim().toLowerCase());
  const niveau = nom ? P.get(clePoste(nom)) || POSTES[nom] : 'I-1';
  return r2(Math.max(smic(), P.num(cleNiveau(niveau), 0)));
}
const tauxPostes = () => Object.fromEntries(Object.keys(POSTES).map(p => [p, tauxPoste(p)]));

/* ----- Jours fériés (France métropolitaine) ----- */
function paques(an) {
  const a = an % 19, b = Math.floor(an / 100), c = an % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(an, mois - 1, jour));
}
const iso = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);
const cacheFeries = {};
function feries(an) {
  if (!cacheFeries[an]) {
    const p = paques(an);
    cacheFeries[an] = new Set([`${an}-01-01`, `${an}-05-01`, `${an}-05-08`, `${an}-07-14`, `${an}-08-15`, `${an}-11-01`, `${an}-11-11`, `${an}-12-25`,
      iso(plus(p, 1)), iso(plus(p, 39)), iso(plus(p, 50))]);
  }
  return cacheFeries[an];
}
const estFerie = d => feries(Number(d.slice(0, 4))).has(d);

/**
 * Répartition des heures d'une mission par type d'horaire, au quart d'heure.
 * La nuit va de 22 h à 7 h. Le type de jour (dimanche, férié, 1er mai) suit la date calendaire de chaque quart d'heure.
 */
function decomposer(date, debut, fin) {
  const [h1, m1] = String(debut).split(':').map(Number), [h2, m2] = String(fin).split(':').map(Number);
  let dureeMin = (h2 * 60 + m2) - (h1 * 60 + m1); if (dureeMin <= 0) dureeMin += 1440;
  const res = { total: 0, nuit: 0, dimanche: 0, ferie: 0, mai1: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) { res.total = Math.round(dureeMin / 15) / 4; return res; }
  const j0 = new Date(date + 'T00:00:00Z');
  for (let t = 0; t < dureeMin; t += 15) {
    const abs = h1 * 60 + m1 + t, jour = iso(plus(j0, Math.floor(abs / 1440))), minute = abs % 1440, q = Math.min(15, dureeMin - t) / 60;
    res.total += q;
    if (minute >= 22 * 60 || minute < 7 * 60) res.nuit += q;
    if (jour.slice(5) === '05-01') res.mai1 += q;
    else if (estFerie(jour)) res.ferie += q;
    else if (new Date(jour + 'T12:00:00Z').getUTCDay() === 0) res.dimanche += q;
  }
  for (const k in res) res[k] = Math.round(res[k] * 4) / 4;
  return res;
}

/** Majorations applicables à une mission : [{ cle, libelle, heures, pc }]. */
function majorations(date, debut, fin) {
  const d = decomposer(date, debut, fin);
  const L = [
    ['nuit', 'Heures de nuit (22 h – 7 h)', d.nuit, P.num('maj_nuit_pc', 0)],
    ['dimanche', 'Heures du dimanche', d.dimanche, P.num('maj_dimanche_pc', 0)],
    ['ferie', 'Heures de jour férié', d.ferie, P.num('maj_ferie_pc', 0)],
    ['mai1', 'Heures du 1er mai', d.mai1, P.num('maj_1er_mai_pc', 100)],
  ];
  return { heures: d.total, lignes: L.filter(([, , h, pc]) => h > 0 && pc > 0).map(([cle, libelle, heures, pc]) => ({ cle, libelle, heures, pc })) };
}
/** Coefficient multiplicateur du salaire horaire dû aux majorations (1 = aucune). */
function facteur(date, debut, fin) {
  const { heures, lignes } = majorations(date, debut, fin);
  return heures ? 1 + lignes.reduce((s, l) => s + l.heures * l.pc / 100, 0) / heures : 1;
}

module.exports = { NIVEAUX, POSTES, cleNiveau, clePoste, tauxPoste, tauxPostes, smic, feries, estFerie, decomposer, majorations, facteur };
