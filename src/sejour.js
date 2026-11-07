'use strict';
// Intérimaires et candidats de nationalité étrangère (hors Union européenne, EEE et Suisse) : situation au regard du droit au travail,
// conditions selon le titre détenu et alerte (Code du travail, travail temporaire, convention HCR pour le reste du contrat).
// Règles indicatives, à faire valider (préfecture, DREETS) ; à tenir à jour avec la réglementation.

const NATIONALITES_CAND = ['Française', 'Union européenne, Espace économique européen ou Suisse', 'Autre nationalité'];
const TITRES = [
  'Carte de résident ou carte « résident de longue durée-UE »',
  'Titre de séjour « vie privée et familiale »',
  'Titre de séjour « salarié » ou « travailleur temporaire »',
  'Titre de séjour ou visa long séjour « étudiant »',
  'Récépissé ou autorisation provisoire de séjour autorisant à travailler',
  'Demandeur d\'asile',
  'Visa court séjour, touriste ou visiteur',
  'Sans titre de séjour',
  'Démarches en cours',
];

/** Règles communes à tout salarié étranger hors UE (agence de travail temporaire employeur). */
const REGLES_COMMUNES = [
  'Interdiction d\'employer, même en intérim, une personne étrangère non autorisée à travailler en France (article L8251-1 du Code du travail) : amendes, sanctions pénales et contribution spéciale à l\'OFII.',
  'L\'agence, employeur de l\'intérimaire, vérifie l\'authenticité du titre auprès de la préfecture au moins 2 jours ouvrables avant la première mission (articles L5221-8 et R5221-41) et en conserve une copie au dossier.',
  'Chaque contrat de mission doit se terminer au plus tard à la date de fin de validité du titre : surveiller l\'expiration et demander le nouveau titre ou le récépissé de renouvellement.',
  'Égalité de traitement : mêmes droits que les autres intérimaires (taux horaire de la convention HCR, indemnité de fin de mission, congés payés, majorations).',
];

/** Conditions propres à chaque titre. niveau : 'autorise' (droit au travail plein), 'conditions' (autorisé avec limites), 'interdit' (ne peut pas être accepté ni proposé). */
const PAR_TITRE = {
  [TITRES[0]]: { niveau: 'autorise', court: 'Carte de résident', regles: ['Autorise toute activité salariée en France.'] },
  [TITRES[1]]: { niveau: 'autorise', court: 'Titre « vie privée et familiale »', regles: ['Autorise toute activité salariée en France.'] },
  [TITRES[2]]: { niveau: 'conditions', court: 'Titre « salarié / travailleur temporaire »', regles: ['Autorise à travailler dans les limites indiquées sur le titre ou l\'autorisation de travail (métier, région, employeur, durée) : vérifier que les missions proposées y correspondent.', 'Un titre « travailleur temporaire » est lié à un contrat et à une durée précis.'] },
  [TITRES[3]]: { niveau: 'conditions', court: 'Étudiant étranger · 964 h/an', regles: ['Travail autorisé à titre accessoire, dans la limite de 964 heures par an (60 % de la durée légale annuelle), sans autorisation de travail à demander.', 'L\'employeur adresse une déclaration nominative à la préfecture au moins 2 jours ouvrables avant la première mission.', 'Suivre le total d\'heures de missions de l\'année.'] },
  [TITRES[4]]: { niveau: 'conditions', court: 'Récépissé / APS', regles: ['Autorise à travailler seulement si le document porte la mention « autorise son titulaire à travailler » : la vérifier.', 'Validité courte : surveiller la date de fin et demander le nouveau document.'] },
  [TITRES[5]]: { niveau: 'interdit', court: 'Demandeur d\'asile', regles: ['Pas de droit au travail en l\'état : une autorisation de travail est possible seulement 6 mois après l\'enregistrement de la demande d\'asile sans décision de l\'OFPRA. À accepter uniquement sur présentation de cette autorisation.'] },
  [TITRES[6]]: { niveau: 'interdit', court: 'Visa court séjour / touriste', regles: ['Un visa court séjour, touriste ou visiteur n\'autorise pas à travailler.'] },
  [TITRES[7]]: { niveau: 'interdit', court: 'Sans titre de séjour', regles: ['Aucune autorisation de travail : emploi interdit.'] },
  [TITRES[8]]: { niveau: 'interdit', court: 'Démarches en cours', regles: ['Pas de droit au travail tant que le titre ou un récépissé autorisant à travailler n\'est pas délivré.'] },
};

/** Catégorie de nationalité à partir des réponses d'une candidature (nouveau questionnaire, ou ancienne question « autorisation »). */
function nationaliteCandidat(r) {
  if (r.nationalite_cat) return r.nationalite_cat;
  if (r.autorisation === 'Nationalité française ou européenne') return 'Française';
  if (r.autorisation) return 'Autre nationalité';
  return null;
}
function titreCandidat(r) {
  if (r.titre_sejour) return r.titre_sejour;
  if (r.autorisation === 'Démarches en cours') return TITRES[8];
  return null;
}

/**
 * Situation de travail d'une personne. `nationalite` : valeur de la fiche ('Française', 'Union européenne / EEE / Suisse', 'Autre')
 * ou de la candidature ; `titre`, `expiration` (AAAA-MM-JJ) ; `ref` : date de référence (aujourd'hui ou date de mission).
 * Renvoie null pour un ressortissant français ou européen, sinon { niveau, court, libelle, regles, expiration, alertes }.
 */
function situation({ nationalite, titre, expiration }, ref) {
  if (!nationalite || /fran|union|europ|eee|suisse/i.test(nationalite)) return null;
  const jour = ref || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const t = PAR_TITRE[titre];
  const alertes = [];
  let niveau, court, regles;
  if (!t) { niveau = 'verifier'; court = 'Titre de séjour à justifier'; regles = ['Situation au regard du droit au travail non précisée : demander le titre de séjour ou l\'autorisation de travail avant toute mission.']; }
  else ({ niveau, court, regles } = t);
  if (expiration && /^\d{4}-\d{2}-\d{2}$/.test(expiration) && niveau !== 'interdit') {
    if (expiration < jour) { niveau = 'interdit'; court = 'Titre expiré'; alertes.push(`titre expiré le ${expiration.split('-').reverse().join('/')}`); }
    else {
      const j = Math.round((Date.parse(expiration + 'T12:00Z') - Date.parse(jour + 'T12:00Z')) / 864e5);
      if (j <= 60) alertes.push(`titre valable jusqu'au ${expiration.split('-').reverse().join('/')} (${j} jour${j > 1 ? 's' : ''})`);
    }
  }
  const libelle = niveau === 'interdit' ? `Non acceptable : ${court.toLowerCase()}` : court;
  return { niveau, court, libelle, titre: titre || null, expiration: expiration || null, regles: [...regles, ...REGLES_COMMUNES], alertes };
}
const situationCandidat = (r, ref) => situation({ nationalite: nationaliteCandidat(r), titre: titreCandidat(r), expiration: r.titre_expiration }, ref);
const situationInterim = (i, ref) => situation({ nationalite: i.nationalite, titre: i.titre_sejour, expiration: i.titre_expiration }, ref);

/** Date limite de vérification du titre à la préfecture : 2 jours ouvrables avant la mission (samedis, dimanches et jours fériés exclus). */
function dateLimiteVerification(dateMission) {
  const ferie = d => { try { return require('./hcr').estFerie(d); } catch { return false; } };
  const d = new Date(dateMission + 'T12:00Z'); let n = 0;
  while (n < 2) { d.setUTCDate(d.getUTCDate() - 1); const iso = d.toISOString().slice(0, 10), j = d.getUTCDay(); if (j !== 0 && j !== 6 && !ferie(iso)) n++; }
  return d.toISOString().slice(0, 10);
}
const fr = iso => iso.split('-').reverse().join('/');
const ecartJours = (a, b) => Math.round((Date.parse(b + 'T12:00Z') - Date.parse(a + 'T12:00Z')) / 864e5);

/** Contrôle d'une mission pour un intérimaire étranger : { bloquants, alertes } (même forme que le contrôle d'âge).
 *  Titre non encore vérifié à la préfecture : mission dans les 3 jours (24, 48 ou 72 h) ou après la date limite grisée ; à 4 jours ou plus, alerte avec la date limite. */
function controleMission(i, m, aujourdhui) {
  const s = situationInterim(i, m.date), bloquants = [], alertes = [];
  if (!s) return { bloquants, alertes };
  const auj = aujourdhui || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  if ((s.niveau === 'autorise' || s.niveau === 'conditions') && !i.titre_verifie_le && m.date >= auj) {
    const limite = dateLimiteVerification(m.date), j = ecartJours(auj, m.date);
    if (j <= 3 || auj > limite) bloquants.push(`titre de séjour non vérifié à la préfecture : vérification à faire au moins 2 jours ouvrables avant la mission (au plus tard le ${fr(limite)}), mission ${j <= 0 ? 'aujourd\'hui' : `dans ${j * 24} h`}`);
    else alertes.push(`vigilance : vérifier le titre de séjour auprès de la préfecture au plus tard le ${fr(limite)}`);
  }
  // Mission éloignée ou titre proche de l'expiration : rappel de la validité à la date de la mission
  if (s.expiration && s.niveau !== 'interdit' && s.expiration >= m.date && ecartJours(m.date, s.expiration) <= 30) alertes.push(`vigilance : titre valable jusqu'au ${fr(s.expiration)}, à renouveler avant toute mission après cette date`);
  if (s.niveau === 'interdit') bloquants.push(`${s.court.toLowerCase()} : pas d'autorisation de travail valable`);
  else if (s.niveau === 'verifier') bloquants.push('titre de séjour non renseigné : à justifier avant toute mission');
  if (s.expiration && s.expiration < m.date && s.niveau !== 'interdit') bloquants.push(`titre expiré à la date de la mission (fin de validité le ${s.expiration.split('-').reverse().join('/')})`);
  if (s.titre === TITRES[3]) alertes.push('étudiant étranger : 964 heures par an au maximum');
  if (s.titre === TITRES[2] || s.titre === TITRES[4]) alertes.push('vérifier les limites du titre (métier, région, mention « autorise à travailler »)');
  return { bloquants, alertes };
}

/** Nationalité de la fiche intérimaire à partir de la candidature. */
const nationaliteFiche = r => { const n = nationaliteCandidat(r); return n === 'Française' ? 'Française' : n && /union|europ/i.test(n) ? 'Union européenne / EEE / Suisse' : n ? 'Autre' : 'Française'; };

module.exports = { dateLimiteVerification, NATIONALITES_CAND, TITRES, REGLES_COMMUNES, situation, situationCandidat, situationInterim, controleMission, nationaliteFiche, nationaliteCandidat, titreCandidat };
