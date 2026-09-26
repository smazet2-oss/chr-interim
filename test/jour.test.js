'use strict';
// Tests : détail d'une journée et calendrier du mois, selon le profil.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-jour-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b) };
}
async function connecte(u, p, n) { const a = agent(); const r = await a.post('/login', { username: u, password: p }); if (r.data.must_change) await a.post('/password', { actuel: p, nouveau: n }); return a; }
const plusJours = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('détail d\'une journée selon le profil', async () => {
  const ag = await connecte('admin', 'Admin-Temp1', 'Agence2026');
  const c = (await ag.post('/clients', { nom: 'Brasserie Jour', adresse: '3 quai Saint-Antoine', ville: 'Lyon', contact: 'M. Faure', telephone: '04 00 00 00 01' })).data;
  const c2 = (await ag.post('/clients', { nom: 'Autre client' })).data;
  const mk = async (prenom, tel) => { const i = (await ag.post('/interimaires', { prenom, nom: 'Test', poste: 'Serveur', telephone: tel })).data; const a = (await ag.post('/acces', { type: 'interim', id: i.id })).data; return [i, await connecte(a.username, a.password, prenom + '2026X')]; };
  const [a, A] = await mk('Alice', '0611111111');
  const [b, B] = await mk('Bruno', '0622222222');
  const [cc, C] = await mk('Chloe', '0633333333');
  const [d] = await mk('David', '0644444444');
  const accC = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const cl = await connecte(accC.username, accC.password, 'Client2026');
  const accC2 = (await ag.post('/acces', { type: 'client', id: c2.id })).data;
  const cl2 = await connecte(accC2.username, accC2.password, 'Client2026');

  const jour = plusJours(5);
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: jour, debut: '18:00', fin: '23:00', nb_postes: 2, taux_horaire: 12.5 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [a.id, b.id, cc.id, d.id], canaux: ['sms', 'whatsapp'] });
  await A.post(`/missions/${m.id}/repondre`, { accepte: true });
  await B.post(`/missions/${m.id}/repondre`, { accepte: true });
  await cl.post(`/missions/${m.id}/decision`, { interim_id: b.id, accepte: false }); // Bruno refusé
  await C.post(`/missions/${m.id}/repondre`, { accepte: true });
  await cl.post(`/missions/${m.id}/decision`, { interim_id: a.id, accepte: true }); // Alice validée, Chloé en attente
  await C.put('/disponibilites', { date: jour, etat: 'disponible' });

  // Employeur : validés, en attente, refusés ; téléphone masqué tant que la mission n'est pas verrouillée.
  let j = (await cl.get('/jour/' + jour)).data;
  const et = Object.fromEntries(j.missions[0].candidats.map(x => [x.prenom, x.etat]));
  assert.deepEqual(et, { Alice: 'retenu', Bruno: 'refuse_client', Chloe: 'accepte' });
  assert.equal(j.missions[0].candidats.find(x => x.prenom === 'Alice').telephone, null);
  assert.equal(j.missions[0].candidats.some(x => x.prenom === 'David'), false, 'pas de réponse = invisible pour l\'employeur');
  assert.equal((await cl2.get('/jour/' + jour)).data.missions.length, 0, 'un autre client ne voit rien');

  // Validation de Chloé : mission verrouillée, téléphones visibles, contrat suivi.
  await cl.post(`/missions/${m.id}/decision`, { interim_id: cc.id, accepte: true });
  j = (await cl.get('/jour/' + jour)).data;
  const alice = j.missions[0].candidats.find(x => x.prenom === 'Alice');
  assert.equal(alice.telephone, '0611111111');
  assert.equal(alice.contrat, 'a_signer');

  // Intérimaire : détail de sa mission, coordonnées de l'employeur seulement si confirmée.
  const ja = (await A.get('/jour/' + jour)).data.missions[0];
  assert.equal(ja.etat, 'confirmee');
  assert.equal(ja.lieu, '3 quai Saint-Antoine, Lyon');
  assert.deepEqual(ja.contact, { nom: 'M. Faure', telephone: '04 00 00 00 01' });
  assert.deepEqual(ja.collegues, ['Chloe']);
  assert.ok(ja.contrat_id);
  const jb = (await B.get('/jour/' + jour)).data.missions[0];
  assert.equal(jb.etat, 'non_retenu');
  assert.equal(jb.contact, null);
  assert.equal((await B.get('/jour/' + plusJours(6))).data.missions.length, 0);

  // Agence : tous les intervenants avec leur état, contrats et disponibles du jour.
  const jg = (await ag.get('/jour/' + jour)).data;
  const etats = Object.fromEntries(jg.missions[0].intervenants.map(x => [x.prenom, x.etat]));
  assert.deepEqual(etats, { Alice: 'retenu', Bruno: 'refuse_client', Chloe: 'retenu', David: null });
  assert.deepEqual(jg.missions[0].intervenants.find(x => x.prenom === 'Alice').canaux, ['sms', 'whatsapp']);
  assert.equal(jg.disponibles.length, 0, 'Chloé est disponible mais déjà en mission');

  // Calendrier du mois
  const cal = (await ag.get('/calendrier?mois=' + jour.slice(0, 7))).data.jours.find(x => x.date === jour);
  assert.equal(cal.missions, 1); assert.equal(cal.postes, 2); assert.equal(cal.retenus, 2);
  assert.equal((await cl2.get('/calendrier?mois=' + jour.slice(0, 7))).data.jours.length, 0);
  assert.equal((await A.get('/calendrier')).status, 403);
  assert.equal((await ag.get('/jour/2026-99-99')).status, 400);
});
