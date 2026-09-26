'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { tx, one, all, run, DATA_DIR } = require('./db');
const { envoyer, canalConfigure } = require('./notify');
const dossier = require('./dossier');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

const PROD = process.env.NODE_ENV === 'production';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const COOKIE = 'chr_session';
const SESSION_DAYS = 7;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- Utilitaires ---------------- */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const str = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const CANAUX = ['whatsapp', 'sms', 'mail'];
// Motifs de recours au travail temporaire (article L1251-6 du Code du travail).
const MOTIFS = ['Accroissement temporaire d\'activité', 'Remplacement d\'un salarié absent', 'Emploi à caractère saisonnier', 'Emploi d\'usage constant (secteur HCR)'];
const CANAL_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS', mail: 'E-mail' };

function dureeHeures(debut, fin) {
  const [h1, m1] = debut.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (min <= 0) min += 24 * 60;
  return Math.round(min / 15) / 4;
}
function genPassword() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', D = '23456789', A = L + D;
  const b = crypto.randomBytes(10), p = (s, i) => s[b[i] % s.length];
  return p(L, 0).toUpperCase() + p(A, 1) + p(D, 2) + p(A, 3) + p(A, 4) + '-' + p(L, 5) + p(D, 6) + p(A, 7) + p(A, 8);
}
function slug(s) {
  const stop = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'l', 'd', 'a', 'et', 'cocktails', 'traiteur', 'sarl', 'sas']);
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .trim().split(/\s+/).filter(w => w && !stop.has(w)).slice(0, 2).join('.') || 'compte';
}
function uniqueUsername(base) {
  let u = base, n = 2;
  while (one('SELECT 1 FROM users WHERE username = ?', u)) u = base + n++;
  return u;
}
function pwProbleme(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Z]/.test(pw)) return 'Le mot de passe doit contenir au moins une majuscule.';
  if (!/[0-9]/.test(pw)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}
const nomInterim = i => `${i.prenom} ${i.nom}`;
const wrap = fn => (req, res, next) => { try { const r = fn(req, res); if (r && r.then) r.catch(next); } catch (e) { next(e); } };

/* ---------------- Sécurité ---------------- */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});
// Protection CSRF : toute écriture sur l'API doit porter l'en-tête X-CHR (impossible depuis un autre site).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-CHR') !== '1') return res.status(403).json({ error: 'Requête refusée.' });
  next();
});

function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5);
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)', token, userId, exp.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: PROD, expires: exp, path: '/' });
}

function auth(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });
  const u = one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token = ? AND s.expires_at > ? AND u.actif = 1`, token, new Date().toISOString());
  if (!u) return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  req.user = u; req.token = token;
  // Tant que le mot de passe provisoire n'est pas changé, seules ces routes sont ouvertes.
  if (u.must_change && !['/me', '/password', '/logout'].includes(req.originalUrl.split('?')[0].replace(/^\/api/, ''))) {
    return res.status(403).json({ error: 'must_change' });
  }
  next();
}
const role = (...profils) => (req, res, next) =>
  profils.includes(req.user.profil) ? next() : res.status(403).json({ error: 'Action réservée à l\'agence.' });

// Limite des tentatives de connexion : 10 par 15 minutes et par adresse IP.
const tentatives = new Map();
function limiteConnexion(req, res, next) {
  const k = req.ip, now = Date.now(), t = tentatives.get(k);
  if (t && t.reset > now && t.n >= 10) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  next();
}
function echecConnexion(ip) {
  const now = Date.now(), t = tentatives.get(ip);
  if (!t || t.reset < now) tentatives.set(ip, { n: 1, reset: now + 15 * 60e3 });
  else t.n++;
}

/* ---------------- Authentification ---------------- */
function meData(u) {
  const me = { id: u.id, username: u.username, nom: u.nom, profil: u.profil, must_change: !!u.must_change };
  if (u.client_id) me.client = one('SELECT id, nom, secteur, ville FROM clients WHERE id = ?', u.client_id);
  if (u.interim_id) me.interim = one('SELECT id, prenom, nom, poste, ville FROM interimaires WHERE id = ?', u.interim_id);
  return me;
}
app.post('/api/login', limiteConnexion, wrap((req, res) => {
  const username = str(req.body.username, 80).toLowerCase(), password = String(req.body.password || '');
  const u = one('SELECT * FROM users WHERE username = ?', username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    echecConnexion(req.ip);
    fail(401, 'Identifiant ou mot de passe incorrect.');
  }
  if (!u.actif) fail(403, 'Ce compte est désactivé. Contactez votre agence.');
  run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
  setSession(res, u.id);
  run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', u.id);
  res.json(meData(u));
}));
app.post('/api/logout', auth, (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', req.token);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json(meData(req.user)));
app.post('/api/password', auth, wrap((req, res) => {
  const { actuel, nouveau } = req.body;
  if (!bcrypt.compareSync(String(actuel || ''), req.user.password_hash)) fail(400, 'Le mot de passe actuel est incorrect.');
  const pb = pwProbleme(nouveau); if (pb) fail(400, pb);
  if (nouveau === actuel) fail(400, 'Choisissez un mot de passe différent du mot de passe provisoire.');
  run('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', bcrypt.hashSync(nouveau, 10), req.user.id);
  // Déconnecte les autres sessions.
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, req.token);
  res.json(meData(one('SELECT * FROM users WHERE id = ?', req.user.id)));
}));

const api = express.Router();
api.use(auth);
dossier(api, { fail: (...a) => fail(...a), str: (...a) => str(...a), isDate: (...a) => isDate(...a), today: () => today(), wrap: fn => wrap(fn), role: (...a) => role(...a), HttpError });

/* ---------------- Clients ---------------- */
const CLIENT_FIELDS = ['nom', 'siret', 'secteur', 'adresse', 'ville', 'contact', 'email', 'telephone', 'convention'];
function clientBody(b) {
  const c = {};
  for (const f of CLIENT_FIELDS) if (b[f] !== undefined) c[f] = str(b[f]);
  if (b.coefficient !== undefined) { c.coefficient = Number(b.coefficient); if (!(c.coefficient >= 1 && c.coefficient <= 5)) fail(400, 'Coefficient invalide (entre 1 et 5).'); }
  if (b.delai_paiement !== undefined) { c.delai_paiement = parseInt(b.delai_paiement, 10); if (!(c.delai_paiement >= 0 && c.delai_paiement <= 90)) fail(400, 'Délai de paiement invalide.'); }
  return c;
}
api.get('/clients', (req, res) => {
  if (req.user.profil === 'interim') return res.status(403).json({ error: 'Accès refusé.' });
  const where = req.user.profil === 'client' ? 'WHERE c.id = ' + Number(req.user.client_id) : '';
  res.json(all(`SELECT c.*,
     (SELECT COUNT(*) FROM missions m WHERE m.client_id = c.id) AS nb_missions,
     (SELECT COUNT(*) FROM missions m WHERE m.client_id = c.id AND m.statut = 'verrouillee') AS nb_pourvues,
     (SELECT ROUND(AVG(e.note),1) FROM evaluations e JOIN heures h ON h.id = e.heure_id JOIN missions m ON m.id = h.mission_id
        WHERE m.client_id = c.id AND e.sens = 'interim_vers_client') AS note,
     (SELECT username FROM users u WHERE u.client_id = c.id LIMIT 1) AS acces
     FROM clients c ${where} ORDER BY c.nom`));
});
api.post('/clients', role('agence'), wrap((req, res) => {
  const c = clientBody(req.body);
  if (!c.nom) fail(400, 'La raison sociale est obligatoire.');
  const keys = Object.keys(c);
  const r = run(`INSERT INTO clients (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => c[k]));
  res.status(201).json(one('SELECT * FROM clients WHERE id = ?', r.lastInsertRowid));
}));
api.put('/clients/:id', role('agence'), wrap((req, res) => {
  const c = clientBody(req.body), keys = Object.keys(c);
  if (!one('SELECT 1 FROM clients WHERE id = ?', req.params.id)) fail(404, 'Client introuvable.');
  if (keys.length) run(`UPDATE clients SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => c[k]), req.params.id);
  res.json(one('SELECT * FROM clients WHERE id = ?', req.params.id));
}));

/* ---------------- Intérimaires ---------------- */
const INTERIM_FIELDS = ['prenom', 'nom', 'poste', 'secteur', 'telephone', 'email', 'ville', 'competences', 'experience'];
function interimBody(b) {
  const c = {};
  for (const f of INTERIM_FIELDS) if (b[f] !== undefined) c[f] = str(b[f], f === 'competences' || f === 'experience' ? 1000 : 200);
  if (b.taux_horaire !== undefined) { c.taux_horaire = Number(b.taux_horaire); if (!(c.taux_horaire >= 10 && c.taux_horaire <= 60)) fail(400, 'Taux horaire invalide.'); }
  if (b.date_naissance !== undefined) { if (b.date_naissance && !isDate(b.date_naissance)) fail(400, 'Date de naissance invalide.'); c.date_naissance = b.date_naissance || null; }
  if (b.nationalite !== undefined) { if (!dossier.NATIONALITES.includes(b.nationalite)) fail(400, 'Nationalité invalide.'); c.nationalite = b.nationalite; }
  return c;
}
const INTERIM_SQL = `SELECT i.*,
  (SELECT ROUND(AVG(e.note),1) FROM evaluations e JOIN heures h ON h.id = e.heure_id WHERE h.interim_id = i.id AND e.sens = 'client_vers_interim') AS note,
  (SELECT COUNT(*) FROM reponses r WHERE r.interim_id = i.id AND r.etat = 'retenu') AS nb_missions,
  (SELECT username FROM users u WHERE u.interim_id = i.id LIMIT 1) AS acces
  FROM interimaires i`;
api.get('/interimaires', (req, res) => {
  const p = req.user.profil;
  if (p === 'agence') return res.json(all(INTERIM_SQL + ' ORDER BY i.nom, i.prenom'));
  if (p === 'interim') return res.json(all(INTERIM_SQL + ' WHERE i.id = ?', req.user.interim_id));
  // Employeur : intérimaires venus chez lui, candidats à ses missions, et nouveaux inscrits de son secteur.
  const cid = req.user.client_id, secteur = one('SELECT secteur FROM clients WHERE id = ?', cid).secteur;
  const rows = all(`${INTERIM_SQL} WHERE i.id IN (SELECT r.interim_id FROM reponses r JOIN missions m ON m.id = r.mission_id WHERE m.client_id = ? AND r.etat != 'decline')
     OR (i.secteur = ? AND i.created_at >= datetime('now','-30 days')) ORDER BY i.nom`, cid, secteur);
  const venus = new Set(all(`SELECT r.interim_id FROM reponses r JOIN missions m ON m.id = r.mission_id
     WHERE m.client_id = ? AND r.etat = 'retenu' AND m.statut = 'verrouillee'`, cid).map(r => r.interim_id));
  const cand = new Set(all(`SELECT r.interim_id FROM reponses r JOIN missions m ON m.id = r.mission_id
     WHERE m.client_id = ? AND r.etat = 'accepte'`, cid).map(r => r.interim_id));
  const notes = Object.fromEntries(all('SELECT interim_id, texte FROM notes_privees WHERE client_id = ?', cid).map(n => [n.interim_id, n.texte]));
  res.json(rows.map(r => ({
    id: r.id, prenom: r.prenom, nom: r.nom, poste: r.poste, secteur: r.secteur, competences: r.competences, experience: r.experience, note: r.note,
    nb_chez_vous: one(`SELECT COUNT(*) n FROM reponses r JOIN missions m ON m.id = r.mission_id WHERE r.interim_id = ? AND m.client_id = ? AND r.etat = 'retenu' AND m.statut = 'verrouillee'`, r.id, cid).n,
    categorie: venus.has(r.id) ? 'deja' : cand.has(r.id) ? 'voir' : 'nouveau',
    note_privee: notes[r.id] || '',
  })));
});
api.post('/interimaires', role('agence'), wrap((req, res) => {
  const c = interimBody(req.body);
  if (!c.prenom || !c.nom || !c.poste) fail(400, 'Prénom, nom et poste sont obligatoires.');
  const keys = Object.keys(c);
  const r = run(`INSERT INTO interimaires (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => c[k]));
  res.status(201).json(one('SELECT * FROM interimaires WHERE id = ?', r.lastInsertRowid));
}));
api.put('/interimaires/:id', role('agence'), wrap((req, res) => {
  const c = interimBody(req.body), keys = Object.keys(c);
  if (!one('SELECT 1 FROM interimaires WHERE id = ?', req.params.id)) fail(404, 'Intérimaire introuvable.');
  if (keys.length) run(`UPDATE interimaires SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => c[k]), req.params.id);
  res.json(one('SELECT * FROM interimaires WHERE id = ?', req.params.id));
}));
api.put('/notes-privees/:interimId', role('client'), wrap((req, res) => {
  run(`INSERT INTO notes_privees (client_id, interim_id, texte) VALUES (?,?,?)
       ON CONFLICT(client_id, interim_id) DO UPDATE SET texte = excluded.texte`, req.user.client_id, Number(req.params.interimId), str(req.body.texte, 2000));
  res.json({ ok: true });
}));

/* ---------------- Accès utilisateurs (agence) ---------------- */
api.get('/acces', role('agence'), (req, res) => {
  res.json(all(`SELECT u.id, u.username, u.nom, u.profil, u.must_change, u.actif, u.last_login, u.client_id, u.interim_id,
     c.nom AS client_nom, i.poste AS interim_poste FROM users u
     LEFT JOIN clients c ON c.id = u.client_id LEFT JOIN interimaires i ON i.id = u.interim_id ORDER BY u.profil, u.username`));
});
api.post('/acces', role('agence'), wrap((req, res) => {
  const { type } = req.body, id = Number(req.body.id);
  const password = genPassword();
  let user;
  if (type === 'client') {
    const c = one('SELECT * FROM clients WHERE id = ?', id); if (!c) fail(404, 'Client introuvable.');
    if (one('SELECT 1 FROM users WHERE client_id = ?', id)) fail(409, 'Ce client a déjà un accès.');
    user = { username: uniqueUsername(slug(c.nom)), profil: 'client', nom: c.contact || c.nom, client_id: id, interim_id: null };
  } else if (type === 'interim') {
    const i = one('SELECT * FROM interimaires WHERE id = ?', id); if (!i) fail(404, 'Intérimaire introuvable.');
    if (one('SELECT 1 FROM users WHERE interim_id = ?', id)) fail(409, 'Cet intérimaire a déjà un accès.');
    user = { username: uniqueUsername(slug(nomInterim(i))), profil: 'interim', nom: nomInterim(i), client_id: null, interim_id: id };
  } else if (type === 'agence') {
    const nom = str(req.body.nom, 80); if (!nom) fail(400, 'Indiquez le nom du collaborateur.');
    user = { username: uniqueUsername(slug(nom)), profil: 'agence', nom, client_id: null, interim_id: null };
  } else fail(400, 'Type d\'accès invalide.');
  run('INSERT INTO users (username, password_hash, profil, nom, client_id, interim_id, must_change) VALUES (?,?,?,?,?,?,1)',
    user.username, bcrypt.hashSync(password, 10), user.profil, user.nom, user.client_id, user.interim_id);
  // Le mot de passe provisoire n'est renvoyé qu'une seule fois, jamais stocké en clair.
  res.status(201).json({ username: user.username, password, profil: user.profil, nom: user.nom });
}));
api.post('/acces/:id/reset', role('agence'), wrap((req, res) => {
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id); if (!u) fail(404, 'Compte introuvable.');
  if (u.id === req.user.id) fail(400, 'Utilisez « Changer mon mot de passe » pour votre propre compte.');
  const password = genPassword();
  run('UPDATE users SET password_hash = ?, must_change = 1, actif = 1 WHERE id = ?', bcrypt.hashSync(password, 10), u.id);
  run('DELETE FROM sessions WHERE user_id = ?', u.id);
  res.json({ username: u.username, password, profil: u.profil, nom: u.nom });
}));
api.post('/acces/:id/toggle', role('agence'), wrap((req, res) => {
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id); if (!u) fail(404, 'Compte introuvable.');
  if (u.id === req.user.id) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  run('UPDATE users SET actif = ? WHERE id = ?', u.actif ? 0 : 1, u.id);
  if (u.actif) run('DELETE FROM sessions WHERE user_id = ?', u.id);
  res.json({ actif: !u.actif });
}));

/* ---------------- Missions ---------------- */
function missionRow(id) { return one('SELECT m.*, c.nom AS client_nom, c.secteur AS client_secteur FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.id = ?', id); }
function missionPourAgence(m) {
  const env = all(`SELECT e.interim_id, e.canaux, i.prenom, i.nom, i.poste, r.etat FROM envois e JOIN interimaires i ON i.id = e.interim_id
     LEFT JOIN reponses r ON r.mission_id = e.mission_id AND r.interim_id = e.interim_id WHERE e.mission_id = ? ORDER BY e.id`, m.id);
  return { ...m, envois: env.map(e => ({ interim_id: e.interim_id, nom: `${e.prenom} ${e.nom}`, poste: e.poste, canaux: e.canaux.split(','), etat: e.etat || null })), ...compteurs(m.id), documents: docsMission(m) };
}
function compteurs(mid) {
  const c = one(`SELECT SUM(etat IN ('accepte','retenu')) AS actifs, SUM(etat = 'retenu') AS retenus FROM reponses WHERE mission_id = ?`, mid);
  return { actifs: c.actifs || 0, retenus: c.retenus || 0 };
}
function docsMission(m) {
  if (m.statut !== 'verrouillee') return [];
  return [{ id: null, nom: 'Contrat de mission', categorie: 'Contrat' }, ...all('SELECT id, nom, categorie FROM documents WHERE client_id = ? ORDER BY id', m.client_id)];
}
/** Vue intérimaire : l'état reste « en attente de confirmation » tant que la mission n'est pas verrouillée. */
function missionPourInterim(m, iid) {
  const r = one('SELECT etat FROM reponses WHERE mission_id = ? AND interim_id = ?', m.id, iid);
  const { actifs } = compteurs(m.id);
  let etat;
  if (m.statut === 'annulee') etat = 'annulee';
  else if (m.statut === 'verrouillee') etat = r && r.etat === 'retenu' ? 'confirmee' : r && r.etat !== 'decline' ? 'non_retenu' : 'pourvue';
  else if (r) etat = r.etat === 'decline' ? 'decline' : 'en_attente';
  else etat = actifs >= m.nb_postes ? 'complet' : 'a_repondre';
  return {
    id: m.id, client_nom: m.client_nom, client_secteur: m.client_secteur, poste: m.poste, date: m.date, debut: m.debut, fin: m.fin,
    nb_postes: m.nb_postes, taux_horaire: m.taux_horaire, etat,
    documents: etat === 'confirmee' ? docsMission(m).map(d => d.id === null ? { ...d, contrat_id: one('SELECT id FROM contrats WHERE mission_id = ? AND interim_id = ?', m.id, iid)?.id } : d) : [],
  };
}
api.get('/missions', (req, res) => {
  const p = req.user.profil;
  if (p === 'agence') {
    return res.json(all('SELECT m.*, c.nom AS client_nom, c.secteur AS client_secteur FROM missions m JOIN clients c ON c.id = m.client_id ORDER BY m.date, m.debut').map(missionPourAgence));
  }
  if (p === 'client') {
    const ms = all('SELECT m.*, c.nom AS client_nom FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.client_id = ? ORDER BY m.date, m.debut', req.user.client_id);
    return res.json(ms.map(m => ({
      ...m, ...compteurs(m.id), documents: docsMission(m),
      candidats: all(`SELECT r.interim_id, r.etat, i.prenom, i.nom, i.poste, i.competences,
        (SELECT ROUND(AVG(e.note),1) FROM evaluations e JOIN heures h ON h.id = e.heure_id WHERE h.interim_id = i.id AND e.sens = 'client_vers_interim') AS note
        FROM reponses r JOIN interimaires i ON i.id = r.interim_id WHERE r.mission_id = ? AND r.etat != 'decline' ORDER BY r.id`, m.id),
    })));
  }
  const ms = all(`SELECT m.*, c.nom AS client_nom, c.secteur AS client_secteur FROM missions m JOIN clients c ON c.id = m.client_id
     JOIN envois e ON e.mission_id = m.id WHERE e.interim_id = ? ORDER BY m.date, m.debut`, req.user.interim_id);
  res.json(ms.map(m => missionPourInterim(m, req.user.interim_id)));
});
api.post('/missions', role('agence', 'client'), wrap((req, res) => {
  const b = req.body;
  const client_id = req.user.profil === 'client' ? req.user.client_id : Number(b.client_id);
  if (!one('SELECT 1 FROM clients WHERE id = ?', client_id)) fail(400, 'Client introuvable.');
  const poste = str(b.poste, 80); if (!poste) fail(400, 'Indiquez le poste.');
  if (!isDate(b.date)) fail(400, 'Date invalide.');
  if (b.date < today()) fail(400, 'La date est déjà passée.');
  if (!isTime(b.debut) || !isTime(b.fin)) fail(400, 'Horaires invalides (format HH:MM).');
  const nb = parseInt(b.nb_postes, 10); if (!(nb >= 1 && nb <= 30)) fail(400, 'Nombre de postes invalide.');
  const motif = MOTIFS.includes(b.motif) ? b.motif : MOTIFS[0];
  const taux = req.user.profil === 'agence' && b.taux_horaire ? Number(b.taux_horaire) : 12.0;
  if (!(taux >= 10 && taux <= 60)) fail(400, 'Taux horaire invalide.');
  const r = run('INSERT INTO missions (client_id, poste, date, debut, fin, nb_postes, taux_horaire, commentaire, motif, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
    client_id, poste, b.date, b.debut, b.fin, nb, taux, str(b.commentaire, 500), motif, req.user.id);
  res.status(201).json(missionRow(r.lastInsertRowid));
}));

/** Diffusion par l'agence : choix des intérimaires et des canaux. */
api.post('/missions/:id/diffuser', role('agence'), wrap((req, res) => {
  const m = missionRow(req.params.id); if (!m) fail(404, 'Mission introuvable.');
  if (m.statut === 'verrouillee' || m.statut === 'annulee') fail(409, 'Cette mission est clôturée.');
  const ids = [...new Set((req.body.interims || []).map(Number))].filter(Boolean);
  const canaux = (req.body.canaux || []).filter(c => CANAUX.includes(c));
  if (!ids.length) fail(400, 'Choisissez au moins un intérimaire.');
  if (!canaux.length) fail(400, 'Choisissez au moins un moyen d\'envoi.');
  if (req.body.taux_horaire !== undefined) {
    const t = Number(req.body.taux_horaire); if (!(t >= 10 && t <= 60)) fail(400, 'Taux horaire invalide.');
    run('UPDATE missions SET taux_horaire = ? WHERE id = ?', t, m.id); m.taux_horaire = t;
  }
  const dest = [];
  tx(() => {
    for (const iid of ids) {
      const i = one('SELECT * FROM interimaires WHERE id = ?', iid); if (!i) continue;
      const r = run('INSERT OR IGNORE INTO envois (mission_id, interim_id, canaux) VALUES (?,?,?)', m.id, iid, canaux.join(','));
      if (!r.changes) continue;
      run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', iid, m.id, `Nouvelle mission : ${m.poste} chez ${m.client_nom}`);
      dest.push(i);
    }
    run('UPDATE missions SET statut = \'diffusee\' WHERE id = ?', m.id);
  });
  const d = new Date(m.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const texte = `CHR Intérim : nouvelle mission ${m.poste} chez ${m.client_nom}, ${d}, ${m.debut}–${m.fin}, ${m.taux_horaire.toFixed(2).replace('.', ',')} €/h. Connectez-vous pour accepter : ${APP_URL}`;
  for (const i of dest) for (const c of canaux) envoyer(c, i, 'Nouvelle mission CHR Intérim', texte);
  res.json({ envoyes: dest.length, canaux, simules: canaux.filter(c => !canalConfigure(c)).map(c => CANAL_LABEL[c]) });
}));

/** Réponse de l'intérimaire. Le verrou de places est vérifié dans une transaction. */
api.post('/missions/:id/repondre', role('interim'), wrap((req, res) => {
  const iid = req.user.interim_id, accepte = !!req.body.accepte;
  tx(() => {
    const m = missionRow(req.params.id);
    if (!m || !one('SELECT 1 FROM envois WHERE mission_id = ? AND interim_id = ?', m.id, iid)) fail(404, 'Mission introuvable.');
    if (m.statut !== 'diffusee') fail(409, 'Cette mission n\'est plus ouverte.');
    if (one('SELECT 1 FROM reponses WHERE mission_id = ? AND interim_id = ?', m.id, iid)) fail(409, 'Vous avez déjà répondu à cette mission.');
    if (accepte && compteurs(m.id).actifs >= m.nb_postes) fail(409, 'Mission complète : toutes les places sont prises.');
    run('INSERT INTO reponses (mission_id, interim_id, etat) VALUES (?,?,?)', m.id, iid, accepte ? 'accepte' : 'decline');
    run('UPDATE notifications SET lu = 1 WHERE mission_id = ? AND interim_id = ?', m.id, iid);
    if (accepte) run('INSERT INTO notifications (client_id, mission_id, message) VALUES (?,?,?)', m.client_id, m.id, `Un intérimaire a accepté la mission ${m.poste} du ${m.date}. Confirmez ou refusez.`);
  });
  res.json(missionPourInterim(missionRow(req.params.id), iid));
}));

/** Décision de l'employeur (ou de l'agence) sur un intérimaire qui a accepté. */
api.post('/missions/:id/decision', role('agence', 'client'), wrap((req, res) => {
  const iid = Number(req.body.interim_id), accepte = !!req.body.accepte;
  let verrouillee = false, m;
  tx(() => {
    m = missionRow(req.params.id);
    if (!m || (req.user.profil === 'client' && m.client_id !== req.user.client_id)) fail(404, 'Mission introuvable.');
    if (m.statut !== 'diffusee') fail(409, 'Cette mission n\'est plus modifiable.');
    const r = one('SELECT * FROM reponses WHERE mission_id = ? AND interim_id = ?', m.id, iid);
    if (!r || r.etat !== 'accepte') fail(409, 'Cet intérimaire n\'est pas en attente de décision.');
    run('UPDATE reponses SET etat = ?, updated_at = datetime(\'now\') WHERE id = ?', accepte ? 'retenu' : 'refuse_client', r.id);
    if (accepte && compteurs(m.id).retenus >= m.nb_postes) {
      verrouillee = true;
      run('UPDATE missions SET statut = \'verrouillee\', verrouillee_at = datetime(\'now\') WHERE id = ?', m.id);
      run('UPDATE reponses SET etat = \'non_retenu\' WHERE mission_id = ? AND etat = \'accepte\'', m.id);
      const h = dureeHeures(m.debut, m.fin);
      for (const x of all('SELECT interim_id FROM reponses WHERE mission_id = ? AND etat = \'retenu\'', m.id)) {
        run('INSERT OR IGNORE INTO heures (mission_id, interim_id, heures_prevues) VALUES (?,?,?)', m.id, x.interim_id, h);
        run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', x.interim_id, m.id, `Mission confirmée : ${m.poste} chez ${m.client_nom}. Votre contrat est à signer.`);
      }
      dossier.surVerrouillage(m, all('SELECT interim_id FROM reponses WHERE mission_id = ? AND etat = \'retenu\'', m.id).map(x => x.interim_id), today().slice(0, 4));
      for (const x of all('SELECT interim_id FROM reponses WHERE mission_id = ? AND etat IN (\'non_retenu\',\'refuse_client\')', m.id)) {
        run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', x.interim_id, m.id, `La mission ${m.poste} chez ${m.client_nom} est pourvue.`);
      }
    }
  });
  if (verrouillee) {
    // Envoi de la confirmation et de la liste des documents, sur les canaux utilisés pour la proposition.
    const docs = docsMission(missionRow(m.id)).map(d => d.nom).join(', ');
    for (const x of all(`SELECT i.*, e.canaux FROM reponses r JOIN interimaires i ON i.id = r.interim_id JOIN envois e ON e.mission_id = r.mission_id AND e.interim_id = r.interim_id
                         WHERE r.mission_id = ? AND r.etat = 'retenu'`, m.id)) {
      const texte = `CHR Intérim : votre mission ${m.poste} chez ${m.client_nom} le ${m.date} (${m.debut}–${m.fin}) est confirmée. Documents à consulter dans votre espace : ${docs}. ${APP_URL}`;
      for (const c of x.canaux.split(',')) envoyer(c, x, 'Mission confirmée — CHR Intérim', texte);
    }
  }
  res.json({ verrouillee });
}));
api.post('/missions/:id/annuler', role('agence'), wrap((req, res) => {
  const m = missionRow(req.params.id); if (!m) fail(404, 'Mission introuvable.');
  tx(() => { run('UPDATE missions SET statut = \'annulee\' WHERE id = ?', m.id); dossier.surAnnulation(m.id); });
  res.json({ ok: true });
}));

/* ---------------- Notifications ---------------- */
api.get('/notifications', (req, res) => {
  const p = req.user.profil;
  if (p === 'interim') return res.json(all('SELECT * FROM notifications WHERE interim_id = ? AND lu = 0 ORDER BY id DESC', req.user.interim_id));
  if (p === 'client') return res.json(all('SELECT * FROM notifications WHERE client_id = ? AND lu = 0 ORDER BY id DESC', req.user.client_id));
  res.json([]);
});
api.post('/notifications/lu', (req, res) => {
  if (req.user.profil === 'interim') run('UPDATE notifications SET lu = 1 WHERE interim_id = ? AND message NOT LIKE \'Nouvelle mission%\'', req.user.interim_id);
  if (req.user.profil === 'client') run('UPDATE notifications SET lu = 1 WHERE client_id = ?', req.user.client_id);
  res.json({ ok: true });
});

/* ---------------- Planning ---------------- */
api.get('/planning', role('agence'), wrap((req, res) => {
  const debut = isDate(req.query.debut) ? req.query.debut : today();
  const jours = [...Array(7)].map((_, k) => { const d = new Date(debut + 'T12:00'); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); });
  const fin = jours[6];
  const pris = all(`SELECT r.interim_id, m.date, c.nom AS client FROM reponses r JOIN missions m ON m.id = r.mission_id JOIN clients c ON c.id = m.client_id
     WHERE r.etat = 'retenu' AND m.statut = 'verrouillee' AND m.date BETWEEN ? AND ?`, debut, fin);
  const attente = all(`SELECT e.interim_id, m.date, c.nom AS client FROM envois e JOIN missions m ON m.id = e.mission_id JOIN clients c ON c.id = m.client_id
     LEFT JOIN reponses r ON r.mission_id = e.mission_id AND r.interim_id = e.interim_id
     WHERE m.statut = 'diffusee' AND m.date BETWEEN ? AND ? AND (r.etat IS NULL OR r.etat IN ('accepte','refuse_client'))`, debut, fin);
  const dispo = all('SELECT * FROM disponibilites WHERE date BETWEEN ? AND ?', debut, fin);
  const interims = all('SELECT id, prenom, nom, poste, secteur FROM interimaires ORDER BY nom');
  const key = (a, b) => a + '|' + b, P = {}, A = {}, Dp = {};
  pris.forEach(x => P[key(x.interim_id, x.date)] = x.client);
  attente.forEach(x => A[key(x.interim_id, x.date)] = x.client);
  dispo.forEach(x => Dp[key(x.interim_id, x.date)] = x.etat);
  res.json({ jours, lignes: interims.map(i => ({
    ...i, cases: jours.map(j => {
      const k = key(i.id, j);
      if (P[k]) return { statut: 'pris', client: P[k] };
      if (A[k]) return { statut: 'attente', client: A[k] };
      if (Dp[k] === 'indisponible') return { statut: 'off' };
      if (Dp[k] === 'disponible') return { statut: 'libre' };
      return { statut: 'inconnu' };
    }),
  })) });
}));
api.get('/planning/jour', role('client', 'agence'), wrap((req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const cid = req.user.profil === 'client' ? req.user.client_id : Number(req.query.client_id);
  res.json(all(`SELECT m.id, m.poste, m.debut, m.fin, i.prenom, i.nom FROM missions m JOIN reponses r ON r.mission_id = m.id AND r.etat = 'retenu'
     JOIN interimaires i ON i.id = r.interim_id WHERE m.client_id = ? AND m.date = ? AND m.statut = 'verrouillee' ORDER BY m.debut`, cid, date));
}));

/* ---------------- Disponibilités ---------------- */
api.get('/disponibilites', role('interim', 'agence'), (req, res) => {
  const iid = req.user.profil === 'interim' ? req.user.interim_id : Number(req.query.interim_id);
  res.json(all('SELECT date, etat FROM disponibilites WHERE interim_id = ? ORDER BY date', iid));
});
api.put('/disponibilites', role('interim', 'agence'), wrap((req, res) => {
  const iid = req.user.profil === 'interim' ? req.user.interim_id : Number(req.body.interim_id);
  if (!isDate(req.body.date)) fail(400, 'Date invalide.');
  const etat = req.body.etat;
  if (etat === null || etat === '') run('DELETE FROM disponibilites WHERE interim_id = ? AND date = ?', iid, req.body.date);
  else if (['disponible', 'indisponible'].includes(etat)) {
    run(`INSERT INTO disponibilites (interim_id, date, etat) VALUES (?,?,?) ON CONFLICT(interim_id, date) DO UPDATE SET etat = excluded.etat`, iid, req.body.date, etat);
  } else fail(400, 'État invalide.');
  res.json({ ok: true });
}));

/* ---------------- Heures et évaluations ---------------- */
const HEURES_SQL = `SELECT h.*, m.date, m.debut, m.fin, m.poste, m.taux_horaire, m.client_id, c.nom AS client_nom, c.secteur AS client_secteur,
  i.prenom, i.nom AS interim_nom,
  (SELECT note FROM evaluations e WHERE e.heure_id = h.id AND e.sens = 'client_vers_interim') AS note_client,
  (SELECT note FROM evaluations e WHERE e.heure_id = h.id AND e.sens = 'interim_vers_client') AS note_interim
  FROM heures h JOIN missions m ON m.id = h.mission_id JOIN clients c ON c.id = m.client_id JOIN interimaires i ON i.id = h.interim_id`;
api.get('/heures', (req, res) => {
  const p = req.user.profil;
  const rows = p === 'agence' ? all(HEURES_SQL + ' ORDER BY m.date DESC')
    : p === 'client' ? all(HEURES_SQL + ' WHERE m.client_id = ? ORDER BY m.date DESC', req.user.client_id)
      : all(HEURES_SQL + ' WHERE h.interim_id = ? ORDER BY m.date DESC', req.user.interim_id);
  res.json(rows.map(r => ({ ...r, ouvert: r.date <= today() })));
});
function heurePour(req) {
  const h = one(HEURES_SQL + ' WHERE h.id = ?', req.params.id);
  if (!h) fail(404, 'Relevé introuvable.');
  if (req.user.profil === 'interim' && h.interim_id !== req.user.interim_id) fail(404, 'Relevé introuvable.');
  if (req.user.profil === 'client' && h.client_id !== req.user.client_id) fail(404, 'Relevé introuvable.');
  return h;
}
api.post('/heures/:id/confirmer', role('interim', 'agence'), wrap((req, res) => {
  const h = heurePour(req);
  if (h.date > today()) fail(409, 'Vous pourrez confirmer vos heures après la mission.');
  if (h.valide_interim && req.user.profil !== 'agence') fail(409, 'Heures déjà confirmées.');
  const extra = Math.max(0, Math.round(Number(req.body.extra || 0) * 4) / 4);
  if (extra > 8) fail(400, 'Nombre d\'heures supplémentaires invalide.');
  const justif = str(req.body.justification, 500);
  if (extra > 0 && !justif) fail(400, 'Une justification est obligatoire pour les heures supplémentaires.');
  run('UPDATE heures SET valide_interim = 1, extra = ?, justification = ?, extra_statut = ? WHERE id = ?', extra, justif || null, extra > 0 ? 'attente' : 'aucun', h.id);
  res.json(one(HEURES_SQL + ' WHERE h.id = ?', h.id));
}));
api.post('/heures/:id/valider', role('client', 'agence'), wrap((req, res) => {
  const h = heurePour(req);
  if (h.date > today()) fail(409, 'Les heures se valident après la mission.');
  let st = h.extra_statut;
  if (st === 'attente') {
    if (req.body.extra_accepte === undefined) fail(400, 'Acceptez ou refusez les heures supplémentaires déclarées.');
    st = req.body.extra_accepte ? 'accepte' : 'refuse';
  }
  run('UPDATE heures SET valide_client = 1, extra_statut = ? WHERE id = ?', st, h.id);
  res.json(one(HEURES_SQL + ' WHERE h.id = ?', h.id));
}));
api.put('/heures/:id', role('agence'), wrap((req, res) => {
  const h = heurePour(req), p = Number(req.body.heures_prevues);
  if (!(p > 0 && p <= 16)) fail(400, 'Nombre d\'heures invalide.');
  run('UPDATE heures SET heures_prevues = ? WHERE id = ?', p, h.id);
  res.json(one(HEURES_SQL + ' WHERE h.id = ?', h.id));
}));
api.post('/heures/:id/evaluer', role('client', 'interim'), wrap((req, res) => {
  const h = heurePour(req);
  if (h.date > today()) fail(409, 'La note se donne en fin de service.');
  const note = parseInt(req.body.note, 10); if (!(note >= 1 && note <= 5)) fail(400, 'La note doit être comprise entre 1 et 5.');
  const sens = req.user.profil === 'client' ? 'client_vers_interim' : 'interim_vers_client';
  run(`INSERT INTO evaluations (heure_id, sens, note, commentaire, axe) VALUES (?,?,?,?,?)
       ON CONFLICT(heure_id, sens) DO UPDATE SET note = excluded.note, commentaire = excluded.commentaire, axe = excluded.axe`,
  h.id, sens, note, str(req.body.commentaire, 1000) || null, str(req.body.axe, 200) || null);
  res.json({ ok: true });
}));
api.get('/evaluations', (req, res) => {
  const base = `SELECT e.*, m.date, c.nom AS client_nom, c.secteur AS client_secteur, i.prenom, i.nom AS interim_nom FROM evaluations e
    JOIN heures h ON h.id = e.heure_id JOIN missions m ON m.id = h.mission_id JOIN clients c ON c.id = m.client_id JOIN interimaires i ON i.id = h.interim_id`;
  const p = req.user.profil;
  if (p === 'agence') return res.json(all(base + ' ORDER BY e.created_at DESC'));
  if (p === 'client') return res.json(all(base + ' WHERE m.client_id = ? AND e.sens = \'client_vers_interim\' ORDER BY e.created_at DESC', req.user.client_id));
  // Intérimaire : avis reçus anonymisés (secteur seulement) et avis donnés.
  res.json(all(base + ' WHERE h.interim_id = ? ORDER BY e.created_at DESC', req.user.interim_id).map(e => e.sens === 'client_vers_interim'
    ? { sens: e.sens, note: e.note, commentaire: e.commentaire, axe: e.axe, date: e.date, client_secteur: e.client_secteur }
    : { sens: e.sens, note: e.note, commentaire: e.commentaire, date: e.date, client_nom: e.client_nom }));
});

/* ---------------- Documents ---------------- */
const TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx' };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (TYPES[f.mimetype] || '')) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(TYPES[f.mimetype] ? null : new HttpError(400, 'Format refusé : PDF, image ou Word uniquement.'), !!TYPES[f.mimetype]),
});
function docsVisibles(req, clientId) {
  const p = req.user.profil;
  if (p === 'agence') return clientId ? all('SELECT d.*, c.nom AS client_nom FROM documents d JOIN clients c ON c.id = d.client_id WHERE d.client_id = ? ORDER BY d.id DESC', clientId)
    : all('SELECT d.*, c.nom AS client_nom FROM documents d JOIN clients c ON c.id = d.client_id ORDER BY d.id DESC');
  if (p === 'client') return all('SELECT * FROM documents WHERE client_id = ? ORDER BY id DESC', req.user.client_id);
  return all(`SELECT d.*, c.nom AS client_nom FROM documents d JOIN clients c ON c.id = d.client_id WHERE d.client_id IN
     (SELECT m.client_id FROM missions m JOIN reponses r ON r.mission_id = m.id WHERE r.interim_id = ? AND r.etat = 'retenu' AND m.statut = 'verrouillee') ORDER BY d.id DESC`, req.user.interim_id);
}
api.get('/documents', (req, res) => res.json(docsVisibles(req, Number(req.query.client_id) || null).map(({ fichier, ...d }) => d)));
api.post('/documents', role('client', 'agence'), upload.single('fichier'), wrap((req, res) => {
  if (!req.file) fail(400, 'Aucun fichier reçu.');
  const cid = req.user.profil === 'client' ? req.user.client_id : Number(req.body.client_id);
  if (!one('SELECT 1 FROM clients WHERE id = ?', cid)) { fs.rmSync(req.file.path, { force: true }); fail(400, 'Client introuvable.'); }
  const cat = ['Règlement intérieur', 'Charte qualité', 'Prise de poste'].includes(req.body.categorie) ? req.body.categorie : 'Prise de poste';
  const nom = str(Buffer.from(req.file.originalname, 'latin1').toString('utf8'), 150);
  const r = run('INSERT INTO documents (client_id, nom, categorie, fichier, type, taille) VALUES (?,?,?,?,?,?)', cid, nom, cat, req.file.filename, req.file.mimetype, req.file.size);
  res.status(201).json({ id: Number(r.lastInsertRowid), nom, categorie: cat });
}));
api.get('/documents/:id/fichier', wrap((req, res) => {
  const d = docsVisibles(req, null).find(x => x.id === Number(req.params.id));
  if (!d) fail(404, 'Document introuvable.');
  res.set('Content-Type', d.type);
  res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.nom)}`);
  res.sendFile(path.join(UPLOAD_DIR, path.basename(d.fichier)));
}));
api.delete('/documents/:id', role('client', 'agence'), wrap((req, res) => {
  const d = one('SELECT * FROM documents WHERE id = ?', req.params.id);
  if (!d || (req.user.profil === 'client' && d.client_id !== req.user.client_id)) fail(404, 'Document introuvable.');
  run('DELETE FROM documents WHERE id = ?', d.id);
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(d.fichier)), { force: true });
  res.json({ ok: true });
}));

/* ---------------- Factures et paie ---------------- */
const HEURES_FACTURABLES = `SELECT h.id, h.heures_prevues + CASE WHEN h.extra_statut = 'accepte' THEN h.extra ELSE 0 END AS total,
  m.taux_horaire, m.client_id, m.date, h.interim_id FROM heures h JOIN missions m ON m.id = h.mission_id
  WHERE h.valide_interim = 1 AND h.valide_client = 1 AND h.extra_statut != 'attente' AND m.date BETWEEN ? AND ?`;
api.get('/factures', (req, res) => {
  if (req.user.profil === 'interim') return res.status(403).json({ error: 'Accès refusé.' });
  const w = req.user.profil === 'client' ? 'WHERE f.client_id = ' + Number(req.user.client_id) : '';
  res.json(all(`SELECT f.*, c.nom AS client_nom FROM factures f JOIN clients c ON c.id = f.client_id ${w} ORDER BY f.id DESC`)
    .map(f => ({ ...f, montant_ttc: Math.round(f.montant_ht * 120) / 100, en_retard: !f.payee_le && f.echeance < today() })));
});
api.post('/factures/generer', role('agence'), wrap((req, res) => {
  const { debut, fin } = req.body;
  if (!isDate(debut) || !isDate(fin) || debut > fin) fail(400, 'Période invalide.');
  const lignes = all(HEURES_FACTURABLES + ' AND h.id NOT IN (SELECT heure_id FROM facture_heures)', debut, fin);
  const parClient = {};
  lignes.forEach(l => (parClient[l.client_id] = parClient[l.client_id] || []).push(l));
  const creees = [];
  tx(() => {
    for (const [cid, ls] of Object.entries(parClient)) {
      const c = one('SELECT * FROM clients WHERE id = ?', cid);
      const ht = Math.round(ls.reduce((s, l) => s + l.total * l.taux_horaire * c.coefficient, 0) * 100) / 100;
      const annee = today().slice(0, 4);
      const n = one('SELECT COUNT(*) n FROM factures WHERE numero LIKE ?', `F-${annee}-%`).n + 1;
      const numero = `F-${annee}-${String(n).padStart(4, '0')}`;
      const ech = new Date(); ech.setDate(ech.getDate() + c.delai_paiement);
      const r = run('INSERT INTO factures (numero, client_id, debut, fin, montant_ht, echeance) VALUES (?,?,?,?,?,?)', numero, cid, debut, fin, ht, ech.toISOString().slice(0, 10));
      ls.forEach(l => run('INSERT INTO facture_heures (facture_id, heure_id) VALUES (?,?)', r.lastInsertRowid, l.id));
      creees.push(numero);
    }
  });
  res.json({ creees });
}));
api.post('/factures/:id/payee', role('agence'), wrap((req, res) => {
  const r = run('UPDATE factures SET payee_le = ? WHERE id = ? AND payee_le IS NULL', today(), req.params.id);
  if (!r.changes) fail(404, 'Facture introuvable ou déjà payée.');
  res.json({ ok: true });
}));
api.get('/paie', role('agence'), wrap((req, res) => {
  const { debut, fin } = req.query;
  if (!isDate(debut) || !isDate(fin)) fail(400, 'Période invalide.');
  const rows = all(`SELECT i.id, i.prenom, i.nom, SUM(x.total) AS heures, SUM(x.total * x.taux_horaire) AS brut
     FROM (${HEURES_FACTURABLES}) x JOIN interimaires i ON i.id = x.interim_id GROUP BY i.id ORDER BY i.nom`, debut, fin);
  res.json(rows.map(r => { const ifm = r.brut * 0.1, iccp = (r.brut + ifm) * 0.1; return { ...r, ifm, iccp, total: r.brut + ifm + iccp }; }));
}));
api.get('/journal', role('agence'), (req, res) => res.json(all('SELECT * FROM envois_messages ORDER BY id DESC LIMIT 200')));
api.get('/config', (req, res) => res.json({ canaux: Object.fromEntries(CANAUX.map(c => [c, canalConfigure(c)])), aujourdhui: today(), motifs: MOTIFS, nationalites: dossier.NATIONALITES }));

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

/* ---------------- Interface ---------------- */
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: PROD ? '1h' : 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Gestion des erreurs : message clair pour l'utilisateur, détail dans les journaux du serveur.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (10 Mo maximum).' : 'Envoi du fichier impossible.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête mal formée.' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne. Réessayez ou contactez l\'agence.' });
});

/** Crée le compte administrateur de l'agence au premier démarrage. */
function initAdmin() {
  if (one('SELECT 1 FROM users LIMIT 1')) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || genPassword();
  run('INSERT INTO users (username, password_hash, profil, nom, must_change) VALUES (?,?,?,?,1)', username, bcrypt.hashSync(password, 10), 'agence', 'Administrateur');
  console.log(`\n  Compte agence créé : identifiant « ${username} », mot de passe provisoire « ${password} »\n  (à changer à la première connexion)\n`);
}

module.exports = { app, initAdmin, genPassword };

if (require.main === module) {
  initAdmin();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`CHR Intérim démarré sur http://localhost:${port}`));
}
