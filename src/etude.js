'use strict';
// Étude de marché annuelle (2026, puis 2027, 2028…) auprès des intérimaires et des établissements HCR.
// L'agence envoie un e-mail : la première question se coche directement dans le message (chaque réponse est un lien),
// puis le questionnaire s'ouvre sur le site (5 minutes). Relance automatique facultative, désinscription en un clic.
// Les réponses sont anonymes : elles ne sont jamais reliées au destinataire (seuls « a cliqué » et « a répondu » sont suivis).
const crypto = require('node:crypto');
const { db, one, all, run } = require('./db');
const P = require('./parametres');
const { envoyer, siteUrl } = require('./notify');
const prospects = require('./prospects');
const candidats = require('./candidats');

db.exec(`CREATE TABLE IF NOT EXISTS etude_envois (
  id INTEGER PRIMARY KEY,
  annee INTEGER NOT NULL, cible TEXT NOT NULL CHECK (cible IN ('etablissement', 'interimaire')),
  email TEXT NOT NULL, nom TEXT, ref_type TEXT, ref_id INTEGER,
  jeton TEXT NOT NULL UNIQUE,
  envoye_le TEXT, statut TEXT, relance_le TEXT, clique_le TEXT, repondu_le TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (annee, cible, email)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS etude_reponses (
  id INTEGER PRIMARY KEY,
  annee INTEGER NOT NULL, cible TEXT NOT NULL,
  rid TEXT NOT NULL UNIQUE,              -- jeton aléatoire de la réponse, sans lien avec le destinataire
  source TEXT NOT NULL DEFAULT 'site',   -- 'mail' (lien de l'e-mail) ou 'site' (lien public)
  reponses TEXT NOT NULL DEFAULT '{}', complet INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE TABLE IF NOT EXISTS etude_desinscrits (email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');

/** Questions de l'étude : celles des questionnaires du site, sans les coordonnées ni les champs libres (anonymat). */
function extraire(Q, cles) {
  return Q.map(s => ({ titre: s.titre, champs: s.champs.filter(c => cles.includes(c.k)).map(c => ({ ...c, req: false })) })).filter(s => s.champs.length);
}
const CIBLES = {
  etablissement: {
    nom: 'Établissements', public: 'etablissements', premiere: 'frequence',
    questionnaire: extraire(prospects.QUESTIONNAIRE, ['type_etab', 'effectif', 'frequence', 'postes', 'extras_mois', 'heures_mois', 'vehicule', 'delai', 'canaux', 'satisfaction',
      'problemes', 'probleme_principal', 'services', 'prix_serveur', 'prix_cuisinier', 'coefficient', 'reglement']),
    sujet: a => `Étude de marché ${a} : vos besoins en renforts HCR (5 minutes)`,
    texte: (a, nom) => `Bonjour${nom ? ' ' + nom : ''},\n\n${P.get('raison_sociale')}, agence d'intérim spécialisée dans l'hôtellerie, les cafés et la restauration, réalise son étude de marché ${a} auprès des établissements de la région.\n\nVos réponses nous aident à proposer des renforts plus rapides, mieux formés et au juste prix. Le questionnaire est anonyme et prend environ 5 minutes. Commencez par cocher la réponse qui vous correspond ci-dessous.\n\nMerci pour votre aide !`,
  },
  interimaire: {
    nom: 'Intérimaires', public: 'interimaires', premiere: 'type_mission',
    questionnaire: extraire(candidats.QUESTIONNAIRE, ['postes', 'poste_principal', 'experience', 'formations', 'creneaux', 'type_mission', 'prevenance', 'vehicule', 'transport',
      'rayon', 'tenue', 'taux_souhaite', 'priorites', 'canal']),
    sujet: a => `Étude ${a} : vos attentes pour vos missions (5 minutes)`,
    texte: (a, nom) => `Bonjour${nom ? ' ' + nom : ''},\n\n${P.get('raison_sociale')} réalise son étude ${a} auprès des professionnels de l'hôtellerie-restauration pour mieux connaître vos attentes : type de missions, disponibilités, déplacements, rémunération.\n\nLe questionnaire est anonyme et prend environ 5 minutes. Commencez par cocher la réponse qui vous correspond ci-dessous.\n\nMerci pour votre participation !`,
  },
};
for (const c of Object.values(CIBLES)) c.champs = Object.fromEntries(c.questionnaire.flatMap(s => s.champs).map(x => [x.k, x]));
const PUBLIC = { etablissements: 'etablissement', interimaires: 'interimaire' };

const annee = () => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 4));
const jeton = () => crypto.randomBytes(16).toString('hex');
const premiere = cible => { const c = CIBLES[cible], q = c.champs[c.premiere]; return { k: q.k, l: q.l, options: q.options }; };
const lienEtude = (cible, j, v) => `${siteUrl()}/etude/${CIBLES[cible].public}?${new URLSearchParams({ ...(j ? { j } : {}), ...(v !== undefined ? { v: String(v) } : {}), src: 'mail' })}`;
const desinscrit = email => !!one('SELECT 1 FROM etude_desinscrits WHERE email = ?', String(email).toLowerCase());

/** Envoie l'invitation (ou la relance) d'une ligne etude_envois. */
async function envoyerInvitation(e, relance = false) {
  const c = CIBLES[e.cible], q = premiere(e.cible);
  const r = await envoyer('mail', { email: e.email }, (relance ? 'Rappel : ' : '') + c.sujet(e.annee),
    (relance ? `Petit rappel : il est encore temps de participer.\n\n` : '') + c.texte(e.annee, e.nom),
    { titre: `Étude de marché ${e.annee}`, lien: lienEtude(e.cible, e.jeton), bouton: 'Répondre au questionnaire (5 min)',
      choix: { question: q.l, options: q.options.map((o, i) => ({ l: o, url: lienEtude(e.cible, e.jeton, i) })) },
      desinscription: `${siteUrl()}/etude/desinscription?j=${e.jeton}` });
  run(`UPDATE etude_envois SET ${relance ? 'relance_le' : 'envoye_le'} = datetime('now'), statut = ? WHERE id = ?`, r.statut, e.id);
  return r;
}
/** Crée la ligne d'envoi (une par adresse, par année et par cible) puis envoie. */
async function inviter(cible, { email, nom, ref_type = null, ref_id = null }, renvoyer = false) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email, statut: 'ignore', detail: 'Adresse e-mail invalide' };
  if (desinscrit(email)) return { email, statut: 'ignore', detail: 'Désinscrit' };
  const a = annee();
  let e = one('SELECT * FROM etude_envois WHERE annee = ? AND cible = ? AND email = ?', a, cible, email);
  if (e && e.envoye_le && !renvoyer) return { email, statut: 'ignore', detail: 'Déjà invité cette année' };
  if (e?.repondu_le) return { email, statut: 'ignore', detail: 'A déjà répondu' };
  if (!e) e = one('SELECT * FROM etude_envois WHERE id = ?', run('INSERT INTO etude_envois (annee, cible, email, nom, ref_type, ref_id, jeton) VALUES (?,?,?,?,?,?,?)',
    a, cible, email, nom ? String(nom).slice(0, 120) : null, ref_type, ref_id, jeton()).lastInsertRowid);
  const r = await envoyerInvitation(e);
  return { email, statut: r.statut, detail: r.detail };
}

/** Destinataires possibles : intérimaires et candidats ; ou clients et prospects (avec e-mail). */
function destinataires(cible) {
  const a = annee();
  const L = cible === 'interimaire'
    ? [...all('SELECT \'interim\' AS type, id, prenom || \' \' || nom AS nom, prenom AS appel, email, created_at FROM interimaires WHERE email IS NOT NULL AND email != \'\' AND COALESCE(suspendu, 0) = 0 ORDER BY nom'),
      ...all('SELECT \'candidat\' AS type, id, prenom || \' \' || nom AS nom, prenom AS appel, email, created_at FROM candidats WHERE email IS NOT NULL AND email != \'\' AND interim_id IS NULL AND statut != \'refuse\' ORDER BY nom')]
    : [...all('SELECT \'client\' AS type, id, nom, contact AS appel, email, created_at FROM clients WHERE email IS NOT NULL AND email != \'\' AND COALESCE(suspendu, 0) = 0 ORDER BY nom'),
      ...all('SELECT \'prospect\' AS type, id, etablissement AS nom, repondant AS appel, email, created_at FROM prospects WHERE email IS NOT NULL AND email != \'\' AND statut NOT IN (\'client\', \'perdu\') ORDER BY etablissement')];
  return L.map(x => {
    const e = one('SELECT envoye_le, statut, relance_le, clique_le, repondu_le FROM etude_envois WHERE annee = ? AND cible = ? AND email = ?', a, cible, String(x.email).toLowerCase());
    return { ...x, envoi: e || null, desinscrit: desinscrit(x.email) };
  });
}
/** Prénom ou nom du contact pour « Bonjour … » (sans la fonction : « Sophie Garnier, gérante » → « Sophie Garnier »). */
const appel = x => (x.appel ? String(x.appel).split(',')[0].trim() : '') || null;

/** Relances et invitations automatiques (planificateur). */
async function tourner() {
  const a = annee();
  if (P.get('etude_relance') !== 'non') {
    const j = Math.max(1, P.num('etude_relance_jours', 7));
    for (const e of all(`SELECT * FROM etude_envois WHERE annee = ? AND envoye_le IS NOT NULL AND statut = 'envoye' AND relance_le IS NULL AND repondu_le IS NULL
        AND envoye_le <= datetime('now', ?) LIMIT 100`, a, `-${j} days`)) if (!desinscrit(e.email)) await envoyerInvitation(e, true);
  }
  if (P.get('etude_auto') === 'oui') {
    // Nouveaux intérimaires et nouveaux clients depuis l'activation de l'envoi automatique
    const depuis = one('SELECT updated_at FROM parametres WHERE cle = \'etude_auto\'')?.updated_at;
    for (const cible of ['interimaire', 'etablissement'])
      for (const x of destinataires(cible).filter(x => ['interim', 'client'].includes(x.type) && !x.envoi && !x.desinscrit && depuis && x.created_at >= depuis).slice(0, 50))
        await inviter(cible, { email: x.email, nom: appel(x), ref_type: x.type, ref_id: x.id });
  }
}

/** Résultats compilés et anonymes d'une année, comparés à l'année précédente. */
function resultats(cible, a) {
  const c = CIBLES[cible];
  const lire = an => all('SELECT reponses, complet FROM etude_reponses WHERE annee = ? AND cible = ?', an, cible).map(x => ({ ...JSON.parse(x.reponses), _complet: x.complet }));
  const R = lire(a), Rp = lire(a - 1);
  const pc = (n, d) => d ? Math.round(n / d * 1000) / 10 : null;
  const question = (q, L) => {
    const rep = L.filter(r => r[q.k] !== undefined && r[q.k] !== null && r[q.k] !== '');
    if (q.type === 'number') {
      const v = rep.map(r => Number(r[q.k])).filter(n => n > 0).sort((x, y) => x - y);
      return { n: v.length, moyenne: v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 100) / 100 : null, mediane: v.length ? v[Math.floor((v.length - 1) / 2)] : null, min: v[0] ?? null, max: v[v.length - 1] ?? null };
    }
    if (q.type === 'bool') { const n = L.filter(r => r._complet).length, oui = L.filter(r => r[q.k] === true).length; return { n, options: [{ l: 'Oui', n: oui, pc: pc(oui, n) }, { l: 'Non', n: n - oui, pc: pc(n - oui, n) }] }; }
    const opts = q.from ? [...c.champs[q.from].options, 'Autre'] : [...q.options, ...(q.autre ? ['Autre'] : [])];
    return { n: rep.length, options: opts.map(o => { const k = rep.filter(r => [].concat(r[q.k]).includes(o)).length; return { l: o, n: k, pc: pc(k, rep.length) }; }).sort((x, y) => y.n - x.n) };
  };
  const envois = one(`SELECT COUNT(*) n, SUM(statut = 'envoye') ok, SUM(relance_le IS NOT NULL) rel, SUM(clique_le IS NOT NULL) cl, SUM(repondu_le IS NOT NULL) rep FROM etude_envois WHERE annee = ? AND cible = ?`, a, cible);
  const annees = all('SELECT DISTINCT annee FROM etude_reponses WHERE cible = ? UNION SELECT DISTINCT annee FROM etude_envois WHERE cible = ?', cible, cible).map(x => x.annee);
  return {
    cible, nom: c.nom, annee: a, annees: [...new Set([...annees, annee()])].sort(),
    reponses: R.filter(r => r._complet).length, partielles: R.filter(r => !r._complet).length, reponses_prec: Rp.filter(r => r._complet).length,
    campagne: { invites: envois.ok || 0, relances: envois.rel || 0, clics: envois.cl || 0, reponses: envois.rep || 0, taux: pc(envois.rep || 0, envois.ok || 0) },
    sections: c.questionnaire.map(s => ({ titre: s.titre, questions: s.champs.map(q => {
      const r = question(q, R), p = question(q, Rp);
      if (r.options) r.options.forEach(o => { const op = p.options?.find(x => x.l === o.l); o.pc_prec = p.n ? op?.pc ?? 0 : null; });
      if (q.type === 'number') r.moyenne_prec = p.moyenne;
      return { k: q.k, l: q.l, type: q.type, ...r };
    }) })),
  };
}

/** Routes publiques (avant l'authentification). */
function publiques(api, h) {
  const { fail, wrap } = h;
  const cibleDe = req => PUBLIC[req.params.p] || fail(404, 'Questionnaire introuvable.');
  const envoiDe = j => typeof j === 'string' && /^[a-f0-9]{32}$/.test(j) ? one('SELECT * FROM etude_envois WHERE jeton = ?', j) : null;
  api.get('/public/etude/:p', (req, res) => {
    const cible = cibleDe(req), c = CIBLES[cible];
    res.json({ cible, annee: annee(), nom: c.nom, questionnaire: c.questionnaire, premiere: c.premiere,
      agence: { nom: P.get('raison_sociale'), telephone: P.get('telephone'), email: P.get('email') } });
  });
  // Réponse cochée dans l'e-mail : enregistrée tout de suite (réponse partielle), le reste du questionnaire suit sur le site.
  api.post('/public/etude/:p/debut', (req, res) => {
    const cible = cibleDe(req), q = premiere(cible), b = req.body || {}, e = envoiDe(b.j);
    if (e && e.cible === cible) run('UPDATE etude_envois SET clique_le = COALESCE(clique_le, datetime(\'now\')) WHERE id = ?', e.id);
    const v = q.options[Number(b.v)];
    if (b.v === undefined || v === undefined || (e && e.repondu_le)) return res.json({ rid: null });
    if (!prospects.limite('etude-debut:' + req.ip)) fail(429, 'Trop de réponses depuis cette connexion. Réessayez dans une heure.');
    const rid = jeton();
    run('INSERT INTO etude_reponses (annee, cible, rid, source, reponses) VALUES (?,?,?,?,?)', annee(), cible, rid, e ? 'mail' : 'site', JSON.stringify({ [q.k]: v }));
    res.status(201).json({ rid, reponse: { [q.k]: v } });
  });
  api.post('/public/etude/:p', wrap(async (req, res) => {
    const cible = cibleDe(req), b = req.body || {}, e = envoiDe(b.j);
    if (b.site_web) return res.status(201).json({ ok: true }); // champ piège : robot
    const r = prospects.nettoyer(b, fail, CIBLES[cible].champs, { contact: false });
    if (!Object.keys(r).length) fail(400, 'Répondez au moins à une question.');
    const ligne = typeof b.rid === 'string' && /^[a-f0-9]{32}$/.test(b.rid) ? one('SELECT * FROM etude_reponses WHERE rid = ? AND cible = ? AND complet = 0', b.rid, cible) : null;
    if (ligne) run('UPDATE etude_reponses SET reponses = ?, complet = 1, updated_at = datetime(\'now\') WHERE id = ?', JSON.stringify(r), ligne.id);
    else {
      if (!prospects.limite(req.ip)) fail(429, 'Trop d\'envois depuis cette connexion. Réessayez dans une heure.');
      run('INSERT INTO etude_reponses (annee, cible, rid, source, reponses, complet) VALUES (?,?,?,?,?,1)', annee(), cible, jeton(), e ? 'mail' : 'site', JSON.stringify(r));
    }
    if (e && e.cible === cible) run('UPDATE etude_envois SET repondu_le = datetime(\'now\'), clique_le = COALESCE(clique_le, datetime(\'now\')) WHERE id = ?', e.id);
    res.status(201).json({ ok: true });
  }));
  api.post('/public/etude-desinscription', (req, res) => {
    const e = envoiDe((req.body || {}).j);
    if (!e) fail(404, 'Lien de désinscription invalide.');
    run('INSERT OR IGNORE INTO etude_desinscrits (email) VALUES (?)', e.email);
    res.json({ ok: true });
  });
}

/** Routes de l'agence. */
function agence(api, h) {
  const { fail, wrap, role } = h;
  const cibleOk = c => CIBLES[c] ? c : fail(400, 'Cible inconnue.');
  api.get('/etude/destinataires', role('agence'), (req, res) => res.json({ annee: annee(), cible: cibleOk(req.query.cible), destinataires: destinataires(req.query.cible),
    premiere: premiere(req.query.cible), relance: P.get('etude_relance') !== 'non', relance_jours: P.num('etude_relance_jours', 7), auto: P.get('etude_auto') === 'oui',
    lien_public: `${siteUrl()}/etude/${CIBLES[req.query.cible].public}` }));
  api.post('/etude/envoyer', role('agence'), wrap(async (req, res) => {
    const b = req.body || {}, cible = cibleOk(b.cible), L = [];
    const types = cible === 'interimaire' ? { interim: 'interimaires', candidat: 'candidats' } : { client: 'clients', prospect: 'prospects' };
    const D = Object.fromEntries(destinataires(cible).map(x => [x.type + ':' + x.id, x]));
    for (const s of (Array.isArray(b.selection) ? b.selection : []).slice(0, 500)) {
      const x = D[s]; if (!x || !types[x.type]) continue;
      L.push(await inviter(cible, { email: x.email, nom: appel(x), ref_type: x.type, ref_id: x.id }, !!b.renvoyer));
    }
    // Adresses saisies à la main (démarchage) : « Nom ; e-mail » ou « e-mail », une par ligne
    for (const ligne of String(b.adresses || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 300)) {
      const m = ligne.match(/^(?:(.*?)[;,\t]\s*)?([^\s;,<>]+@[^\s;,<>]+)\s*$/) || ligne.match(/^(.*?)<([^>]+)>$/);
      L.push(m ? await inviter(cible, { email: m[2], nom: m[1] ? m[1].trim() : null }, !!b.renvoyer) : { email: ligne, statut: 'ignore', detail: 'Adresse e-mail introuvable' });
    }
    if (!L.length) fail(400, 'Cochez au moins un destinataire ou saisissez une adresse e-mail.');
    const n = s => L.filter(x => x.statut === s).length;
    res.json({ envoyes: n('envoye'), simules: n('simule'), echecs: n('echec'), ignores: n('ignore'), details: L });
  }));
  api.get('/etude/apercu', role('agence'), (req, res) => {
    const cible = cibleOk(req.query.cible), c = CIBLES[cible], q = premiere(cible), a = annee();
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(require('./notify').gabaritEmail({ titre: `Étude de marché ${a}`, texte: c.texte(a, 'Sophie'), lien: lienEtude(cible, 'exemple'), bouton: 'Répondre au questionnaire (5 min)',
      choix: { question: q.l, options: q.options.map((o, i) => ({ l: o, url: lienEtude(cible, 'exemple', i) })) }, desinscription: `${siteUrl()}/etude/desinscription` }, '/img/bandeau-horizontal.png'));
  });
  api.get('/etude/resultats', role('agence'), (req, res) => {
    const a = Number(req.query.annee) || annee();
    if (a < 2020 || a > 2100) fail(400, 'Année invalide.');
    res.json(resultats(cibleOk(req.query.cible || 'etablissement'), a));
  });
}

module.exports = { publiques, agence, tourner, resultats, CIBLES, annee,
  demarrer: () => setInterval(() => tourner().catch(e => console.error('Étude de marché :', e.message)), 30 * 60 * 1000).unref() };
