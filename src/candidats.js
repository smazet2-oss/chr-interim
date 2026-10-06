'use strict';
// Candidatures d'intérimaires : page publique « Je cherche des missions » (même format que le questionnaire établissement),
// CV facultatif, suivi par l'agence (statut, date de rappel) et création de la fiche intérimaire.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, one, all, run, DATA_DIR } = require('./db');
const P = require('./parametres');
const { envoyer } = require('./notify');
const { POSTES } = require('./hcr-grille');
const { nettoyer, limite } = require('./prospects');

db.exec(`CREATE TABLE IF NOT EXISTS candidats (
  id INTEGER PRIMARY KEY,
  prenom TEXT NOT NULL, nom TEXT NOT NULL, telephone TEXT, email TEXT, ville TEXT, poste TEXT,
  reponses TEXT NOT NULL DEFAULT '{}',
  cv_fichier TEXT, cv_nom TEXT,
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'a_rappeler', 'entretien', 'inscrit', 'refuse')),
  date_relance TEXT, notes_agence TEXT NOT NULL DEFAULT '',
  interim_id INTEGER REFERENCES interimaires(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Colonnes de décision (après la création de la table)
const decisions = require('./decisions');
const CV_DIR = path.join(DATA_DIR, 'cv');
fs.mkdirSync(CV_DIR, { recursive: true });

const QUESTIONNAIRE = [
  { titre: 'Vous', champs: [
    { k: 'prenom', l: 'Prénom', type: 'text', req: true },
    { k: 'nom', l: 'Nom', type: 'text', req: true },
    { k: 'telephone', l: 'Téléphone', type: 'tel', req: true },
    { k: 'email', l: 'E-mail', type: 'email' },
    { k: 'ville', l: 'Ville où vous habitez', type: 'text', req: true },
    { k: 'date_naissance', l: 'Date de naissance', type: 'date' },
    { k: 'autorisation', l: 'Autorisation de travailler en France', type: 'radio', options: ['Nationalité française ou européenne', 'Titre de séjour autorisant à travailler', 'Démarches en cours'] },
  ] },
  { titre: 'Les postes que vous recherchez', champs: [
    { k: 'postes', l: 'Postes recherchés', type: 'checks', autre: true, options: Object.keys(POSTES) },
    { k: 'poste_principal', l: 'Votre poste principal', type: 'select', from: 'postes' },
    { k: 'experience', l: 'Votre expérience en hôtellerie-restauration', type: 'radio', options: ['Débutant(e)', 'Moins d\'un an', '1 à 3 ans', 'Plus de 3 ans'] },
    { k: 'formations', l: 'Diplômes et formations', type: 'checks', autre: true, options: ['CAP / BEP cuisine ou service', 'Bac pro ou BTS hôtellerie-restauration', 'Formation hygiène HACCP', 'Permis B'] },
    { k: 'langues', l: 'Langues parlées', type: 'text' },
  ] },
  { titre: 'Vos disponibilités', champs: [
    { k: 'creneaux', l: 'Quand pouvez-vous travailler ?', type: 'checks', options: ['En semaine', 'Le soir', 'Le week-end', 'La nuit', 'Les jours fériés'] },
    { k: 'type_mission', l: 'Le type de missions qui vous intéresse', type: 'radio', options: ['Extras ponctuels', 'Missions régulières', 'Saison complète', 'Tout type de mission'] },
    { k: 'prevenance', l: 'Vous pouvez partir en mission', type: 'radio', options: ['Le jour même', 'Sous 24 à 48 h', 'Avec une semaine de prévenance'] },
    { k: 'disponible_le', l: 'Disponible à partir du', type: 'date' },
  ] },
  { titre: 'Mobilité et équipement', champs: [
    { k: 'vehicule', l: 'Je suis véhiculé(e) (voiture ou deux-roues personnel)', type: 'bool' },
    { k: 'transport', l: 'Vos moyens de transport', type: 'checks', options: ['Transports en commun', 'Voiture', 'Deux-roues', 'À pied ou à vélo'] },
    { k: 'rayon', l: 'Distance maximale jusqu\'au lieu de mission', type: 'radio', options: ['Moins de 10 km', '10 à 25 km', 'Plus de 25 km'] },
    { k: 'tenue', l: 'Avez-vous votre tenue professionnelle (chaussures de sécurité, tenue de service ou de cuisine) ?', type: 'radio', options: ['Oui, complète', 'En partie', 'Non'] },
  ] },
  { titre: 'Vos attentes', champs: [
    { k: 'taux_souhaite', l: 'Taux horaire brut souhaité (€)', type: 'number' },
    { k: 'priorites', l: 'Ce qui compte le plus pour vous', type: 'checks', options: ['Missions proches de chez moi', 'Paiement rapide', 'Planning flexible', 'Missions longues', 'Évoluer vers un CDI'] },
    { k: 'canal', l: 'Comment préférez-vous recevoir les offres de mission ?', type: 'radio', options: ['SMS', 'WhatsApp', 'E-mail', 'Appel téléphonique'] },
    { k: 'message', l: 'Votre message', type: 'textarea' },
  ] },
];
const CHAMPS = Object.fromEntries(QUESTIONNAIRE.flatMap(s => s.champs).map(c => [c.k, c]));
const STATUTS = ['nouveau', 'a_rappeler', 'entretien', 'inscrit', 'refuse'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** CV : PDF, Word ou image, 5 Mo maximum, contenu vérifié (signature du fichier). */
const FORMATS = { 'application/pdf': ['.pdf', b => b.subarray(0, 4).toString() === '%PDF'], 'image/jpeg': ['.jpg', b => b[0] === 0xff && b[1] === 0xd8], 'image/png': ['.png', b => b.subarray(1, 4).toString() === 'PNG'],
  'application/msword': ['.doc', b => b.readUInt32BE(0) === 0xd0cf11e0], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', b => b.subarray(0, 2).toString() === 'PK'] };
const uploadCv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 80 } });

const lire = c => c && { ...c, reponses: JSON.parse(c.reponses || '{}') };

function publiques(api, h) {
  const { fail, wrap, HttpError } = h;
  api.get('/public/candidature', (req, res) => res.json({ questionnaire: QUESTIONNAIRE }));
  api.post('/public/candidature', (req, res, next) => uploadCv.single('cv')(req, res, e => e ? next(e.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'CV trop volumineux (5 Mo maximum).') : e) : next()), wrap(async (req, res) => {
    const b = req.body || {};
    if (b.site_web) return res.status(201).json({ ok: true }); // champ piège : robot
    if (!b.consentement) fail(400, 'Merci d\'accepter la conservation de vos informations pour que l\'agence vous recontacte.');
    const r = nettoyer(b, fail, CHAMPS);
    for (const k of ['date_naissance', 'disponible_le']) if (r[k] && !isDate(r[k])) fail(400, 'Date invalide.');
    let fichier = null;
    if (req.file) {
      const f = FORMATS[req.file.mimetype];
      if (!f || !f[1](req.file.buffer)) fail(400, 'CV refusé : PDF, Word ou image uniquement.');
      if (!limite(req.ip)) fail(429, 'Trop d\'envois depuis cette connexion. Réessayez dans une heure ou appelez-nous.');
      fichier = crypto.randomBytes(16).toString('hex') + f[0];
      fs.writeFileSync(path.join(CV_DIR, fichier), req.file.buffer);
    }
    if (!fichier && !limite(req.ip)) fail(429, 'Trop d\'envois depuis cette connexion. Réessayez dans une heure ou appelez-nous.');
    const poste = r.poste_principal && r.poste_principal !== 'Autre' ? r.poste_principal : r.postes?.find(x => x !== 'Autre') || r.postes_autre || null;
    run('INSERT INTO candidats (prenom, nom, telephone, email, ville, poste, reponses, cv_fichier, cv_nom) VALUES (?,?,?,?,?,?,?,?,?)',
      r.prenom, r.nom, r.telephone || null, r.email || null, r.ville || null, poste, JSON.stringify(r), fichier, req.file ? String(req.file.originalname).slice(0, 120) : null);
    require('./visites').convertir(b.visite, 'candidature');
    if (P.get('email')) {
      await envoyer('mail', { email: P.get('email') }, `Nouvelle candidature : ${r.prenom} ${r.nom}`,
        `Nouvelle candidature depuis le site : ${r.prenom} ${r.nom}${poste ? ', ' + poste : ''}${r.ville ? ', ' + r.ville : ''}. Contact : ${[r.telephone, r.email].filter(Boolean).join(' · ')}.${fichier ? ' CV joint dans l\'espace agence.' : ''}\n\nRetrouvez la candidature complète dans l'espace agence, rubrique Candidatures.`,
        { titre: 'Nouvelle candidature', bouton: 'Ouvrir les candidatures' });
    }
    res.status(201).json({ ok: true });
  }));
}

function agence(api, h) {
  const { fail, wrap, role } = h;
  api.get('/candidats', role('agence'), (req, res) => res.json(all('SELECT * FROM candidats ORDER BY CASE WHEN statut IN (\'inscrit\', \'refuse\') THEN 1 ELSE 0 END, COALESCE(date_relance, \'9999\'), id DESC').map(lire)));
  /** Texte proposé avant l'envoi, puis décision (acceptée : demande de rendez-vous sous 48 h ; refusée). */
  api.get('/candidats/:id/modele', role('agence'), wrap((req, res) => {
    const c = one('SELECT * FROM candidats WHERE id = ?', req.params.id); if (!c) fail(404, 'Candidature introuvable.');
    res.json({ ...decisions.modele('candidat', req.query.decision === 'refusee' ? 'refusee' : 'acceptee', c, req.query.rdv || null), email: c.email, telephone: c.telephone });
  }));
  api.post('/candidats/:id/decision', role('agence'), wrap(async (req, res) => {
    const c = one('SELECT * FROM candidats WHERE id = ?', req.params.id); if (!c) fail(404, 'Candidature introuvable.');
    if (c.interim_id) fail(409, 'Cette personne est déjà inscrite.');
    res.json(await decisions.decider('candidats', 'candidat', c, req.body || {}, h.today()));
  }));
  api.put('/candidats/:id', role('agence'), wrap((req, res) => {
    const c = one('SELECT * FROM candidats WHERE id = ?', req.params.id); if (!c) fail(404, 'Candidature introuvable.');
    const b = req.body || {};
    if (b.statut !== undefined && !STATUTS.includes(b.statut)) fail(400, 'Statut invalide.');
    if (b.date_relance && !isDate(b.date_relance)) fail(400, 'Date de rappel invalide.');
    run('UPDATE candidats SET statut = ?, date_relance = ?, notes_agence = ?, updated_at = datetime(\'now\') WHERE id = ?',
      b.statut ?? c.statut, b.date_relance === undefined ? c.date_relance : (b.date_relance || null), b.notes_agence === undefined ? c.notes_agence : String(b.notes_agence).slice(0, 3000), c.id);
    res.json(lire(one('SELECT * FROM candidats WHERE id = ?', c.id)));
  }));
  api.get('/candidats/:id/cv', role('agence'), wrap((req, res) => {
    const c = one('SELECT cv_fichier, cv_nom FROM candidats WHERE id = ?', req.params.id);
    if (!c?.cv_fichier) fail(404, 'Aucun CV.');
    const f = path.join(CV_DIR, path.basename(c.cv_fichier)), nom = c.cv_nom || 'cv' + path.extname(c.cv_fichier);
    if (!fs.existsSync(f)) fail(404, 'Fichier du CV introuvable.');
    // ?vue=1 : affichage dans l'application (PDF et images), autorisé seulement depuis le site lui-même
    if (req.query.vue === '1' && /\.(pdf|jpg|png)$/.test(c.cv_fichier)) {
      res.set({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'", 'Cache-Control': 'private, no-store' });
      res.type(path.extname(c.cv_fichier)); res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nom)}`);
      return res.sendFile(f);
    }
    res.download(f, nom);
  }));
  /** Inscription : crée la fiche intérimaire à partir de la candidature (l'accès se crée ensuite depuis la fiche). */
  api.post('/candidats/:id/interimaire', role('agence'), wrap((req, res) => {
    const c = lire(one('SELECT * FROM candidats WHERE id = ?', req.params.id)); if (!c) fail(404, 'Candidature introuvable.');
    if (c.interim_id) fail(409, 'Cette personne a déjà une fiche intérimaire.');
    const r = c.reponses, poste = c.poste || 'Serveur';
    const secteur = /cuisin|chef de partie|plong|commis de cuisine/i.test(poste) ? 'Cuisine' : /barman|bar\b/i.test(poste) ? 'Bar' : /chambre|gouvernante|r[ée]ception|veilleur|petit-d/i.test(poste) ? 'Hôtellerie' : 'Restauration';
    const competences = [r.vehicule && 'Véhiculé(e)', ...(r.formations || []).filter(x => x !== 'Autre'), r.formations_autre, r.langues && 'Langues : ' + r.langues].filter(Boolean).join(', ');
    const nationalite = r.autorisation === 'Nationalité française ou européenne' ? 'Française' : 'Autre';
    const id = run('INSERT INTO interimaires (prenom, nom, poste, secteur, telephone, email, ville, competences, experience, date_naissance, nationalite) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      c.prenom, c.nom, poste, secteur, c.telephone, c.email, c.ville, competences.slice(0, 1000), String(r.experience || '').slice(0, 1000), r.date_naissance || null, nationalite).lastInsertRowid;
    run('UPDATE candidats SET statut = \'inscrit\', interim_id = ?, updated_at = datetime(\'now\') WHERE id = ?', id, c.id);
    res.status(201).json({ interim_id: Number(id) });
  }));
  api.delete('/candidats/:id', role('agence'), wrap((req, res) => {
    const c = one('SELECT cv_fichier FROM candidats WHERE id = ?', req.params.id); if (!c) fail(404, 'Candidature introuvable.');
    run('DELETE FROM candidats WHERE id = ?', req.params.id);
    if (c.cv_fichier) fs.rmSync(path.join(CV_DIR, path.basename(c.cv_fichier)), { force: true });
    res.json({ ok: true });
  }));
}

module.exports = { publiques, agence, QUESTIONNAIRE };
