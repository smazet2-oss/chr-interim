'use strict';
// Droits d'accès : l'administrateur de l'agence décide, pour chaque espace (agence, employeur, intérimaire)
// et pour chaque compte, des fonctions accessibles ou verrouillées.
// Une fonction verrouillée disparaît du menu et ses actions sont refusées par le serveur.
// L'administrateur n'est jamais restreint ; lui seul gère les droits.
const { db, one, all, run, addColumn } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS droits (
  cible TEXT NOT NULL,            -- 'profil:agence' | 'profil:client' | 'profil:interim' | 'user:<id>'
  fonction TEXT NOT NULL,
  acces INTEGER NOT NULL CHECK (acces IN (0, 1)),
  PRIMARY KEY (cible, fonction)
)`);
addColumn('users', 'super_admin', 'INTEGER NOT NULL DEFAULT 0');
/** L'administrateur : le compte « admin », sinon le plus ancien compte agence. */
function assurerAdmin() {
  if (one('SELECT 1 FROM users WHERE super_admin = 1')) return;
  const u = one('SELECT id FROM users WHERE profil = \'agence\' ORDER BY (username = \'admin\') DESC, id LIMIT 1');
  if (u) run('UPDATE users SET super_admin = 1 WHERE id = ?', u.id);
}

const T = '*';
/** Fonctions verrouillables par espace : menu (vues) et actions du serveur (méthode, chemin sous /api). */
const FONCTIONS = {
  agence: [
    { k: 'a_stats', l: 'Statistiques', d: 'Chiffre d\'affaires, marge, notes.', vues: ['stats'], api: [['GET', /^\/stats$/]] },
    { k: 'a_candidatures', l: 'Candidatures intérimaires et clients', d: 'Consulter, accepter, refuser, convertir.', vues: ['candidats', 'prospects'], api: [[T, /^\/(candidats|prospects)(\/|$)/]] },
    { k: 'a_contrats', l: 'Contrats de mission', d: 'Liste et relances de signature.', vues: ['contrats'], api: [['POST', /^\/contrats\/\d+\/relancer$/]] },
    { k: 'a_paie', l: 'Paie', d: 'Calcul, fiches de paie, paiement.', vues: ['paie'], api: [['GET', /^\/paie$/], ['POST', /^\/bulletins/]] },
    { k: 'a_facturation', l: 'Facturation, relances et coefficients', d: 'Factures, relances, contrats commerciaux.', vues: ['facturation', 'relances', 'tarifs'], api: [['POST', /^\/factures/], ['GET', /^\/factures\/\d+\/document$/], ['GET', /^\/relances$/], [T, /^\/contrats-clients/]] },
    { k: 'a_suppression', l: 'Supprimer des fiches', d: 'Suppression définitive de clients ou d\'intérimaires.', vues: [], api: [['DELETE', /^\/(clients|interimaires)\/\d+$/]] },
    { k: 'a_acces', l: 'Accès utilisateurs', d: 'Créer, réinitialiser, désactiver des comptes.', vues: ['acces'], api: [[T, /^\/acces/]] },
    { k: 'a_journal', l: 'Journal des envois', d: 'Historique des e-mails, SMS et WhatsApp.', vues: ['journal'], api: [['GET', /^\/journal$/]] },
    { k: 'a_parametres', l: 'Paramètres', d: 'Identité légale, taux, messagerie.', vues: ['parametres'], api: [[T, /^\/parametres/]] },
  ],
  client: [
    { k: 'c_demandes', l: 'Faire des demandes de mission', d: 'Formulaire « Nouvelle demande ».', vues: [], api: [['POST', /^\/missions$/]] },
    { k: 'c_annuler', l: 'Annuler une mission', d: 'Bouton « Annuler la mission ».', vues: [], api: [['POST', /^\/missions\/\d+\/annuler$/]] },
    { k: 'c_decision', l: 'Accepter ou refuser les intérimaires', d: 'Décision sur les candidats.', vues: [], api: [['POST', /^\/missions\/\d+\/decision$/]] },
    { k: 'c_couts', l: 'Coût estimé des missions', d: 'Simulation HT / TTC.', vues: [], api: [['POST', /^\/simulation$/]], simulation: true },
    { k: 'c_heures', l: 'Heures et évaluations', d: 'Valider les heures, noter les intérimaires.', vues: ['heures'], api: [['POST', /^\/heures\/\d+\/(valider|evaluer)$/]] },
    { k: 'c_stats', l: 'Statistiques', d: 'Dépenses, heures, notes.', vues: ['stats'], api: [['GET', /^\/stats$/]] },
    { k: 'c_interimaires', l: 'Suivi des intérimaires', d: 'Liste et notes privées.', vues: ['interimaires'], api: [['GET', /^\/interimaires$/], ['PUT', /^\/notes-privees\//]] },
    { k: 'c_documents', l: 'Documents de prise de poste', d: 'Déposer et supprimer des documents.', vues: ['documents'], api: [['POST', /^\/documents$/], ['DELETE', /^\/documents\//]] },
    { k: 'c_contrats', l: 'Signer les contrats de mission', d: 'Rubrique Contrats de mission.', vues: ['contrats'], api: [['POST', /^\/contrats\/\d+\/signer$/]] },
    { k: 'c_factures', l: 'Factures', d: 'Consulter les factures.', vues: ['factures'], api: [['GET', /^\/factures/]] },
    { k: 'c_contrat', l: 'Contrat commercial', d: 'Consulter et signer le contrat commercial.', vues: ['contrat'], api: [[T, /^\/contrats-clients/]] },
  ],
  interim: [
    { k: 'i_accepter', l: 'Accepter des missions', d: 'Boutons Accepter / Refuser.', vues: [], api: [['POST', /^\/missions\/\d+\/repondre$/]] },
    { k: 'i_desister', l: 'Se désister d\'une mission', d: 'Bouton « Me désister ».', vues: [], api: [['POST', /^\/missions\/\d+\/desister$/]] },
    { k: 'i_indispo', l: 'Bouton « Je suis indisponible »', d: 'Indisponibilité imprévue.', vues: [], api: [['POST', /^\/indisponible$/]] },
    { k: 'i_dispos', l: 'Modifier ses disponibilités', d: 'Dans le planning.', vues: [], api: [['PUT', /^\/disponibilites$/]] },
    { k: 'i_simulation', l: 'Simulation de paie', d: 'Brut et net estimés des missions.', vues: [], api: [], simulation: true },
    { k: 'i_heures', l: 'Confirmer ses heures', d: 'Rubrique Mes heures.', vues: ['heures'], api: [['POST', /^\/heures\/\d+\/(confirmer|evaluer)$/]] },
    { k: 'i_stats', l: 'Statistiques', d: 'Gains, heures, notes.', vues: ['stats'], api: [['GET', /^\/stats$/]] },
    { k: 'i_profil', l: 'Profil et expériences', d: 'Ajouter ou retirer des expériences.', vues: ['profil'], api: [['POST', /^\/interimaires\/\d+\/experiences$/], ['DELETE', /^\/experiences\//]] },
    { k: 'i_avis', l: 'Avis', d: 'Avis reçus et donnés.', vues: ['avis'], api: [['GET', /^\/evaluations$/]] },
    { k: 'i_contrats', l: 'Contrats', d: 'Lire et signer ses contrats.', vues: ['contrats'], api: [[T, /^\/contrats(\/|$)/]] },
    { k: 'i_paie', l: 'Paie', d: 'Fiches de paie et paie en cours.', vues: ['paie'], api: [['GET', /^\/(bulletins|paie\/en-cours)/]] },
    { k: 'i_documents', l: 'Téléverser ses documents', d: 'Pièces du dossier.', vues: ['documents'], api: [['POST', /^\/interimaires\/\d+\/pieces$/], ['DELETE', /^\/pieces\//]] },
  ],
};
const PAR_CLE = Object.fromEntries(Object.values(FONCTIONS).flat().map(f => [f.k, f]));

/** Fonctions verrouillées pour un compte : réglage du compte, sinon celui de son espace, sinon accessible. */
function verrous(u) {
  if (!u || u.super_admin) return [];
  const R = {};
  for (const cible of ['profil:' + u.profil, 'user:' + u.id]) {
    for (const r of all('SELECT fonction, acces FROM droits WHERE cible = ?', cible)) R[r.fonction] = r.acces;
  }
  return (FONCTIONS[u.profil] || []).filter(f => R[f.k] === 0).map(f => f.k);
}
const verrouille = (u, k) => verrous(u).includes(k);

module.exports = function register(api, h) {
  const { fail, wrap } = h;
  assurerAdmin();

  /** Contrôle de chaque requête (après l'authentification). */
  api.use((req, res, next) => {
    const L = verrous(req.user); if (!L.length) return next();
    const chemin = req.path;
    // Simulation verrouillée : retirée de toutes les réponses (missions, détail du jour…).
    if (L.some(k => PAR_CLE[k].simulation)) {
      const envoyer = res.json.bind(res), sans = x => Array.isArray(x) ? x.map(sans) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([c]) => c !== 'simulation').map(([c, v]) => [c, sans(v)])) : x;
      res.json = corps => envoyer(sans(corps));
    }
    for (const k of L) for (const [m, re] of PAR_CLE[k].api) {
      if ((m === T || m === req.method) && re.test(chemin)) return res.status(403).json({ error: `Fonction verrouillée par l'agence : ${PAR_CLE[k].l}.` });
    }
    next();
  });

  const reserve = (req) => { if (req.user.profil !== 'agence' || !req.user.super_admin) fail(403, 'Réservé à l\'administrateur de l\'agence.'); };
  const catalogue = () => Object.fromEntries(Object.entries(FONCTIONS).map(([p, L]) => [p, L.map(({ k, l, d, vues }) => ({ k, l, d, vues }))]));

  api.get('/droits', wrap((req, res) => {
    reserve(req);
    const D = all('SELECT * FROM droits');
    const profils = Object.fromEntries(Object.keys(FONCTIONS).map(p => [p, Object.fromEntries(D.filter(d => d.cible === 'profil:' + p).map(d => [d.fonction, !!d.acces]))]));
    const comptes = all(`SELECT u.id, u.username, u.nom, u.profil, u.super_admin, u.actif, c.nom AS client_nom FROM users u LEFT JOIN clients c ON c.id = u.client_id ORDER BY u.profil, u.nom`)
      .map(u => ({ ...u, super_admin: !!u.super_admin, reglages: Object.fromEntries(D.filter(d => d.cible === 'user:' + u.id).map(d => [d.fonction, !!d.acces])), verrous: verrous(u) }));
    res.json({ catalogue: catalogue(), profils, comptes });
  }));
  /** acces : true (accessible), false (verrouillé), null (revenir au réglage de l'espace). */
  api.put('/droits', wrap((req, res) => {
    reserve(req);
    const { cible, fonction, acces } = req.body || {};
    const m = /^(profil:(agence|client|interim)|user:(\d+))$/.exec(String(cible || ''));
    if (!m) fail(400, 'Cible invalide.');
    const profil = m[2] || one('SELECT profil FROM users WHERE id = ?', Number(m[3]))?.profil;
    if (!profil) fail(404, 'Compte introuvable.');
    if (!(FONCTIONS[profil] || []).some(f => f.k === fonction)) fail(400, 'Fonction inconnue pour cet espace.');
    if (acces === null || acces === undefined) {
      if (!m[3]) fail(400, 'Choisissez accessible ou verrouillé.');
      run('DELETE FROM droits WHERE cible = ? AND fonction = ?', cible, fonction);
    } else run('INSERT INTO droits (cible, fonction, acces) VALUES (?,?,?) ON CONFLICT(cible, fonction) DO UPDATE SET acces = excluded.acces', cible, fonction, acces ? 1 : 0);
    res.json({ ok: true });
  }));
  /** Nommer ou retirer un administrateur (il en reste toujours au moins un). */
  api.put('/droits/admin', wrap((req, res) => {
    reserve(req);
    const u = one('SELECT * FROM users WHERE id = ?', Number(req.body?.user_id));
    if (!u || u.profil !== 'agence') fail(400, 'Seul un compte agence peut être administrateur.');
    const oui = !!req.body.super_admin;
    if (!oui && one('SELECT COUNT(*) n FROM users WHERE super_admin = 1').n <= 1 && u.super_admin) fail(409, 'Il faut au moins un administrateur.');
    run('UPDATE users SET super_admin = ? WHERE id = ?', oui ? 1 : 0, u.id);
    res.json({ ok: true });
  }));
};
module.exports.verrous = verrous;
module.exports.verrouille = verrouille;
/** Vues du menu masquées pour un compte. */
module.exports.vuesVerrouillees = u => verrous(u).flatMap(k => PAR_CLE[k].vues);
module.exports.FONCTIONS = FONCTIONS;
