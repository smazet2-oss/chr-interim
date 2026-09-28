'use strict';
// Tests : droits d'accès par espace et par compte.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-droits-'));
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


test('droits d\'accès : réglage par espace, par compte, administrateur', async () => {
  const ag = await agence();
  assert.equal((await ag.get('/me')).data.super_admin, true, 'le compte admin est administrateur');
  // Un collaborateur agence, un employeur, un intérimaire
  const collab = (await ag.post('/acces', { type: 'agence', nom: 'Paul Assistant' })).data;
  const CO = await connecte(collab.username, collab.password, 'Collab2026X');
  const c = (await ag.post('/clients', { nom: 'Brasserie Droits' })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data, CL = await connecte(ca.username, ca.password, 'Client2026X');
  const i = (await ag.post('/interimaires', { prenom: 'Léo', nom: 'Test', poste: 'Serveur' })).data;
  const ia = (await ag.post('/acces', { type: 'interim', id: i.id })).data, IN = await connecte(ia.username, ia.password, 'Leo2026Xx');
  assert.equal((await CO.get('/droits')).status, 403, 'seul l\'administrateur gère les droits');

  // Espace employeur : demandes de mission verrouillées pour tous
  const mission = { poste: 'Serveur', date: plusJours(5), debut: '18:00', fin: '22:00', nb_postes: 1 };
  assert.equal((await CL.post('/missions', mission)).status, 201);
  assert.equal((await ag.put('/droits', { cible: 'profil:client', fonction: 'c_demandes', acces: false })).status, 200);
  const refus = await CL.post('/missions', mission);
  assert.equal(refus.status, 403); assert.match(refus.data.error, /verrouillée/);
  assert.deepEqual((await CL.get('/me')).data.verrous, ['c_demandes']);
  // … sauf pour ce compte (réglage personnalisé)
  const d0 = (await ag.get('/droits')).data, moi = d0.comptes.find(x => x.username === ca.username);
  await ag.put('/droits', { cible: 'user:' + moi.id, fonction: 'c_demandes', acces: true });
  assert.equal((await CL.post('/missions', mission)).status, 201);
  await ag.put('/droits', { cible: 'user:' + moi.id, fonction: 'c_demandes', acces: null });
  assert.equal((await CL.post('/missions', mission)).status, 403, 'retour au réglage de l\'espace');

  // Rubrique masquée : statistiques de l'employeur
  await ag.put('/droits', { cible: 'profil:client', fonction: 'c_stats', acces: false });
  assert.equal((await CL.get('/stats')).status, 403);
  assert.ok((await CL.get('/me')).data.vues_verrouillees.includes('stats'));

  // Intérimaire : simulation de paie retirée des réponses
  const m = (await ag.post('/missions', { ...mission, client_id: c.id, taux_horaire: 12.5 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  assert.ok((await IN.get('/missions')).data[0].simulation);
  await ag.put('/droits', { cible: 'profil:interim', fonction: 'i_simulation', acces: false });
  assert.equal((await IN.get('/missions')).data[0].simulation, undefined);
  await ag.put('/droits', { cible: 'profil:interim', fonction: 'i_accepter', acces: false });
  assert.equal((await IN.post(`/missions/${m.id}/repondre`, { accepte: true })).status, 403);

  // Collaborateur agence : paramètres verrouillés ; l'administrateur n'est jamais restreint
  await ag.put('/droits', { cible: 'profil:agence', fonction: 'a_parametres', acces: false });
  assert.equal((await CO.get('/parametres')).status, 403);
  assert.equal((await ag.get('/parametres')).status, 200);
  assert.equal((await ag.put('/droits', { cible: 'profil:client', fonction: 'i_accepter', acces: false })).status, 400, 'fonction d\'un autre espace');
  // Nommer le collaborateur administrateur, puis ne pas pouvoir retirer le dernier
  const idCo = (await ag.get('/droits')).data.comptes.find(x => x.username === collab.username).id;
  await ag.put('/droits/admin', { user_id: idCo, super_admin: true });
  assert.equal((await CO.get('/parametres')).status, 200);
  await CO.put('/droits/admin', { user_id: idCo, super_admin: false }).catch(() => null);
  const idAdmin = (await ag.get('/me')).data.id;
  await ag.put('/droits/admin', { user_id: idCo, super_admin: false });
  assert.equal((await ag.put('/droits/admin', { user_id: idAdmin, super_admin: false })).status, 409, 'au moins un administrateur');
});
