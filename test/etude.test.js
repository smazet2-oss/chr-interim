'use strict';
// Tests : étude de marché (envoi, case cochée dans l'e-mail, réponses anonymes, relance, désinscription) et statistiques par mois.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-etude-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const { run, one } = require('../src/db');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body, h = {}) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie, ...h }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: u => call('GET', u), post: (u, b, h) => call('POST', u, b || {}, h), put: (u, b) => call('PUT', u, b || {}), del: u => call('DELETE', u) };
}
async function connecte(u, p, n) { const a = agent(); const r = await a.post('/login', { username: u, password: p }); if (r.data.must_change) await a.post('/password', { actuel: p, nouveau: n }); return a; }
const plusJours = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };
let AG;
const agence = async () => AG || (AG = await connecte('admin', 'Admin-Temp1', 'Agence2026'));


test('étude de marché : invitation, réponse cochée dans l\'e-mail, questionnaire anonyme, résultats', async () => {
  const ag = await agence(), pub = agent(), etude = require('../src/etude'), a = etude.annee();
  const iid = run('INSERT INTO interimaires (prenom, nom, poste, email) VALUES (?,?,?,?)', 'Nina', 'Lopez', 'Serveur', 'nina@exemple.fr').lastInsertRowid;
  const d = (await ag.get('/etude/destinataires?cible=interimaire')).data;
  assert.ok(d.destinataires.some(x => x.type === 'interim' && x.id === Number(iid) && !x.envoi));
  assert.equal(d.premiere.k, 'type_mission');

  const r = (await ag.post('/etude/envoyer', { cible: 'interimaire', selection: ['interim:' + iid], adresses: 'Bob Martin ; bob@exemple.fr\npas une adresse' })).data;
  assert.equal(r.simules, 2, JSON.stringify(r)); assert.equal(r.ignores, 1);
  assert.equal((await ag.post('/etude/envoyer', { cible: 'interimaire', selection: ['interim:' + iid] })).data.ignores, 1, 'pas deux invitations la même année');
  const mail = one('SELECT contenu FROM envois_messages WHERE destinataire = ? ORDER BY id DESC', 'nina@exemple.fr').contenu;
  assert.match(mail, /Bonjour Nina/); assert.match(mail, /\/etude\/interimaires\?j=[a-f0-9]{32}&v=0/); assert.match(mail, /Ne plus recevoir/);

  // Réponse cochée dans l'e-mail : enregistrée tout de suite, puis questionnaire complet
  const e = one('SELECT * FROM etude_envois WHERE email = ?', 'nina@exemple.fr');
  const deb = await pub.post('/public/etude/interimaires/debut', { j: e.jeton, v: 0 });
  assert.equal(deb.status, 201); assert.match(deb.data.rid, /^[a-f0-9]{32}$/);
  assert.ok(one('SELECT clique_le FROM etude_envois WHERE id = ?', e.id).clique_le);
  assert.equal((await ag.get(`/etude/resultats?cible=interimaire&annee=${a}`)).data.partielles, 1);
  const fin = await pub.post('/public/etude/interimaires', { j: e.jeton, rid: deb.data.rid, type_mission: 'Extras ponctuels', creneaux: ['Le soir', 'Le week-end'], taux_souhaite: '13,5', vehicule: 'oui', email: 'fuite@exemple.fr' });
  assert.equal(fin.status, 201, JSON.stringify(fin.data));
  assert.ok(one('SELECT repondu_le FROM etude_envois WHERE id = ?', e.id).repondu_le);
  const rep = one('SELECT reponses, complet, source FROM etude_reponses WHERE rid = ?', deb.data.rid);
  assert.equal(rep.complet, 1); assert.equal(rep.source, 'mail');
  assert.ok(!/nina|fuite|@/i.test(rep.reponses), 'aucune donnée personnelle dans la réponse');
  assert.equal((await pub.post('/public/etude/interimaires', { type_mission: 'Inventé' })).status, 400);
  assert.equal((await pub.get('/public/etude/inconnu')).status, 404);

  // Résultats : détail à partir de 3 réponses complètes
  for (const t of ['Missions régulières', 'Extras ponctuels']) assert.equal((await pub.post('/public/etude/interimaires', { type_mission: t, taux_souhaite: 12 })).status, 201);
  const res = (await ag.get(`/etude/resultats?cible=interimaire&annee=${a}`)).data;
  assert.equal(res.reponses, 3); assert.equal(res.partielles, 0); assert.equal(res.campagne.reponses, 1);
  const tm = res.sections.flatMap(s => s.questions).find(q => q.k === 'type_mission');
  assert.equal(tm.options.find(o => o.l === 'Extras ponctuels').pc, 66.7);
  assert.equal(res.sections.flatMap(s => s.questions).find(q => q.k === 'taux_souhaite').mediane, 12);
  assert.ok(res.annees.includes(a));

  // Désinscription, relance automatique
  const bob = one('SELECT * FROM etude_envois WHERE email = ?', 'bob@exemple.fr');
  run('UPDATE etude_envois SET statut = \'envoye\', envoye_le = datetime(\'now\', \'-8 days\') WHERE id = ?', bob.id);
  await etude.tourner();
  assert.ok(one('SELECT relance_le FROM etude_envois WHERE id = ?', bob.id).relance_le, 'relancé après 7 jours');
  assert.equal((await pub.post('/public/etude-desinscription', { j: bob.jeton })).status, 200);
  const r2 = (await ag.post('/etude/envoyer', { cible: 'interimaire', adresses: 'bob@exemple.fr', renvoyer: true })).data;
  assert.equal(r2.details[0].detail, 'Désinscrit');

  // Réservé à l'agence
  assert.equal((await pub.get('/etude/destinataires?cible=interimaire')).status, 401);
});

test('statistiques : choix du mois affiché', async () => {
  const ag = await agence();
  const d0 = (await ag.get('/stats')).data;
  assert.ok(d0.mois_choix.length >= 12); assert.equal(d0.mois, d0.mois_courant);
  const m = d0.mois_choix[2], d = (await ag.get('/stats?mois=' + m)).data;
  assert.equal(d.mois, m); assert.equal(d.mois6[5], m);
  assert.equal((await ag.get('/stats?mois=2999-01')).data.mois, d0.mois_courant, 'mois futur ignoré');
});
