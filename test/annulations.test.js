'use strict';
// Tests : annulations, désistements, indisponibilités et statistiques.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-ann-'));
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


test('annulation par l\'employeur, désistement, indisponibilité, statistiques', async () => {
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Brasserie Annul', email: 'b@exemple.fr' })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const CL = await connecte(ca.username, ca.password, 'Client2026X');
  const mk = async prenom => { const i = (await ag.post('/interimaires', { prenom, nom: 'Test', poste: 'Serveur', telephone: '0611111111' })).data; const a = (await ag.post('/acces', { type: 'interim', id: i.id })).data; return [i, await connecte(a.username, a.password, prenom + '2026X')]; };
  const [i1, I1] = await mk('Alain'), [i2, I2] = await mk('Berthe'), [i3] = await mk('Cyril');
  const jour = plusJours(3), etat = async (A, mid) => (await A.get('/missions')).data.find(x => x.id === mid)?.etat;
  const nouvelle = async (debut, fin, dest) => { const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: jour, debut, fin, nb_postes: 1, taux_horaire: 12.5 })).data; await ag.post(`/missions/${m.id}/diffuser`, { interims: dest, canaux: ['sms'] }); return m; };

  // 1. Annulation par l'employeur : l'intérimaire retenu est remis à disposition et reçoit la mission du même créneau
  const A = await nouvelle('18:00', '23:00', [i1.id, i2.id]);
  const B = await nouvelle('19:00', '22:00', [i3.id]);
  const Z = await nouvelle('08:00', '11:00', [i3.id]);
  await I1.post(`/missions/${A.id}/repondre`, { accepte: true });
  await CL.post(`/missions/${A.id}/decision`, { interim_id: i1.id, accepte: true });
  assert.equal(await etat(I1, A.id), 'signature');
  assert.equal((await CL.post(`/missions/${A.id}/annuler`, {})).status, 400, 'motif obligatoire pour l\'employeur');
  assert.equal((await I1.post(`/missions/${A.id}/annuler`, { motif: 'x' })).status, 403);
  const an = (await CL.post(`/missions/${A.id}/annuler`, { motif: 'Baisse d\'activité : réservation annulée' })).data;
  assert.equal(an.remis_a_disposition, 1); assert.equal(an.alternatives, 1);
  const vuI1 = (await I1.get('/missions')).data;
  assert.equal(vuI1.find(x => x.id === A.id).etat, 'annulee');
  assert.match(vuI1.find(x => x.id === A.id).motif_annulation, /Baisse/);
  assert.equal(vuI1.find(x => x.id === B.id)?.etat, 'a_repondre', 'mission du même créneau proposée');
  assert.equal(vuI1.find(x => x.id === Z.id), undefined, 'autre créneau non proposé');
  const notifs = (await I1.get('/notifications')).data.map(n => n.message).join(' | ');
  assert.match(notifs, /remis\(e\) à disposition/); assert.match(notifs, /même créneau/);
  assert.equal((await I1.get('/contrats')).data.find(k => k.mission_id === A.id).statut, 'annule');
  assert.match((await ag.get('/notifications')).data.map(n => n.message).join(' | '), /a annulé la mission/);

  // 2. Désistement : place remise à disposition, alertes aux espaces déjà en contact
  const C = await nouvelle('12:00', '15:00', [i1.id, i2.id]);
  await I1.post(`/missions/${C.id}/repondre`, { accepte: true });
  await CL.post(`/missions/${C.id}/decision`, { interim_id: i1.id, accepte: true });
  assert.equal(await etat(I2, C.id), 'pourvue');
  assert.equal((await I1.post(`/missions/${C.id}/desister`, {})).status, 400, 'motif obligatoire');
  assert.equal((await I1.post(`/missions/${C.id}/desister`, { motif: 'Maladie' })).data.etat, 'desiste');
  assert.equal((await CL.get('/missions')).data.find(x => x.id === C.id).statut, 'diffusee', 'mission remise à disposition');
  assert.equal(await etat(I2, C.id), 'a_repondre', 'les autres intérimaires peuvent accepter');
  assert.match((await I2.get('/notifications')).data.map(n => n.message).join(' | '), /place s'est libérée/);
  assert.match((await CL.get('/notifications')).data.map(n => n.message).join(' | '), /Désistement : Alain Test/);
  const env = (await ag.get('/missions')).data.find(x => x.id === C.id).envois.find(e => e.interim_id === i1.id);
  assert.equal(env.desistement.motif, 'Maladie');
  assert.equal((await I1.post(`/missions/${C.id}/repondre`, { accepte: true })).status, 409, 'pas de retour après désistement');

  // 3. Indisponibilité imprévue : jours marqués, missions en conflit renvoyées
  await I2.post(`/missions/${C.id}/repondre`, { accepte: true });
  await CL.post(`/missions/${C.id}/decision`, { interim_id: i2.id, accepte: true });
  assert.equal((await I2.post('/indisponible', { debut: plusJours(-1) })).status, 400);
  const ind = (await I2.post('/indisponible', { debut: jour, fin: plusJours(4), motif: 'Imprévu familial' })).data;
  assert.equal(ind.jours, 2); assert.deepEqual(ind.conflits.map(x => x.id), [C.id]);
  assert.match((await ag.get('/notifications')).data.map(n => n.message).join(' | '), /Berthe Test se déclare indisponible/);

  // 4. Statistiques : chaque profil reçoit les siennes
  const sa = (await ag.get('/stats')).data, sc = (await CL.get('/stats')).data, si = (await I2.get('/stats')).data;
  assert.equal(sa.profil, 'agence'); assert.ok('ca_ht' in sa.cles && sa.series.ca_ht.length === 6);
  assert.ok(sa.cles.desistements >= 1, 'désistement du mois compté');
  assert.equal(sc.profil, 'client'); assert.equal(sc.cles.ca_ht, undefined); assert.ok(sc.cles.annulations_an >= 1);
  assert.equal(si.profil, 'interim'); assert.equal(si.cles.marge, undefined);
});
