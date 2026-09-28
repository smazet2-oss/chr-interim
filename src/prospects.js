'use strict';
// Prospects : établissements HCR intéressés par des renforts.
// Page publique « Besoin de renforts ? » (sans compte) et saisie des visites terrain par l'agence,
// d'après le questionnaire d'étude de marché. Suivi commercial : statut, date de relance, conversion en client.
const { db, one, all, run } = require('./db');
const P = require('./parametres');
const { envoyer } = require('./notify');

db.exec(`CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('site', 'visite')),
  etablissement TEXT NOT NULL, adresse TEXT, repondant TEXT, telephone TEXT, email TEXT, type_etab TEXT,
  reponses TEXT NOT NULL DEFAULT '{}',
  date_visite TEXT, enqueteur TEXT, accord TEXT,
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'a_relancer', 'en_discussion', 'client', 'perdu')),
  date_relance TEXT, notes_agence TEXT NOT NULL DEFAULT '',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

/** Questionnaire (étude de marché intérim et extras HCR). « skip » : masqué si l'établissement ne fait jamais appel à des renforts. */
const QUESTIONNAIRE = [
  { titre: 'Votre établissement', champs: [
    { k: 'etablissement', l: 'Nom de l\'établissement', type: 'text', req: true },
    { k: 'adresse', l: 'Adresse / commune', type: 'text' },
    { k: 'repondant', l: 'Votre nom et votre fonction', type: 'text', req: true },
    { k: 'telephone', l: 'Téléphone', type: 'tel' },
    { k: 'email', l: 'E-mail', type: 'email' },
    { k: 'type_etab', l: 'Type d\'établissement', type: 'radio', autre: true, options: ['Restauration traditionnelle / gastronomique', 'Brasserie / restauration rapide', 'Hôtel / hôtel-restaurant', 'Traiteur / événementiel', 'Bar / pub / discothèque'] },
    { k: 'effectif', l: 'Effectif permanent', type: 'radio', options: ['Moins de 5 personnes', '5 à 15 personnes', 'Plus de 15 personnes'] },
  ] },
  { titre: 'Vos besoins en renforts', champs: [
    { k: 'frequence', l: 'À quelle fréquence faites-vous appel à du personnel en renfort ou à des extras ?', type: 'radio', options: ['Régulièrement (plusieurs fois par semaine)', 'Ponctuellement (1 à 3 fois par mois)', 'Saisonnier / événementiel', 'Rarement / jamais'] },
    { k: 'postes', l: 'Quels postes sont les plus difficiles à pourvoir ?', type: 'checks', autre: true, skip: true, options: ['Cuisinier / chef de partie', 'Commis / plongeur', 'Serveur / chef de rang', 'Barman / limonadier', 'Réceptionniste / veilleur de nuit', 'Employé d\'étage / gouvernante'] },
    { k: 'extras_mois', l: 'Nombre d\'extras par mois', type: 'number', skip: true },
    { k: 'heures_mois', l: 'ou heures par mois', type: 'number', skip: true },
    { k: 'pics', l: 'Périodes de pic (mois, saisons, événements)', type: 'text', skip: true },
    { k: 'vehicule', l: 'Nous avons besoin d\'intérimaires véhiculés (établissement peu desservi ou horaires tardifs)', type: 'bool' },
    { k: 'delai', l: 'Délai d\'anticipation moyen de vos demandes', type: 'radio', skip: true, options: ['Urgence absolue (moins de 4 h)', 'Court terme (24 à 48 h)', 'Planifié (plus d\'une semaine)'] },
  ] },
  { titre: 'Vos solutions actuelles', skip: true, champs: [
    { k: 'canaux', l: 'Comment gérez-vous aujourd\'hui vos renforts ou remplacements imprévus ?', type: 'checks', autre: true, skip: true, options: ['Réseau personnel / bouche-à-oreille', 'Annonces (Leboncoin, Facebook…)', 'Contrats d\'extra en direct (CDD d\'usage)', 'Plateformes / applications d\'extras', 'Agences d\'intérim traditionnelles'] },
    { k: 'agences', l: 'Si vous passez par des agences d\'intérim : lesquelles ?', type: 'text', skip: true },
    { k: 'satisfaction', l: 'Votre niveau de satisfaction avec les agences d\'intérim', type: 'radio', skip: true, options: ['Très satisfait', 'Moyennement satisfait', 'Insatisfait', 'Non concerné'] },
  ] },
  { titre: 'Vos attentes', champs: [
    { k: 'problemes', l: 'Quels problèmes rencontrez-vous avec les solutions actuelles, ou qu\'est-ce qui vous freine ?', type: 'checks', autre: true, options: ['Manque de réactivité (délais trop longs)', 'Profils non qualifiés / sans expérience HCR', 'Retards, absences ou abandons de poste', 'Coût / tarifs trop élevés', 'Lourdeur administrative (DPAE, contrats)'] },
    { k: 'probleme_principal', l: 'Le problème principal', type: 'select', from: 'problemes' },
    { k: 'services', l: 'Quels services vous feraient tester une nouvelle agence ?', type: 'checks', autre: true, options: ['Garantie de remplacement sous 2 heures', 'Profils évalués et équipés (tenue HCR)', 'Interlocuteur unique joignable 7j/7', 'Gestion 100 % dématérialisée (smartphone)'] },
  ] },
  { titre: 'Budget et conditions', champs: [
    { k: 'prix_serveur', l: 'Tarif acceptable pour un serveur qualifié (€ HT de l\'heure)', type: 'number' },
    { k: 'prix_cuisinier', l: 'Pour un cuisinier (€ HT de l\'heure)', type: 'number' },
    { k: 'prix_autre_poste', l: 'Autre poste', type: 'text' },
    { k: 'prix_autre', l: 'Tarif pour cet autre poste (€ HT de l\'heure)', type: 'number' },
    { k: 'coefficient', l: 'En coefficient de facturation, lequel jugez-vous acceptable ?', type: 'radio', options: ['Moins de 1,95', 'Entre 1,95 et 2,10', 'Entre 2,10 et 2,25', 'Plus de 2,25 si réactivité immédiate', 'Ne sait pas / non concerné'] },
    { k: 'reglement', l: 'Mode de règlement habituel', type: 'radio', options: ['Prélèvement automatique', 'Virement à 30 jours', 'Virement à 45 jours fin de mois'] },
  ] },
  { titre: 'Restons en contact', champs: [
    { k: 'releve', l: 'Souhaitez-vous recevoir chaque semaine notre relevé des profils disponibles dans votre zone ?', type: 'radio', options: ['Oui, par e-mail', 'Oui, par WhatsApp', 'Non'] },
    { k: 'message', l: 'Votre besoin ou votre message', type: 'textarea' },
  ] },
];
const CHAMPS = Object.fromEntries(QUESTIONNAIRE.flatMap(s => s.champs).map(c => [c.k, c]));
const COLONNES = ['etablissement', 'adresse', 'repondant', 'telephone', 'email', 'type_etab'];
const STATUTS = ['nouveau', 'a_relancer', 'en_discussion', 'client', 'perdu'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Valide les réponses contre le questionnaire : seules les options prévues sont acceptées. */
function nettoyer(b, fail, champs = CHAMPS) {
  const r = {};
  for (const c of Object.values(champs)) {
    let v = b[c.k];
    if (c.type === 'checks') {
      v = (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(x => c.options.includes(x) || (c.autre && x === 'Autre'));
      if (v.length) r[c.k] = [...new Set(v)];
    } else if (c.type === 'radio' || c.type === 'select') {
      const opts = c.from ? [...champs[c.from].options, 'Autre'] : [...c.options, ...(c.autre ? ['Autre'] : [])];
      if (v && !opts.includes(String(v))) fail(400, `« ${c.l} » : choix invalide.`);
      if (v) r[c.k] = String(v);
    } else if (c.type === 'bool') {
      if (v === true || ['oui', 'on', '1', 'true'].includes(String(v).toLowerCase())) r[c.k] = true;
    } else if (c.type === 'number') {
      if (v !== undefined && v !== '' && v !== null) { const n = Number(String(v).replace(',', '.')); if (!(n >= 0 && n < 100000)) fail(400, `« ${c.l} » : nombre invalide.`); r[c.k] = n; }
    } else if (v !== undefined && String(v).trim()) r[c.k] = String(v).trim().slice(0, c.type === 'textarea' ? 2000 : 200);
    if (c.autre && b[c.k + '_autre'] && String(b[c.k + '_autre']).trim()) r[c.k + '_autre'] = String(b[c.k + '_autre']).trim().slice(0, 200);
    if (c.req && !r[c.k]) fail(400, `« ${c.l} » est obligatoire.`);
  }
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail(400, 'Adresse e-mail invalide.');
  if (!r.email && !r.telephone) fail(400, 'Indiquez un téléphone ou un e-mail pour être recontacté.');
  return r;
}
function enregistrer(r, extra) {
  const cols = { ...Object.fromEntries(COLONNES.map(k => [k, r[k] || null])), reponses: JSON.stringify(r), ...extra };
  const keys = Object.keys(cols);
  return run(`INSERT INTO prospects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => cols[k])).lastInsertRowid;
}
const lire = p => p && { ...p, reponses: JSON.parse(p.reponses || '{}') };

/** Limite anti-abus du formulaire public : 5 envois par heure et par adresse. */
const envois = new Map();
function limite(ip) {
  const t = Date.now(), L = (envois.get(ip) || []).filter(x => t - x < 3600000);
  if (L.length >= 5) return false;
  L.push(t); envois.set(ip, L); return true;
}

/** Routes publiques : à enregistrer avant l'authentification. */
function publiques(api, h) {
  const { fail, wrap } = h;
  api.get('/public/questionnaire', (req, res) => res.json({
    questionnaire: QUESTIONNAIRE,
    agence: { nom: P.get('raison_sociale'), telephone: P.get('telephone'), email: P.get('email'), ville: P.get('ville') },
  }));
  api.post('/public/contact', wrap(async (req, res) => {
    const b = req.body || {};
    if (b.site_web) return res.status(201).json({ ok: true }); // champ piège : robot
    if (!b.consentement) fail(400, 'Merci d\'accepter la conservation de vos coordonnées pour être recontacté.');
    const r = nettoyer(b, fail);
    // Anti-abus : seules les demandes valides comptent (5 par heure et par connexion)
    if (!limite(req.ip)) fail(429, 'Trop d\'envois depuis cette connexion. Réessayez dans une heure ou appelez-nous.');
    enregistrer(r, { source: 'site', accord: 'en_ligne' });
    require('./visites').convertir(b.visite, 'contact');
    // Alerte à l'agence (e-mail de contact des Paramètres)
    if (P.get('email')) {
      await envoyer('mail', { email: P.get('email') }, `Nouveau contact : ${r.etablissement}`,
        `Nouvelle demande depuis le site : ${r.etablissement}${r.adresse ? ', ' + r.adresse : ''}. Contact : ${r.repondant} · ${[r.telephone, r.email].filter(Boolean).join(' · ')}.${r.message ? '\n\n« ' + r.message + ' »' : ''}\n\nRetrouvez la fiche complète dans l'espace agence, rubrique Prospects.`,
        { titre: 'Nouvelle demande de contact', bouton: 'Ouvrir les prospects' });
    }
    res.status(201).json({ ok: true });
  }));
}

/** Routes de l'agence. */
function agence(api, h) {
  const { fail, wrap, role, today } = h;
  api.get('/prospects', role('agence'), (req, res) => res.json(all('SELECT * FROM prospects ORDER BY CASE WHEN statut IN (\'client\', \'perdu\') THEN 1 ELSE 0 END, COALESCE(date_relance, \'9999\'), id DESC').map(lire)));
  /** Visite terrain saisie par l'agence. */
  api.post('/prospects', role('agence'), wrap((req, res) => {
    const b = req.body || {}, r = nettoyer(b, fail);
    if (b.date_visite && !isDate(b.date_visite)) fail(400, 'Date de visite invalide.');
    if (b.date_relance && !isDate(b.date_relance)) fail(400, 'Date de relance invalide.');
    if (!['ecrit', 'oral'].includes(b.accord)) fail(400, 'Indiquez si l\'accord pour conserver les coordonnées est écrit ou oral.');
    const id = enregistrer(r, { source: 'visite', date_visite: b.date_visite || today(), enqueteur: String(b.enqueteur || '').slice(0, 120), accord: b.accord,
      date_relance: b.date_relance || null, statut: b.date_relance ? 'a_relancer' : 'nouveau', notes_agence: String(b.notes_agence || '').slice(0, 3000) });
    res.status(201).json(lire(one('SELECT * FROM prospects WHERE id = ?', id)));
  }));
  /** Texte proposé avant l'envoi, puis décision (acceptée : rendez-vous sous 48 h ; refusée). */
  api.get('/prospects/:id/modele', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM prospects WHERE id = ?', req.params.id); if (!p) fail(404, 'Prospect introuvable.');
    res.json({ ...require('./decisions').modele('prospect', req.query.decision === 'refusee' ? 'refusee' : 'acceptee', p, req.query.rdv || null), email: p.email, telephone: p.telephone });
  }));
  api.post('/prospects/:id/decision', role('agence'), wrap(async (req, res) => {
    const p = one('SELECT * FROM prospects WHERE id = ?', req.params.id); if (!p) fail(404, 'Prospect introuvable.');
    if (p.client_id) fail(409, 'Ce prospect est déjà client.');
    res.json(await require('./decisions').decider('prospects', 'prospect', p, req.body || {}, today()));
  }));
  /** Suivi : statut, date de relance, notes. */
  api.put('/prospects/:id', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM prospects WHERE id = ?', req.params.id); if (!p) fail(404, 'Prospect introuvable.');
    const b = req.body || {};
    if (b.statut !== undefined && !STATUTS.includes(b.statut)) fail(400, 'Statut invalide.');
    if (b.date_relance && !isDate(b.date_relance)) fail(400, 'Date de relance invalide.');
    run('UPDATE prospects SET statut = ?, date_relance = ?, notes_agence = ?, updated_at = datetime(\'now\') WHERE id = ?',
      b.statut ?? p.statut, b.date_relance === undefined ? p.date_relance : (b.date_relance || null), b.notes_agence === undefined ? p.notes_agence : String(b.notes_agence).slice(0, 3000), p.id);
    res.json(lire(one('SELECT * FROM prospects WHERE id = ?', p.id)));
  }));
  /** Conversion en fiche client (coefficient par défaut ; le contrat commercial viendra ensuite). */
  api.post('/prospects/:id/client', role('agence'), wrap((req, res) => {
    const p = lire(one('SELECT * FROM prospects WHERE id = ?', req.params.id)); if (!p) fail(404, 'Prospect introuvable.');
    if (p.client_id) fail(409, 'Ce prospect est déjà client.');
    const t = String(p.type_etab || ''), secteur = /h[ôo]tel/i.test(t) ? 'Hôtellerie' : /bar|pub/i.test(t) ? 'Bar' : 'Restauration';
    const [ville] = String(p.adresse || '').split(',').reverse().map(x => x.trim());
    const r = run('INSERT INTO clients (nom, adresse, ville, contact, email, telephone, secteur, coefficient, delai_paiement) VALUES (?,?,?,?,?,?,?,?,?)',
      p.etablissement, p.adresse, ville || null, p.repondant, p.email, p.telephone, secteur, P.num('coefficient_minimum', 1.45), P.num('delai_paiement_defaut', 15));
    run('UPDATE prospects SET statut = \'client\', client_id = ?, updated_at = datetime(\'now\') WHERE id = ?', r.lastInsertRowid, p.id);
    res.status(201).json({ client_id: Number(r.lastInsertRowid) });
  }));
  /** Suppression à la demande de la personne (RGPD). */
  api.delete('/prospects/:id', role('agence'), wrap((req, res) => {
    if (!run('DELETE FROM prospects WHERE id = ?', req.params.id).changes) fail(404, 'Prospect introuvable.');
    res.json({ ok: true });
  }));
}

module.exports = { publiques, agence, QUESTIONNAIRE, nettoyer, limite };
