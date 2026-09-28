'use strict';
// Mesure d'audience des liens du site : nombre de visites par page et par origine (Facebook, e-mail, adresse du site…),
// et demandes envoyées depuis ces visites. Aucune adresse IP ni cookie n'est conservé : un jeton aléatoire par visite,
// gardé 13 mois au plus (recommandation CNIL pour la mesure d'audience exemptée de consentement).
const crypto = require('crypto');
const { db, one, all, run } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS visites (
  id INTEGER PRIMARY KEY,
  jeton TEXT NOT NULL UNIQUE,
  page TEXT NOT NULL,
  source TEXT NOT NULL,
  converti INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS visites_date ON visites (created_at)');

const PAGES = { connexion: 'Connexion', contact: 'Établissements', candidature: 'Candidats' };
const SOURCES = {
  facebook: 'Facebook', instagram: 'Instagram', mail: 'E-mail', sms: 'SMS', qr: 'QR code',
  recherche: 'Moteur de recherche', site: 'Adresse du site', autre: 'Autre site',
};
// Paramètre ?src= (ou utm_source) des liens partagés : alias acceptés.
const ALIAS = { fb: 'facebook', facebook: 'facebook', messenger: 'facebook', ig: 'instagram', instagram: 'instagram',
  mail: 'mail', email: 'mail', 'e-mail': 'mail', newsletter: 'mail', gmail: 'mail', outlook: 'mail', sms: 'sms', qr: 'qr', qrcode: 'qr',
  google: 'recherche', bing: 'recherche', site: 'site', direct: 'site' };
// Site précédent (document.referrer) quand le lien n'est pas marqué.
const REFERENTS = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(mail\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.orange\.fr|webmail\..+|mail\..+|.+\.mail\..+|zimbra\..+)$/, 'mail'],
  [/(^|\.)(google\.[a-z.]+|bing\.com|qwant\.com|duckduckgo\.com|ecosia\.org|search\.yahoo\.com|yahoo\.com|lilo\.org|startpage\.com)$/, 'recherche'],
];

/** Origine d'une visite : lien marqué d'abord, puis site précédent ; sans référent = adresse saisie, favori ou application de messagerie. */
function classer(src, referent, hote) {
  const s = String(src || '').trim().toLowerCase();
  if (s) return ALIAS[s] || (SOURCES[s] ? s : 'autre');
  let h = '';
  try { h = new URL(String(referent || '')).hostname.toLowerCase(); } catch { h = ''; }
  if (!h) return 'site';
  if (h === String(hote || '').toLowerCase()) return 'interne'; // navigation dans le site : non comptée
  for (const [re, k] of REFERENTS) if (re.test(h)) return k;
  return 'autre';
}

// Anti-abus : 30 visites comptées par heure et par connexion ; les robots déclarés sont ignorés.
const compteur = new Map();
function permis(ip) {
  const t = Date.now(), L = (compteur.get(ip) || []).filter(x => t - x < 3600000);
  if (L.length >= 30) { compteur.set(ip, L); return false; }
  L.push(t); compteur.set(ip, L); return true;
}
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|node-fetch/i;

/** Marque la visite comme transformée (formulaire envoyé depuis la page). */
function convertir(jeton, page) {
  if (typeof jeton === 'string' && /^[a-f0-9]{32}$/.test(jeton)) run('UPDATE visites SET converti = 1 WHERE jeton = ? AND page = ?', jeton, page);
}

/** Route publique : à enregistrer avant l'authentification. */
function publiques(api) {
  api.post('/public/visite', (req, res) => {
    const b = req.body || {}, page = PAGES[b.page] ? b.page : null;
    if (!page || ROBOT.test(req.get('user-agent') || '') || !permis(req.ip)) return res.status(202).json({ jeton: null });
    const source = classer(b.src, b.ref, req.hostname);
    if (source === 'interne') return res.status(202).json({ jeton: null });
    const jeton = crypto.randomBytes(16).toString('hex');
    run('INSERT INTO visites (jeton, page, source) VALUES (?, ?, ?)', jeton, page, source);
    run('DELETE FROM visites WHERE created_at < datetime(\'now\', \'-13 months\')');
    res.status(201).json({ jeton, source });
  });
}

const pc = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
/** Statistiques de l'agence : mois en cours, mois précédent, 6 mois. */
function stats(mc, mp, mois6) {
  const L = all('SELECT page, source, converti, substr(created_at, 1, 7) AS mois FROM visites WHERE created_at >= ?', mois6[0] + '-01');
  const du = m => L.filter(x => x.mois === m), Lc = du(mc), L6 = L;
  const parSource = X => Object.keys(SOURCES).map(k => {
    const S = X.filter(x => x.source === k), c = S.filter(x => x.converti).length;
    return { cle: k, nom: SOURCES[k], valeur: S.length, demandes: c, taux: pc(c, S.length) };
  }).filter(x => x.valeur).sort((a, b) => b.valeur - a.valeur);
  const parPage = X => Object.keys(PAGES).map(k => {
    const S = X.filter(x => x.page === k);
    return { cle: k, nom: PAGES[k], valeur: S.length, demandes: S.filter(x => x.converti).length };
  });
  const demandes = Lc.filter(x => x.converti).length, sources = parSource(Lc);
  return {
    mois: Lc.length, mois_prec: du(mp).length, demandes, demandes_prec: du(mp).filter(x => x.converti).length,
    taux: pc(demandes, Lc.filter(x => x.page !== 'connexion').length),
    principale: sources[0] || null,
    sources, sources6: parSource(L6), pages: parPage(Lc),
    serie: mois6.map(m => ({ mois: m, valeur: du(m).length })),
    serie_demandes: mois6.map(m => ({ mois: m, valeur: du(m).filter(x => x.converti).length })),
    total: one('SELECT COUNT(*) n FROM visites').n,
  };
}

module.exports = { publiques, stats, classer, convertir, SOURCES, PAGES };
