'use strict';
// Tests : suspension, réactivation et suppression des profils clients et intérimaires.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-gestion-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const { one } = require('../src/db');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body, form) => {
    const res = await fetch(base + url, { method, headers: form ? { 'X-CHR': '1', Cookie: cookie } : { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), del: u => call('DELETE', u), upload: (u, fd) => call('POST', u, null, fd) };
}
async function connecte(username, password, nouveau) {
  const a = agent();
  const r = await a.post('/login', { username, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (r.data.must_change) assert.equal((await a.post('/password', { actuel: password, nouveau })).status, 200);
  return a;
}
const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('suspendre, réactiver, supprimer', async () => {
  const ag = await connecte('admin', 'Admin-Temp1', 'Agence2026');
  const c = (await ag.post('/clients', { nom: 'Bistrot Test' })).data;
  const i = (await ag.post('/interimaires', { prenom: 'Léa', nom: 'Morin', poste: 'Serveuse' })).data;
  const j = (await ag.post('/interimaires', { prenom: 'Hugo', nom: 'Blanc', poste: 'Serveur' })).data;
  const ai = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const ac = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const lea = await connecte(ai.username, ai.password, 'Lea2026xx');
  const cl = await connecte(ac.username, ac.password, 'Client2026');

  // Suspension de l'intérimaire : déconnectée, connexion refusée, pas de diffusion.
  assert.equal((await lea.post(`/interimaires/${i.id}/suspendre`)).status, 403, 'réservé à l\'agence');
  assert.equal((await ag.post(`/interimaires/${i.id}/suspendre`, { motif: 'Absences répétées' })).status, 200);
  assert.equal((await lea.get('/missions')).status, 401, 'session coupée');
  const relog = await agent().post('/login', { username: ai.username, password: 'Lea2026xx' });
  assert.equal(relog.status, 403);
  assert.match(relog.data.error, /suspendu/);
  const m = (await cl.post('/missions', { poste: 'Serveur', date: plusJours(4), debut: '18:00', fin: '23:00', nb_postes: 1 })).data;
  const d = await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id, j.id], canaux: ['sms'] });
  assert.equal(d.data.envoyes, 1, 'l\'intérimaire suspendue ne reçoit pas la mission');
  assert.equal((await ag.get('/planning')).data.lignes.some(l => l.id === i.id), false);
  assert.equal((await ag.get('/interimaires')).data.find(x => x.id === i.id).suspendu, 1);

  // Réactivation : elle peut se reconnecter.
  assert.equal((await ag.post(`/interimaires/${i.id}/reactiver`)).status, 200);
  assert.equal((await agent().post('/login', { username: ai.username, password: 'Lea2026xx' })).status, 200);

  // Client suspendu : déconnecté, l'agence ne peut plus lui créer de mission.
  await ag.post(`/clients/${c.id}/suspendre`);
  assert.equal((await cl.get('/missions')).status, 401);
  assert.equal((await ag.post('/missions', { client_id: c.id, poste: 'X', date: plusJours(5), debut: '10:00', fin: '12:00', nb_postes: 1, taux_horaire: 12 })).status, 409);
  await ag.post(`/clients/${c.id}/reactiver`);

  // Suppression sans historique : fiche, compte et réponses supprimés.
  assert.equal((await ag.del(`/interimaires/${j.id}`)).status, 200);
  assert.equal(one('SELECT COUNT(*) n FROM interimaires WHERE id = ?', j.id).n, 0);
  assert.equal(one('SELECT COUNT(*) n FROM envois WHERE interim_id = ?', j.id).n, 0);

  // Suppression refusée quand il existe un historique légal (contrat, relevé d'heures).
  const m2 = (await ag.post('/missions', { client_id: c.id, poste: 'Serveuse', date: plusJours(6), debut: '12:00', fin: '15:00', nb_postes: 1, taux_horaire: 12 })).data;
  await ag.post(`/missions/${m2.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  const lea2 = await connecte(ai.username, 'Lea2026xx');
  await lea2.post(`/missions/${m2.id}/repondre`, { accepte: true });
  await ag.post(`/missions/${m2.id}/decision`, { interim_id: i.id, accepte: true });
  const refus = await ag.del(`/interimaires/${i.id}`);
  assert.equal(refus.status, 409);
  assert.match(refus.data.error, /contrat/);
  assert.equal((await ag.del(`/clients/${c.id}`)).status, 409);

  // Un client sans historique se supprime, avec son compte.
  const c2 = (await ag.post('/clients', { nom: 'Client éphémère' })).data;
  await ag.post('/acces', { type: 'client', id: c2.id });
  assert.equal((await ag.del(`/clients/${c2.id}`)).status, 200);
  assert.equal(one('SELECT COUNT(*) n FROM users WHERE client_id = ?', c2.id).n, 0);
});
