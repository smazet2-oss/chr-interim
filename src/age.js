'use strict';
// Âge des intérimaires et candidats : détection des mineurs (moins de 18 ans) et des personnes de 64 ans ou plus,
// et contrôle des missions proposées aux mineurs selon le Code du travail et les dérogations propres à l'hôtellerie-restauration (HCR).
// Règles à faire valider et à tenir à jour (DREETS, Code du travail articles L3162-1 et suivants, R3163-1 et suivants, R3164-1 et suivants).

const SENIOR = 64; // repère d'affichage ; le seuil réel est l'âge légal de départ à la retraite de la génération (ci-dessous)
/** Âge légal de départ à la retraite selon la date de naissance (réforme de 2023, suspendue au 1er septembre 2026), en mois.
 *  [né jusqu'au (inclus), âge légal en mois]. À mettre à jour si la loi change. */
const RETRAITE = [['1961-08-31', 744], ['1961-12-31', 747], ['1962-12-31', 750], ['1964-12-31', 753], ['1965-03-31', 753],
  ['1965-12-31', 756], ['1966-12-31', 759], ['1967-12-31', 762], ['1968-12-31', 765], ['9999-12-31', 768]];
const moisRetraite = naissance => (RETRAITE.find(([d]) => naissance <= d) || RETRAITE[RETRAITE.length - 1])[1];
const libelleMois = m => `${Math.floor(m / 12)} ans${m % 12 ? ` et ${m % 12} mois` : ''}`;
/** Âge en mois révolus. */
function ageMois(naissance, ref) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(naissance || ''))) return null;
  const r = ref || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const [y, m, d] = naissance.split('-').map(Number), [ry, rm, rd] = r.split('-').map(Number);
  return (ry - y) * 12 + (rm - m) - (rd < d ? 1 : 0);
}
/** Âge légal de la retraite atteint à la date de référence ? */
const retraiteAtteinte = (naissance, ref) => { const am = ageMois(naissance, ref); return am !== null && am >= moisRetraite(naissance); };

/** Âge révolu à une date (AAAA-MM-JJ). null si la date de naissance est absente ou invalide. */
function age(naissance, ref) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(naissance || ''))) return null;
  const r = ref || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const [y, m, d] = naissance.split('-').map(Number), [ry, rm, rd] = r.split('-').map(Number);
  const a = ry - y - (rm < m || (rm === m && rd < d) ? 1 : 0);
  return a >= 0 && a < 120 ? a : null;
}

/** Catégorie d'âge : 'moins16' (emploi interdit sauf exceptions), 'mineur' (16-17 ans), 'senior' (64 ans ou plus), null sinon. */
function categorie(a, naissance, ref) {
  if (a === null || a === undefined) return null;
  if (a < 16) return 'moins16';
  if (a < 18) return 'mineur';
  if (naissance ? retraiteAtteinte(naissance, ref) : a >= SENIOR) return 'senior';
  return null;
}

/** Conditions de travail particulières des mineurs (affichées sur la fiche et dans les contrôles). */
const REGLES_MINEURS = [
  'Durée du travail : 8 heures par jour et 35 heures par semaine au maximum.',
  'Pause de 30 minutes consécutives dès 4 h 30 de travail continu.',
  'Repos quotidien de 12 heures consécutives (14 heures pour les moins de 16 ans).',
  'Repos hebdomadaire de 2 jours consécutifs.',
  'Travail de nuit interdit de 22 h à 6 h (de 20 h à 6 h pour les moins de 16 ans). En hôtellerie-restauration, l\'inspection du travail peut autoriser les 16-17 ans jusqu\'à 23 h 30 (article R3163-2, dérogation d\'un an au plus, à demander avant la mission).',
  'Dimanches et jours fériés : travail possible en hôtellerie-restauration (dérogation de droit), avec 2 jours de repos consécutifs dans la semaine.',
  'Service au bar (débit de boissons) : emploi des mineurs interdit, sauf jeunes de 16 ans et plus en formation dans un établissement agréé.',
  'Avant la première mission : visite d\'information et de prévention (médecine du travail) et autorisation écrite des parents pour un mineur non émancipé.',
  'Travaux dangereux interdits sans dérogation (machines tranchantes, produits chimiques, port de charges lourdes…).',
];
const REGLES_SENIOR = [
  'Âge légal de départ à la retraite atteint : vérifier si la personne perçoit une pension (cumul emploi-retraite à déclarer à sa caisse).',
  'Adapter le suivi de santé et les postes physiques (port de charges, station debout prolongée, nuit).',
];

const minutes = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };

/**
 * Contrôle d'une mission proposée à une personne d'âge `a` à la date de la mission.
 * Renvoie { bloquants: [...], alertes: [...] } : les bloquants interdisent la proposition, les alertes demandent une vérification.
 */
function controleMission(a, m, secteurClient) {
  const bloquants = [], alertes = [], cat = categorie(a);
  if (cat !== 'mineur' && cat !== 'moins16') return { bloquants, alertes };
  if (cat === 'moins16') bloquants.push(`moins de 16 ans (${a} ans) : emploi interdit, sauf travaux légers pendant les vacances scolaires avec autorisation de l'inspection du travail`);
  const deb = minutes(m.debut), fin0 = minutes(m.fin), fin = fin0 <= deb ? fin0 + 1440 : fin0, duree = fin - deb;
  if (duree > 8 * 60) bloquants.push(`poste de ${Math.floor(duree / 60)} h${duree % 60 ? String(duree % 60).padStart(2, '0') : ''} : 8 heures par jour au maximum pour un mineur`);
  // Nuit : 22 h – 6 h (20 h – 6 h avant 16 ans) ; dérogation HCR possible jusqu'à 23 h 30 pour les 16-17 ans
  const debutNuit = cat === 'moins16' ? 20 * 60 : 22 * 60, finNuit = 6 * 60 + 1440;
  if (deb < 6 * 60) bloquants.push('début avant 6 h : travail de nuit interdit aux mineurs');
  else if (fin > 23 * 60 + 30 && fin <= finNuit) bloquants.push('fin après 23 h 30 : travail de nuit interdit aux mineurs, même avec la dérogation hôtellerie-restauration');
  else if (fin > debutNuit) {
    if (cat === 'moins16') bloquants.push(`fin après 20 h : travail de nuit interdit avant 16 ans`);
    else alertes.push('fin entre 22 h et 23 h 30 : autorisée seulement avec la dérogation de l\'inspection du travail (hôtellerie-restauration, article R3163-2)');
  }
  if (duree > 4.5 * 60) alertes.push('pause de 30 minutes à prévoir dès 4 h 30 de travail continu');
  if (/barman|barmaid|bar\b|limonadier/i.test(m.poste || '') || /bar/i.test(secteurClient || '')) alertes.push('service au bar : interdit aux mineurs, sauf jeunes de 16 ans et plus en formation dans un établissement agréé');
  return { bloquants, alertes };
}

module.exports = { age, ageMois, categorie, controleMission, moisRetraite, libelleMois, retraiteAtteinte, REGLES_MINEURS, REGLES_SENIOR, SENIOR, RETRAITE };
