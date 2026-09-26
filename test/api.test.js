'use strict';
// Tests de bout en bout de l'API : npm test
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

/** Petit client HTTP qui garde son cookie de session. */
function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), get cookie() { return cookie; } };
}
async function connecte(username, password, nouveau) {
  const a = agent();
  const r = await a.post('/login', { username, password });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (r.data.must_change) assert.equal((await a.post('/password', { actuel: password, nouveau })).status, 200);
  return a;
}
const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('circuit complet : accès, mission, verrou, documents, heures, facture', async () => {
  // Première connexion de l'agence : changement de mot de passe obligatoire.
  const ag = agent();
  assert.equal((await ag.post('/login', { username: 'admin', password: 'mauvais' })).status, 401);
  const l = await ag.post('/login', { username: 'admin', password: 'Admin-Temp1' });
  assert.equal(l.data.must_change, true);
  assert.equal((await ag.get('/clients')).status, 403, 'bloqué tant que le mot de passe n\'est pas changé');
  assert.equal((await ag.post('/password', { actuel: 'Admin-Temp1', nouveau: 'faible' })).status, 400);
  assert.equal((await ag.post('/password', { actuel: 'Admin-Temp1', nouveau: 'Agence2026' })).status, 200);

  // Fiches et accès.
  const c = (await ag.post('/clients', { nom: 'Brasserie Test', secteur: 'Restauration', coefficient: 2 })).data;
  const i1 = (await ag.post('/interimaires', { prenom: 'Yanis', nom: 'Benali', poste: 'Serveur', telephone: '0600000001' })).data;
  const i2 = (await ag.post('/interimaires', { prenom: 'Lucas', nom: 'Martin', poste: 'Serveur' })).data;
  const i3 = (await ag.post('/interimaires', { prenom: 'Inès', nom: 'Garcia', poste: 'Serveuse' })).data;
  const accC = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const acc1 = (await ag.post('/acces', { type: 'interim', id: i1.id })).data;
  const acc2 = (await ag.post('/acces', { type: 'interim', id: i2.id })).data;
  const acc3 = (await ag.post('/acces', { type: 'interim', id: i3.id })).data;
  assert.equal(acc1.username, 'yanis.benali');
  assert.equal(acc3.username, 'ines.garcia');
  assert.equal((await ag.post('/acces', { type: 'interim', id: i1.id })).status, 409);

  const cl = await connecte(accC.username, accC.password, 'Client2026');
  const y = await connecte(acc1.username, acc1.password, 'Yanis2026');
  const lu = await connecte(acc2.username, acc2.password, 'Lucas2026');
  const ines = await connecte(acc3.username, acc3.password, 'Ines2026x');

  // Droits : ni l'employeur ni l'intérimaire ne peuvent agir comme l'agence.
  assert.equal((await cl.post('/clients', { nom: 'X' })).status, 403);
  assert.equal((await y.post('/acces', { type: 'interim', id: i2.id })).status, 403);
  assert.equal((await y.get('/factures')).status, 403);
  assert.equal((await cl.put(`/interimaires/${i1.id}`, { poste: 'Chef' })).status, 403);

  // L'employeur crée une demande, l'agence la diffuse à 3 intérimaires.
  const m = (await cl.post('/missions', { poste: 'Serveur', date: plusJours(5), debut: '18:00', fin: '23:30', nb_postes: 1 })).data;
  assert.equal(m.statut, 'nouvelle');
  assert.equal((await cl.post(`/missions/${m.id}/diffuser`, { interims: [i1.id], canaux: ['sms'] })).status, 403);
  const d = await ag.post(`/missions/${m.id}/diffuser`, { interims: [i1.id, i2.id, i3.id], canaux: ['sms', 'whatsapp'], taux_horaire: 12.5 });
  assert.equal(d.data.envoyes, 3);

  const etat = async (a) => (await a.get('/missions')).data.find(x => x.id === m.id).etat;
  assert.equal(await etat(y), 'a_repondre');
  assert.equal((await y.get('/notifications')).data.length, 1);

  // Yanis accepte : la mission (1 place) est complète pour les autres.
  assert.equal((await y.post(`/missions/${m.id}/repondre`, { accepte: true })).status, 200);
  assert.equal(await etat(y), 'en_attente');
  assert.equal(await etat(lu), 'complet');
  assert.equal((await lu.post(`/missions/${m.id}/repondre`, { accepte: true })).status, 409);

  // L'employeur refuse Yanis : la place se libère, Yanis reste « en attente ».
  assert.equal((await cl.post(`/missions/${m.id}/decision`, { interim_id: i1.id, accepte: false })).status, 200);
  assert.equal(await etat(y), 'en_attente');
  assert.equal(await etat(lu), 'a_repondre');
  assert.equal((await lu.post(`/missions/${m.id}/repondre`, { accepte: true })).status, 200);
  assert.equal(await etat(ines), 'complet');

  // Documents de l'employeur, puis validation de Lucas : verrou et documents envoyés.
  const fd = new FormData();
  fd.append('categorie', 'Règlement intérieur');
  fd.append('fichier', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'Reglement.pdf');
  const up = await fetch(base + '/documents', { method: 'POST', headers: { 'X-CHR': '1', Cookie: cl.cookie }, body: fd });
  assert.equal(up.status, 201);
  const docId = (await up.json()).id;
  const bad = new FormData(); bad.append('fichier', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
  assert.equal((await fetch(base + '/documents', { method: 'POST', headers: { 'X-CHR': '1', Cookie: cl.cookie }, body: bad })).status, 400);
  const dl = async a => (await fetch(`${base}/documents/${docId}/fichier`, { headers: { Cookie: a.cookie } })).status;
  assert.equal(await dl(lu), 404, 'pas de documents avant confirmation');
  assert.equal((await cl.post(`/missions/${m.id}/decision`, { interim_id: i2.id, accepte: true })).data.verrouillee, true);
  // Places pourvues : contrat à signer par l'intérimaire et l'employeur, la mission n'est validée qu'ensuite.
  assert.equal(await etat(lu), 'signature');
  const kLu = (await lu.get('/contrats')).data.find(x => x.mission_id === m.id);
  assert.equal((await lu.post(`/contrats/${kLu.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: `${kLu.prenom} ${kLu.interim_nom}` })).data.mission_validee, false);
  assert.equal(await etat(lu), 'signature', 'employeur pas encore signé');
  assert.equal((await cl.post(`/contrats/${kLu.id}/signer`, { accepte: true, mention: 'lu et approuve', nom: 'Marc Leroy, gérant' })).data.mission_validee, true);
  assert.ok((await cl.get('/missions')).data.find(x => x.id === m.id).validee_le);
  assert.equal(await etat(lu), 'confirmee');
  assert.equal(await etat(y), 'non_retenu');
  assert.equal(await etat(ines), 'pourvue');
  assert.equal((await ines.post(`/missions/${m.id}/repondre`, { accepte: true })).status, 409);
  const mLu = (await lu.get('/missions')).data.find(x => x.id === m.id);
  assert.ok(mLu.documents.some(x => x.nom === 'Contrat de mission'));
  assert.ok(mLu.documents.some(x => x.nom === 'Reglement.pdf'));
  assert.equal(await dl(lu), 200, 'documents accessibles après confirmation');
  assert.equal(await dl(y), 404, 'intérimaire non retenu : pas d\'accès');

  // Heures : relevé créé au verrouillage, pas confirmable avant la date.
  const h = (await lu.get('/heures')).data[0];
  assert.equal(h.heures_prevues, 5.5);
  assert.equal((await lu.post(`/heures/${h.id}/confirmer`, {})).status, 409);
  assert.equal((await y.post(`/heures/${h.id}/confirmer`, {})).status, 404, 'un autre intérimaire ne voit pas ce relevé');

  // Journal des envois : messages simulés (aucun canal configuré).
  const j = (await ag.get('/journal')).data;
  assert.ok(j.length >= 6 && j.every(x => ['simule', 'echec'].includes(x.statut)));
});

test('verrouillage des comptes désactivés et réinitialisation', async () => {
  const ag = await connecte('admin', 'Agence2026');
  const comptes = (await ag.get('/acces')).data;
  const lucas = comptes.find(u => u.username === 'lucas.martin');
  await ag.post(`/acces/${lucas.id}/toggle`);
  assert.equal((await agent().post('/login', { username: 'lucas.martin', password: 'Lucas2026' })).status, 403);
  const r = (await ag.post(`/acces/${lucas.id}/reset`)).data;
  const a = agent();
  const l = await a.post('/login', { username: 'lucas.martin', password: r.password });
  assert.equal(l.status, 200);
  assert.equal(l.data.must_change, true);
});
