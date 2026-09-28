'use strict';
// Job dating des alternants HCR : un QR code par alternant, une application pour les recruteurs.
// Le recruteur scanne le badge et consulte un profil ANONYME (ni nom, ni coordonnées, ni photo) et le CV anonymisé,
// puis demande un rendez-vous à l'organisme ou écarte le profil. L'alternant n'est jamais informé d'un refus.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, one, all, run, tx, DATA_DIR } = require('./db');
const P = require('./parametres');
const { envoyer, siteUrl } = require('./notify');
const qr = require('./qrcode');

db.exec(`
CREATE TABLE IF NOT EXISTS jd_evenements (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL, date TEXT NOT NULL, lieu TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'clos')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Alternants : l'identité et les coordonnées ne sont visibles que par l'organisme.
CREATE TABLE IF NOT EXISTS jd_alternants (
  id INTEGER PRIMARY KEY,
  evenement_id INTEGER NOT NULL REFERENCES jd_evenements(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  prenom TEXT NOT NULL, nom TEXT NOT NULL, email TEXT, telephone TEXT,
  formation TEXT NOT NULL DEFAULT '', niveau TEXT NOT NULL DEFAULT '', contrat TEXT NOT NULL DEFAULT '', ecole TEXT NOT NULL DEFAULT '',
  postes TEXT NOT NULL DEFAULT '', secteur TEXT NOT NULL DEFAULT '', rythme TEXT NOT NULL DEFAULT '', debut TEXT, duree TEXT NOT NULL DEFAULT '',
  mobilite TEXT NOT NULL DEFAULT '', competences TEXT NOT NULL DEFAULT '', experiences TEXT NOT NULL DEFAULT '',
  langues TEXT NOT NULL DEFAULT '', qualites TEXT NOT NULL DEFAULT '', projet TEXT NOT NULL DEFAULT '',
  cv_fichier TEXT, cv_nom TEXT, cv_mime TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (evenement_id, numero)
);
CREATE TABLE IF NOT EXISTS jd_employeurs (
  id INTEGER PRIMARY KEY,
  evenement_id INTEGER NOT NULL REFERENCES jd_evenements(id) ON DELETE CASCADE,
  entreprise TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', email TEXT, telephone TEXT, ville TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jd_sessions (
  token TEXT PRIMARY KEY,
  employeur_id INTEGER NOT NULL REFERENCES jd_employeurs(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
-- Un profil consulté par un recruteur, et sa décision : rdv (demande de rendez-vous) ou abandon.
-- rdv_statut : demande (à traiter par l'organisme) · planifie · annule
CREATE TABLE IF NOT EXISTS jd_consultations (
  id INTEGER PRIMARY KEY,
  employeur_id INTEGER NOT NULL REFERENCES jd_employeurs(id) ON DELETE CASCADE,
  alternant_id INTEGER NOT NULL REFERENCES jd_alternants(id) ON DELETE CASCADE,
  vu_le TEXT NOT NULL DEFAULT (datetime('now')),
  decision TEXT CHECK (decision IN ('rdv', 'abandon')), decision_le TEXT,
  message TEXT, disponibilites TEXT,
  rdv_statut TEXT CHECK (rdv_statut IN ('demande', 'planifie', 'annule')),
  rdv_le TEXT, rdv_lieu TEXT, rdv_note TEXT, traite_le TEXT,
  UNIQUE (employeur_id, alternant_id)
);
`);

const PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'chr_jd';
const SESSION_JOURS = 3;
const CV_DIR = path.join(DATA_DIR, 'jobdating');
fs.mkdirSync(CV_DIR, { recursive: true });

const NIVEAUX = ['CAP / BEP', 'Bac pro / BP / MC', 'BTS / Bac+2', 'Licence / Bachelor (Bac+3)', 'Master / Bac+5'];
const CONTRATS = ['Apprentissage', 'Professionnalisation', 'Les deux'];
const SECTEURS = ['Restauration', 'Cuisine', 'Bar', 'Hôtellerie'];
/** Profil anonyme : seuls ces champs sont montrés aux recruteurs. */
const CHAMPS_PROFIL = { formation: 150, niveau: 60, contrat: 60, ecole: 150, postes: 300, secteur: 40, rythme: 150, duree: 60,
  mobilite: 300, competences: 1500, experiences: 3000, langues: 200, qualites: 1000, projet: 2000 };
const CHAMPS_IDENTITE = { prenom: 80, nom: 80, email: 150, telephone: 30 };

/** CV : PDF, Word ou image, 5 Mo maximum, contenu vérifié (signature du fichier). */
const FORMATS = { 'application/pdf': ['.pdf', b => b.subarray(0, 4).toString() === '%PDF'], 'image/jpeg': ['.jpg', b => b[0] === 0xff && b[1] === 0xd8], 'image/png': ['.png', b => b.subarray(1, 4).toString() === 'PNG'],
  'application/msword': ['.doc', b => b.length >= 4 && b.readUInt32BE(0) === 0xd0cf11e0], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', b => b.subarray(0, 2).toString() === 'PK'] };
const uploadCv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 40 } });

const str = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jeton = n => crypto.randomBytes(n).toString('base64url');
/** Code d'accès recruteur lisible (sans 0/O ni 1/I) : ABCD-2345. */
function nouveauCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const b = crypto.randomBytes(8), c = [...b].map(x => A[x % A.length]).join('');
    const code = c.slice(0, 4) + '-' + c.slice(4);
    if (!one('SELECT 1 FROM jd_employeurs WHERE code = ?', code)) return code;
  }
}
const lienBadge = a => `${siteUrl()}/jd/${a.token}`;
const lienRecruteur = e => `${siteUrl()}/recruteur?acces=${e.token}`;
const fdate = iso => new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** « 2026-10-05T14:30 » → « lundi 5 octobre 2026 à 14 h 30 » (heure saisie par l'organisme, sans conversion). */
const fdateHeure = s => `${fdate(s)} à ${s.slice(11, 13)} h ${s.slice(14, 16)}`;
const libelle = a => `Candidat·e n° ${a.numero}`;

/** Ce que voit le recruteur : aucune donnée d'identité (le prénom n'apparaît qu'une fois le rendez-vous fixé). */
function vueAnonyme(a, c) {
  const v = { id: a.id, numero: a.numero, cv: !!a.cv_fichier, cv_type: a.cv_mime || null, debut: a.debut || null };
  for (const k of Object.keys(CHAMPS_PROFIL)) v[k] = a[k] || '';
  if (c) {
    Object.assign(v, { vu_le: c.vu_le, decision: c.decision || null, decision_le: c.decision_le || null, message: c.message || '', disponibilites: c.disponibilites || '',
      rdv_statut: c.rdv_statut || null, rdv_le: c.rdv_le || null, rdv_lieu: c.rdv_lieu || null, rdv_note: c.rdv_note || null });
    if (c.rdv_statut === 'planifie') v.prenom = a.prenom;
  }
  return v;
}

/** Lecture des champs du formulaire alternant (multipart). */
function corpsAlternant(b, fail, creation) {
  const c = {};
  for (const [k, max] of Object.entries({ ...CHAMPS_IDENTITE, ...CHAMPS_PROFIL })) if (b[k] !== undefined) c[k] = str(b[k], max);
  if (b.debut !== undefined) { if (b.debut && !isDate(b.debut)) fail(400, 'Date de début invalide.'); c.debut = b.debut || null; }
  if (c.niveau && !NIVEAUX.includes(c.niveau)) fail(400, 'Niveau invalide.');
  if (c.contrat && !CONTRATS.includes(c.contrat)) fail(400, 'Type de contrat invalide.');
  if (c.secteur && !SECTEURS.includes(c.secteur)) fail(400, 'Secteur invalide.');
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fail(400, 'Adresse e-mail invalide.');
  if (creation && (!c.prenom || !c.nom)) fail(400, 'Prénom et nom sont obligatoires.');
  if (!creation && (c.prenom === '' || c.nom === '')) fail(400, 'Prénom et nom sont obligatoires.');
  if (creation && !c.formation) fail(400, 'Indiquez la formation préparée.');
  return c;
}
/** Enregistre le CV anonymisé reçu ; renvoie les colonnes à mettre à jour. */
function enregistrerCv(file, b, fail) {
  if (!file) return {};
  const f = FORMATS[file.mimetype];
  if (!f || !f[1](file.buffer)) fail(400, 'CV refusé : PDF, Word ou image uniquement.');
  if (!['1', 'true', 'on'].includes(String(b.cv_anonyme))) fail(400, 'Confirmez que le CV est anonymisé (ni nom, ni photo, ni adresse, ni coordonnées).');
  const fichier = crypto.randomBytes(16).toString('hex') + f[0];
  fs.writeFileSync(path.join(CV_DIR, fichier), file.buffer);
  return { cv_fichier: fichier, cv_nom: str(Buffer.from(file.originalname, 'latin1').toString('utf8'), 120) || 'cv' + f[0], cv_mime: file.mimetype };
}
const effacerCv = f => { if (f) fs.rmSync(path.join(CV_DIR, path.basename(f)), { force: true }); };
function envoyerCv(res, a, inline) {
  const ext = path.extname(a.cv_fichier);
  res.set('Content-Type', a.cv_mime || 'application/octet-stream');
  const nom = inline ? `${libelle(a).replace(/[^\w]+/g, '-')}${ext}` : a.cv_nom || 'cv' + ext;
  res.set('Content-Disposition', `${inline && a.cv_mime !== 'application/msword' && !/wordprocessing/.test(a.cv_mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nom)}`);
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(path.join(CV_DIR, path.basename(a.cv_fichier)));
}

function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
/** Recruteur connecté (session job dating), ou null. */
function recruteurDe(req) {
  const t = parseCookies(req.headers.cookie)[COOKIE];
  if (!t) return null;
  return one(`SELECT e.*, s.token AS session FROM jd_sessions s JOIN jd_employeurs e ON e.id = s.employeur_id WHERE s.token = ? AND s.expires_at > ?`, t, new Date().toISOString()) || null;
}

// Limite des tentatives de connexion par code : 10 par quart d'heure et par adresse IP.
const tentatives = new Map();
const bloque = ip => { const t = tentatives.get(ip); return t && t.reset > Date.now() && t.n >= 10; };
function echec(ip) {
  const now = Date.now(), t = tentatives.get(ip);
  if (!t || t.reset < now) tentatives.set(ip, { n: 1, reset: now + 15 * 60e3 }); else t.n++;
}

/** Prévient l'organisme (cloche de l'espace agence et e-mail de contact). */
async function prevenirOrganisme(message, sujet) {
  run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', message);
  if (P.get('email')) await envoyer('mail', { email: P.get('email') }, sujet, `${message}\n\nRetrouvez la demande dans l'espace agence, rubrique Job dating.`, { titre: sujet, bouton: 'Ouvrir le job dating' });
}

/* ================= Application des recruteurs (sans compte : code d'accès) ================= */
function recruteur(api, h) {
  const { fail, wrap } = h;
  const exige = (req, res, next) => {
    const e = recruteurDe(req);
    if (!e) return res.status(401).json({ error: 'Connectez-vous avec votre code d\'accès recruteur.' });
    req.recruteur = e; req.evenement = one('SELECT * FROM jd_evenements WHERE id = ?', e.evenement_id);
    next();
  };
  const moi = req => ({
    employeur: { id: req.recruteur.id, entreprise: req.recruteur.entreprise, contact: req.recruteur.contact },
    evenement: { id: req.evenement.id, nom: req.evenement.nom, date: req.evenement.date, lieu: req.evenement.lieu, statut: req.evenement.statut },
    organisme: { nom: P.get('raison_sociale'), telephone: P.get('telephone') || null, email: P.get('email') || null },
  });

  api.post('/jd/connexion', wrap((req, res) => {
    if (bloque(req.ip)) fail(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    const b = req.body || {};
    const code = str(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const e = b.acces ? one('SELECT * FROM jd_employeurs WHERE token = ?', str(b.acces, 64))
      : code.length === 8 ? one('SELECT * FROM jd_employeurs WHERE code = ?', code.slice(0, 4) + '-' + code.slice(4)) : null;
    if (!e) { echec(req.ip); fail(401, 'Code d\'accès inconnu. Vérifiez-le auprès de l\'organisme.'); }
    run('DELETE FROM jd_sessions WHERE expires_at < ?', new Date().toISOString());
    const token = jeton(32), exp = new Date(Date.now() + SESSION_JOURS * 864e5);
    run('INSERT INTO jd_sessions (token, employeur_id, expires_at) VALUES (?,?,?)', token, e.id, exp.toISOString());
    // SameSite=Lax : le lien ouvert par l'appareil photo du téléphone (/jd/…) doit retrouver la session.
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, expires: exp, path: '/' });
    req.recruteur = e; req.evenement = one('SELECT * FROM jd_evenements WHERE id = ?', e.evenement_id);
    res.json(moi(req));
  }));
  api.post('/jd/deconnexion', (req, res) => {
    const t = parseCookies(req.headers.cookie)[COOKIE];
    if (t) run('DELETE FROM jd_sessions WHERE token = ?', t);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });
  api.get('/jd/moi', exige, (req, res) => res.json(moi(req)));

  /** Profils consultés par ce recruteur, avec sa décision. */
  api.get('/jd/profils', exige, (req, res) => {
    res.json(all('SELECT * FROM jd_consultations WHERE employeur_id = ? ORDER BY vu_le DESC, id DESC', req.recruteur.id)
      .map(c => vueAnonyme(one('SELECT * FROM jd_alternants WHERE id = ?', c.alternant_id), c)));
  });
  /** Scan d'un QR code (jeton du badge ou lien complet) ou saisie du numéro du badge. */
  api.get('/jd/scan/:ref', exige, wrap((req, res) => {
    let ref = str(req.params.ref, 300);
    const m = ref.match(/\/jd\/([A-Za-z0-9_-]{10,64})/); if (m) ref = m[1];
    const num = ref.replace(/^n(°|o)?\s*/i, '');
    const a = /^\d{1,5}$/.test(num) ? one('SELECT * FROM jd_alternants WHERE evenement_id = ? AND numero = ?', req.evenement.id, Number(num))
      : one('SELECT * FROM jd_alternants WHERE token = ?', ref);
    if (!a) fail(404, 'Aucun candidat ne correspond à ce QR code ou à ce numéro.');
    if (a.evenement_id !== req.evenement.id) fail(404, 'Ce badge appartient à un autre job dating.');
    let c = one('SELECT * FROM jd_consultations WHERE employeur_id = ? AND alternant_id = ?', req.recruteur.id, a.id);
    if (!c) {
      if (req.evenement.statut === 'clos') fail(409, 'Le job dating est terminé : vous ne pouvez plus consulter de nouveaux profils.');
      run('INSERT INTO jd_consultations (employeur_id, alternant_id) VALUES (?,?)', req.recruteur.id, a.id);
      c = one('SELECT * FROM jd_consultations WHERE employeur_id = ? AND alternant_id = ?', req.recruteur.id, a.id);
    }
    res.json(vueAnonyme(a, c));
  }));
  const consulte = req => {
    const a = one('SELECT * FROM jd_alternants WHERE id = ? AND evenement_id = ?', Number(req.params.id), req.evenement.id);
    const c = a && one('SELECT * FROM jd_consultations WHERE employeur_id = ? AND alternant_id = ?', req.recruteur.id, a.id);
    if (!c) fail(404, 'Profil introuvable : scannez d\'abord le badge du candidat.');
    return { a, c };
  };
  api.get('/jd/profils/:id', exige, wrap((req, res) => { const { a, c } = consulte(req); res.json(vueAnonyme(a, c)); }));
  api.get('/jd/profils/:id/cv', exige, wrap((req, res) => {
    const { a } = consulte(req);
    if (!a.cv_fichier) fail(404, 'Pas de CV pour ce candidat.');
    envoyerCv(res, a, true);
  }));
  /** Décision du recruteur : demande de rendez-vous, abandon, ou retour à « à décider ». */
  api.post('/jd/profils/:id/decision', exige, wrap(async (req, res) => {
    const { a, c } = consulte(req), b = req.body || {};
    const d = b.decision === 'rdv' || b.decision === 'abandon' ? b.decision : b.decision === null ? null : fail(400, 'Décision invalide.');
    if (c.rdv_statut === 'planifie') fail(409, 'Un rendez-vous est déjà fixé avec ce candidat : contactez l\'organisme pour le modifier.');
    const e = req.recruteur, qui = `${e.entreprise}${e.contact ? ` (${e.contact})` : ''}`;
    if (d === 'rdv') {
      const message = str(b.message, 1000), dispo = str(b.disponibilites, 300);
      run(`UPDATE jd_consultations SET decision = 'rdv', decision_le = datetime('now'), message = ?, disponibilites = ?, rdv_statut = 'demande', rdv_le = NULL, rdv_lieu = NULL, rdv_note = NULL, traite_le = NULL WHERE id = ?`, message || null, dispo || null, c.id);
      await prevenirOrganisme(`Job dating « ${req.evenement.nom} » : ${qui} demande un rendez-vous avec ${libelle(a)} (${a.prenom} ${a.nom}, ${a.formation}).${dispo ? ` Disponibilités : ${dispo}.` : ''}${message ? ` Message : « ${message} »` : ''}`,
        `Demande de rendez-vous : ${e.entreprise} → ${libelle(a)}`);
    } else {
      run('UPDATE jd_consultations SET decision = ?, decision_le = ?, rdv_statut = NULL, rdv_le = NULL, rdv_lieu = NULL, rdv_note = NULL, traite_le = NULL WHERE id = ?', d, d ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, c.id);
      if (c.rdv_statut === 'demande') run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Job dating « ${req.evenement.nom} » : ${qui} a retiré sa demande de rendez-vous avec ${libelle(a)} (${a.prenom} ${a.nom}).`);
    }
    res.json(vueAnonyme(a, one('SELECT * FROM jd_consultations WHERE id = ?', c.id)));
  }));
}

/* ================= Espace de l'organisme (agence) ================= */
function agence(api, h) {
  const { fail, wrap, role } = h;
  const ag = role('agence');
  const evenement = id => { const e = one('SELECT * FROM jd_evenements WHERE id = ?', Number(id)); if (!e) fail(404, 'Job dating introuvable.'); return e; };
  const alternant = id => { const a = one('SELECT * FROM jd_alternants WHERE id = ?', Number(id)); if (!a) fail(404, 'Alternant introuvable.'); return a; };
  const employeur = id => { const e = one('SELECT * FROM jd_employeurs WHERE id = ?', Number(id)); if (!e) fail(404, 'Recruteur introuvable.'); return e; };
  const avecCv = (req, res, next) => uploadCv.single('cv')(req, res, e => e ? next(e.code === 'LIMIT_FILE_SIZE' ? new h.HttpError(400, 'CV trop volumineux (5 Mo maximum).') : e) : next());
  const corpsEvenement = b => {
    const e = { nom: str(b.nom, 150), date: b.date, lieu: str(b.lieu, 200), description: str(b.description, 2000) };
    if (!e.nom) fail(400, 'Donnez un nom au job dating.');
    if (!isDate(e.date)) fail(400, 'Date invalide.');
    return e;
  };

  api.get('/jobdating/options', ag, (req, res) => res.json({ niveaux: NIVEAUX, contrats: CONTRATS, secteurs: SECTEURS }));
  api.get('/jobdating/evenements', ag, (req, res) => res.json(all(`SELECT e.*,
      (SELECT COUNT(*) FROM jd_alternants a WHERE a.evenement_id = e.id) AS nb_alternants,
      (SELECT COUNT(*) FROM jd_employeurs x WHERE x.evenement_id = e.id) AS nb_employeurs,
      (SELECT COUNT(*) FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id WHERE a.evenement_id = e.id) AS nb_scans,
      (SELECT COUNT(*) FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id WHERE a.evenement_id = e.id AND c.rdv_statut = 'demande') AS nb_a_traiter,
      (SELECT COUNT(*) FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id WHERE a.evenement_id = e.id AND c.rdv_statut = 'planifie') AS nb_planifies
    FROM jd_evenements e ORDER BY e.date DESC, e.id DESC`)));
  api.post('/jobdating/evenements', ag, wrap((req, res) => {
    const e = corpsEvenement(req.body || {});
    const r = run('INSERT INTO jd_evenements (nom, date, lieu, description) VALUES (?,?,?,?)', e.nom, e.date, e.lieu, e.description);
    res.status(201).json(evenement(r.lastInsertRowid));
  }));
  api.put('/jobdating/evenements/:id', ag, wrap((req, res) => {
    const ev = evenement(req.params.id), b = req.body || {};
    const e = corpsEvenement({ ...ev, ...b });
    const statut = b.statut === undefined ? ev.statut : ['ouvert', 'clos'].includes(b.statut) ? b.statut : fail(400, 'Statut invalide.');
    run('UPDATE jd_evenements SET nom = ?, date = ?, lieu = ?, description = ?, statut = ? WHERE id = ?', e.nom, e.date, e.lieu, e.description, statut, ev.id);
    res.json(evenement(ev.id));
  }));
  /** Suppression de l'événement et de toutes ses données (CV compris), par exemple à la fin de la durée de conservation. */
  api.delete('/jobdating/evenements/:id', ag, wrap((req, res) => {
    const ev = evenement(req.params.id);
    const fichiers = all('SELECT cv_fichier FROM jd_alternants WHERE evenement_id = ? AND cv_fichier IS NOT NULL', ev.id).map(x => x.cv_fichier);
    run('DELETE FROM jd_evenements WHERE id = ?', ev.id);
    fichiers.forEach(effacerCv);
    res.json({ ok: true });
  }));

  /** Tableau complet d'un job dating : alternants, recruteurs, demandes de rendez-vous. */
  api.get('/jobdating/evenements/:id', ag, wrap((req, res) => {
    const ev = evenement(req.params.id);
    const alternants = all(`SELECT a.*,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.alternant_id = a.id) AS nb_vus,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.alternant_id = a.id AND c.decision = 'rdv' AND c.rdv_statut != 'annule') AS nb_rdv,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.alternant_id = a.id AND c.decision = 'abandon') AS nb_abandons
      FROM jd_alternants a WHERE a.evenement_id = ? ORDER BY a.numero`, ev.id).map(({ cv_fichier, token, ...a }) => ({ ...a, cv: !!cv_fichier, lien: lienBadge({ token }) }));
    const employeurs = all(`SELECT e.*,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.employeur_id = e.id) AS nb_vus,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.employeur_id = e.id AND c.decision = 'rdv' AND c.rdv_statut != 'annule') AS nb_rdv,
        (SELECT COUNT(*) FROM jd_consultations c WHERE c.employeur_id = e.id AND c.decision = 'abandon') AS nb_abandons
      FROM jd_employeurs e WHERE e.evenement_id = ? ORDER BY e.entreprise`, ev.id).map(({ token, ...e }) => ({ ...e, lien: lienRecruteur({ token }) }));
    const demandes = all(`SELECT c.*, a.numero, a.prenom, a.nom, a.formation, a.email AS alternant_email, a.telephone AS alternant_telephone,
        e.entreprise, e.contact, e.email AS employeur_email, e.telephone AS employeur_telephone
      FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id JOIN jd_employeurs e ON e.id = c.employeur_id
      WHERE a.evenement_id = ? AND c.decision = 'rdv'
      ORDER BY CASE c.rdv_statut WHEN 'demande' THEN 0 WHEN 'planifie' THEN 1 ELSE 2 END, c.decision_le DESC`, ev.id);
    const t = one(`SELECT COUNT(*) AS scans, SUM(c.decision = 'rdv') AS rdv, SUM(c.decision = 'abandon') AS abandons, SUM(c.decision IS NULL) AS a_decider
      FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id WHERE a.evenement_id = ?`, ev.id);
    res.json({ evenement: ev, alternants, employeurs, demandes, totaux: { scans: t.scans || 0, rdv: t.rdv || 0, abandons: t.abandons || 0, a_decider: t.a_decider || 0 } });
  }));

  /* ---- Alternants ---- */
  api.post('/jobdating/evenements/:id/alternants', ag, avecCv, wrap((req, res) => {
    const ev = evenement(req.params.id), b = req.body || {};
    const c = corpsAlternant(b, fail, true);
    Object.assign(c, enregistrerCv(req.file, b, fail));
    const id = tx(() => {
      c.numero = (one('SELECT MAX(numero) AS n FROM jd_alternants WHERE evenement_id = ?', ev.id).n || 0) + 1;
      c.token = jeton(12); c.evenement_id = ev.id;
      const k = Object.keys(c);
      return run(`INSERT INTO jd_alternants (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, ...k.map(x => c[x])).lastInsertRowid;
    });
    res.status(201).json(alternant(id));
  }));
  api.put('/jobdating/alternants/:id', ag, avecCv, wrap((req, res) => {
    const a = alternant(req.params.id), b = req.body || {};
    const c = corpsAlternant(b, fail, false);
    const cv = enregistrerCv(req.file, b, fail);
    Object.assign(c, cv);
    const k = Object.keys(c);
    if (k.length) run(`UPDATE jd_alternants SET ${k.map(x => x + ' = ?').join(', ')} WHERE id = ?`, ...k.map(x => c[x]), a.id);
    if (cv.cv_fichier) effacerCv(a.cv_fichier);
    res.json(alternant(a.id));
  }));
  api.delete('/jobdating/alternants/:id/cv', ag, wrap((req, res) => {
    const a = alternant(req.params.id);
    run('UPDATE jd_alternants SET cv_fichier = NULL, cv_nom = NULL, cv_mime = NULL WHERE id = ?', a.id);
    effacerCv(a.cv_fichier);
    res.json({ ok: true });
  }));
  api.delete('/jobdating/alternants/:id', ag, wrap((req, res) => {
    const a = alternant(req.params.id);
    run('DELETE FROM jd_alternants WHERE id = ?', a.id);
    effacerCv(a.cv_fichier);
    res.json({ ok: true });
  }));
  api.get('/jobdating/alternants/:id/cv', ag, wrap((req, res) => {
    const a = alternant(req.params.id);
    if (!a.cv_fichier) fail(404, 'Aucun CV.');
    envoyerCv(res, a, false);
  }));
  api.get('/jobdating/alternants/:id/qr.svg', ag, wrap((req, res) => {
    const a = alternant(req.params.id);
    res.type('image/svg+xml').set('Cache-Control', 'private, no-store').send(qr.svg(lienBadge(a), { titre: libelle(a) }));
  }));
  /** Envoi du badge à l'alternant : lien vers son QR code, à montrer sur son téléphone ou à imprimer. */
  api.post('/jobdating/alternants/:id/envoyer', ag, wrap(async (req, res) => {
    const a = alternant(req.params.id), ev = evenement(a.evenement_id);
    const canaux = (req.body?.canaux || []).filter(c => ['mail', 'sms', 'whatsapp'].includes(c));
    if (!canaux.length) fail(400, 'Choisissez au moins un moyen d\'envoi.');
    const texte = `${P.get('raison_sociale')} : bonjour ${a.prenom}, voici votre badge pour le job dating « ${ev.nom} » du ${fdate(ev.date)}${ev.lieu ? ` (${ev.lieu})` : ''}. Vous êtes le candidat n° ${a.numero}. Présentez ce QR code aux recruteurs : ils verront votre profil et votre CV de façon anonyme, sans votre nom ni vos coordonnées. Si un recruteur souhaite vous rencontrer, nous vous contacterons pour fixer le rendez-vous.`;
    const resultats = {};
    for (const c of canaux) resultats[c] = await envoyer(c, a, `Votre badge — ${ev.nom}`, texte, { titre: 'Votre badge job dating', bouton: 'Afficher mon QR code', lien: lienBadge(a) });
    res.json({ resultats });
  }));

  /* ---- Recruteurs ---- */
  const corpsEmployeur = b => {
    const e = { entreprise: str(b.entreprise, 150), contact: str(b.contact, 120), email: str(b.email, 150) || null, telephone: str(b.telephone, 30) || null, ville: str(b.ville, 100) };
    if (!e.entreprise) fail(400, 'Indiquez le nom de l\'entreprise.');
    if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) fail(400, 'Adresse e-mail invalide.');
    return e;
  };
  const vueEmployeur = e => { const { token, ...x } = e; return { ...x, lien: lienRecruteur({ token }) }; };
  api.post('/jobdating/evenements/:id/employeurs', ag, wrap((req, res) => {
    const ev = evenement(req.params.id), e = corpsEmployeur(req.body || {});
    const r = run('INSERT INTO jd_employeurs (evenement_id, entreprise, contact, email, telephone, ville, code, token) VALUES (?,?,?,?,?,?,?,?)',
      ev.id, e.entreprise, e.contact, e.email, e.telephone, e.ville, nouveauCode(), jeton(24));
    res.status(201).json(vueEmployeur(employeur(r.lastInsertRowid)));
  }));
  api.put('/jobdating/employeurs/:id', ag, wrap((req, res) => {
    const x = employeur(req.params.id), e = corpsEmployeur({ ...x, ...req.body });
    run('UPDATE jd_employeurs SET entreprise = ?, contact = ?, email = ?, telephone = ?, ville = ? WHERE id = ?', e.entreprise, e.contact, e.email, e.telephone, e.ville, x.id);
    res.json(vueEmployeur(employeur(x.id)));
  }));
  /** Nouveau code et nouveau lien d'accès : l'ancien ne fonctionne plus et les sessions sont fermées. */
  api.post('/jobdating/employeurs/:id/code', ag, wrap((req, res) => {
    const x = employeur(req.params.id);
    tx(() => {
      run('UPDATE jd_employeurs SET code = ?, token = ? WHERE id = ?', nouveauCode(), jeton(24), x.id);
      run('DELETE FROM jd_sessions WHERE employeur_id = ?', x.id);
    });
    res.json(vueEmployeur(employeur(x.id)));
  }));
  api.delete('/jobdating/employeurs/:id', ag, wrap((req, res) => {
    const x = employeur(req.params.id);
    run('DELETE FROM jd_employeurs WHERE id = ?', x.id);
    res.json({ ok: true });
  }));
  api.get('/jobdating/employeurs/:id/qr.svg', ag, wrap((req, res) => {
    const x = employeur(req.params.id);
    res.type('image/svg+xml').set('Cache-Control', 'private, no-store').send(qr.svg(lienRecruteur(x), { titre: `Accès recruteur ${x.entreprise}` }));
  }));
  api.post('/jobdating/employeurs/:id/envoyer', ag, wrap(async (req, res) => {
    const x = employeur(req.params.id), ev = evenement(x.evenement_id);
    const canaux = (req.body?.canaux || []).filter(c => ['mail', 'sms', 'whatsapp'].includes(c));
    if (!canaux.length) fail(400, 'Choisissez au moins un moyen d\'envoi.');
    const texte = `${P.get('raison_sociale')} : votre accès recruteur pour le job dating « ${ev.nom} » du ${fdate(ev.date)}. Ouvrez le lien sur votre téléphone, ou saisissez le code ${x.code} sur ${siteUrl()}/recruteur. Scannez le QR code des alternants pour consulter leur profil et leur CV anonymes, puis demandez un rendez-vous en un clic.`;
    const resultats = {};
    for (const c of canaux) resultats[c] = await envoyer(c, x, `Votre accès recruteur — ${ev.nom}`, texte, { titre: 'Votre accès recruteur', bouton: 'Ouvrir l\'application', lien: lienRecruteur(x), masquer: x.token });
    res.json({ resultats });
  }));

  /* ---- Demandes de rendez-vous ---- */
  const demande = id => {
    const c = one(`SELECT c.*, a.evenement_id FROM jd_consultations c JOIN jd_alternants a ON a.id = c.alternant_id WHERE c.id = ?`, Number(id));
    if (!c || c.decision !== 'rdv') fail(404, 'Demande introuvable.');
    return c;
  };
  /** L'organisme fixe le rendez-vous et prévient le recruteur et, s'il le souhaite, l'alternant. */
  api.post('/jobdating/demandes/:id/planifier', ag, wrap(async (req, res) => {
    const c = demande(req.params.id), b = req.body || {};
    const quand = str(b.rdv_le, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quand) || isNaN(Date.parse(quand))) fail(400, 'Date et heure du rendez-vous invalides.');
    const lieu = str(b.rdv_lieu, 300), note = str(b.rdv_note, 1000);
    if (!lieu) fail(400, 'Indiquez le lieu du rendez-vous (adresse, visioconférence ou téléphone).');
    run('UPDATE jd_consultations SET rdv_statut = \'planifie\', rdv_le = ?, rdv_lieu = ?, rdv_note = ?, traite_le = datetime(\'now\') WHERE id = ?', quand, lieu, note || null, c.id);
    const a = alternant(c.alternant_id), e = employeur(c.employeur_id), ev = evenement(a.evenement_id);
    const quandTxt = fdateHeure(quand), resultats = {};
    if (b.prevenir_employeur) {
      const t = `${P.get('raison_sociale')} : votre rendez-vous avec ${libelle(a)} (${a.prenom}, ${a.formation}) rencontré au job dating « ${ev.nom} » est fixé le ${quandTxt}. Lieu : ${lieu}.${note ? ` ${note}` : ''}`;
      resultats.employeur = await envoyer('mail', e, `Rendez-vous fixé — ${libelle(a)}`, t, { titre: 'Votre rendez-vous est fixé', bouton: 'Ouvrir l\'application', lien: lienRecruteur(e), masquer: e.token });
    }
    if (b.prevenir_alternant) {
      const t = `${P.get('raison_sociale')} : bonne nouvelle ${a.prenom} ! L'entreprise ${e.entreprise}${e.ville ? ` (${e.ville})` : ''}, rencontrée au job dating « ${ev.nom} », souhaite vous revoir. Rendez-vous le ${quandTxt}. Lieu : ${lieu}.${note ? ` ${note}` : ''} Contactez-nous en cas d'empêchement.`;
      resultats.alternant = {};
      for (const canal of (Array.isArray(b.canaux_alternant) && b.canaux_alternant.length ? b.canaux_alternant : ['mail', 'sms']).filter(x => ['mail', 'sms', 'whatsapp'].includes(x))) {
        resultats.alternant[canal] = await envoyer(canal, a, `Rendez-vous avec ${e.entreprise}`, t, { titre: 'Un recruteur souhaite vous revoir', lien: '' });
      }
    }
    res.json({ ok: true, resultats });
  }));
  api.post('/jobdating/demandes/:id/annuler', ag, wrap((req, res) => {
    const c = demande(req.params.id);
    run('UPDATE jd_consultations SET rdv_statut = \'annule\', rdv_note = ?, traite_le = datetime(\'now\') WHERE id = ?', str(req.body?.motif, 500) || null, c.id);
    res.json({ ok: true });
  }));
  api.post('/jobdating/demandes/:id/rouvrir', ag, wrap((req, res) => {
    const c = demande(req.params.id);
    run('UPDATE jd_consultations SET rdv_statut = \'demande\', rdv_le = NULL, rdv_lieu = NULL, rdv_note = NULL, traite_le = NULL WHERE id = ?', c.id);
    res.json({ ok: true });
  }));

  /* ---- Documents imprimables ---- */
  const page = (titre, corps, style = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title>
<link rel="stylesheet" href="/jobdating-print.css">${style ? `<style>${style}</style>` : ''}</head><body>${corps}</body></html>`;
  const barre = texte => `<div class="barre noprint"><span>${texte}</span><button type="button" class="bouton" data-imprimer>Imprimer</button></div><script src="/jobdating-print.js"></script>`;
  /** Badges des alternants (tous, ou un seul avec ?alternant=) : numéro et QR code, sans nom. */
  api.get('/jobdating/evenements/:id/badges', ag, wrap((req, res) => {
    const ev = evenement(req.params.id), seul = Number(req.query.alternant) || null;
    const L = all(`SELECT * FROM jd_alternants WHERE evenement_id = ? ${seul ? 'AND id = ?' : ''} ORDER BY numero`, ...[ev.id, seul].filter(Boolean));
    if (!L.length) fail(404, 'Aucun alternant inscrit à ce job dating.');
    const badges = L.map(a => `<div class="badge"><div class="b-haut"><img src="/img/logo-compact.png" alt=""><span>${esc(ev.nom)}</span></div>
      <div class="b-num">Candidat·e<b>n° ${a.numero}</b></div><div class="b-qr">${qr.svg(lienBadge(a), { titre: libelle(a) })}</div>
      <div class="b-bas">Recruteurs : scannez ce QR code avec l'application job dating pour voir mon profil et mon CV anonymes.</div></div>`).join('');
    const liste = seul ? '' : `<section class="liste"><h1>Remise des badges · ${esc(ev.nom)}</h1><p>Document réservé à l'organisme : ne pas afficher.</p>
      <table><thead><tr><th>N°</th><th>Alternant</th><th>Formation</th><th>Remis</th></tr></thead><tbody>${L.map(a => `<tr><td>${a.numero}</td><td>${esc(a.prenom)} ${esc(a.nom)}</td><td>${esc(a.formation)}</td><td class="case"></td></tr>`).join('')}</tbody></table></section>`;
    res.type('html').send(page(`Badges — ${ev.nom}`, `${barre(`${L.length} badge${L.length > 1 ? 's' : ''} à imprimer et découper${seul ? '' : ', puis la liste de remise'}.`)}<div class="badges">${badges}</div>${liste}`));
  }));
  /** Cartes d'accès des recruteurs : code et QR code du lien de connexion. */
  api.get('/jobdating/evenements/:id/cartes-recruteurs', ag, wrap((req, res) => {
    const ev = evenement(req.params.id), seul = Number(req.query.employeur) || null;
    const L = all(`SELECT * FROM jd_employeurs WHERE evenement_id = ? ${seul ? 'AND id = ?' : ''} ORDER BY entreprise`, ...[ev.id, seul].filter(Boolean));
    if (!L.length) fail(404, 'Aucun recruteur inscrit à ce job dating.');
    const cartes = L.map(e => `<div class="badge carte"><div class="b-haut"><img src="/img/logo-compact.png" alt=""><span>${esc(ev.nom)}</span></div>
      <div class="b-num">Accès recruteur<b class="ent">${esc(e.entreprise)}</b></div><div class="b-qr">${qr.svg(lienRecruteur(e), { titre: 'Accès recruteur' })}</div>
      <div class="b-bas">1. Scannez ce QR code avec votre téléphone.<br>2. Ou ouvrez <b>${esc(siteUrl().replace(/^https?:\/\//, ''))}/recruteur</b> et saisissez le code :<div class="code">${esc(e.code)}</div>Carte personnelle : ne la partagez pas.</div></div>`).join('');
    res.type('html').send(page(`Accès recruteurs — ${ev.nom}`, `${barre(`${L.length} carte${L.length > 1 ? 's' : ''} d'accès à remettre aux recruteurs.`)}<div class="badges">${cartes}</div>`));
  }));
}

/* ================= Pages hors API ================= */
function pages(app, dossierPublic) {
  // Application des recruteurs (page autonome, pensée pour le téléphone).
  app.get('/recruteur', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(dossierPublic, 'recruteur.html')); });
  // Lien du QR code d'un badge. Recruteur connecté à ce job dating : ouverture du profil dans l'application.
  // Sinon (l'alternant lui-même, ou un recruteur pas encore connecté) : le badge à présenter, sans aucune donnée personnelle.
  app.get('/jd/:token', (req, res) => {
    const a = one('SELECT a.*, e.nom AS ev_nom, e.date AS ev_date, e.lieu AS ev_lieu FROM jd_alternants a JOIN jd_evenements e ON e.id = a.evenement_id WHERE a.token = ?', str(req.params.token, 64));
    const r = recruteurDe(req);
    res.set('Cache-Control', 'no-store');
    if (a && r && r.evenement_id === a.evenement_id) return res.redirect(302, `/recruteur#p=${encodeURIComponent(a.token)}`);
    const corps = !a ? '<div class="carte-web"><h1>Badge introuvable</h1><p>Ce QR code ne correspond à aucun participant. Il a peut-être été supprimé après le job dating.</p></div>'
      : `<div class="carte-web"><div class="b-haut"><img src="/img/logo-compact.png" alt=""><span>${esc(a.ev_nom)}</span></div>
        <p class="petit">${esc(fdate(a.ev_date))}${a.ev_lieu ? ` · ${esc(a.ev_lieu)}` : ''}</p>
        <div class="b-num">Candidat·e<b>n° ${a.numero}</b></div><div class="b-qr">${qr.svg(lienBadge(a), { titre: libelle(a) })}</div>
        <p>Présentez ce QR code aux recruteurs. Ils voient votre profil et votre CV <b>sans votre nom ni vos coordonnées</b>. Si l'un d'eux veut vous revoir, l'organisme vous contacte.</p>
        <p class="petit">Vous êtes recruteur ? <a href="/recruteur?suite=${encodeURIComponent(a.token)}">Connectez-vous avec votre code d'accès</a> pour ouvrir ce profil.</p></div>`;
    res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#112233"><meta name="robots" content="noindex">
<title>Badge job dating</title><link rel="icon" type="image/png" href="/img/favicon.png"><link rel="stylesheet" href="/jobdating-print.css"></head><body class="web">${corps}</body></html>`);
  });
}

module.exports = { recruteur, agence, pages, vueAnonyme, NIVEAUX, CONTRATS, SECTEURS };
