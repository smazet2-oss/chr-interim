'use strict';
// Tests : décisions sur les candidatures, notes et alertes.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-avis-'));
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


test('candidatures : accepter (rendez-vous sous 48 h) ou refuser, par e-mail', async () => {
  const ag = await agence(), pub = agent();
  const fd = champs => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.append(k, v); return f; };
  const postuler = async c => (await fetch(base + '/public/candidature', { method: 'POST', headers: { 'X-CHR': '1' }, body: fd({ consentement: '1', ville: 'Lyon', ...c }) })).status;
  assert.equal(await postuler({ prenom: 'Nora', nom: 'Bel', telephone: '0600000001', email: 'nora@exemple.fr', poste_principal: 'Serveur', postes: 'Serveur', vehicule: 'oui' }), 201);
  assert.equal(await postuler({ prenom: 'Paul', nom: 'Roy', telephone: '0600000002' }), 201);
  void pub;
  const [paul, nora] = (await ag.get('/candidats')).data;
  assert.equal(nora.reponses.vehicule, true, 'véhiculée'); assert.equal(paul.reponses.vehicule, undefined);
  const m = (await ag.get(`/candidats/${nora.id}/modele?decision=acceptee`)).data;
  assert.match(m.texte, /48 heures/); assert.equal(m.email, 'nora@exemple.fr');
  const rdv = new Date(Date.now() + 26 * 3600e3).toISOString().slice(0, 16);
  const r = (await ag.post(`/candidats/${nora.id}/decision`, { decision: 'acceptee', rdv })).data;
  assert.equal(r.statut, 'entretien'); assert.equal(r.envois[0].canal, 'mail');
  const n2 = (await ag.get('/candidats')).data.find(x => x.id === nora.id);
  assert.equal(n2.decision, 'acceptee'); assert.equal(n2.rdv_propose, rdv); assert.equal(n2.date_relance, rdv.slice(0, 10));
  // Refus : pas d'e-mail connu, SMS
  const rr = (await ag.post(`/candidats/${paul.id}/decision`, { decision: 'refusee' })).data;
  assert.equal(rr.statut, 'refuse'); assert.equal(rr.envois[0].canal, 'sms');
  const journal = JSON.stringify((await ag.get('/journal')).data);
  assert.match(journal, /rencontrer dans les 48 heures/); assert.match(journal, /pas en mesure/);

  // Candidature d'établissement
  assert.equal((await pub.post('/public/contact', { consentement: true, etablissement: 'Bistrot Test', repondant: 'Léa Blanc, gérante', email: 'bistrot@exemple.fr', vehicule: 'oui' })).status, 201);
  const p = (await ag.get('/prospects')).data[0];
  assert.equal(p.reponses.vehicule, true, 'besoin d\'intérimaires véhiculés');
  assert.equal((await ag.post(`/prospects/${p.id}/decision`, { decision: 'acceptee', texte: 'Message personnalisé : rendez-vous proposé.' })).data.statut, 'en_discussion');
  assert.match(JSON.stringify((await ag.get('/journal')).data), /Message personnalisé/);
  const p2 = (await ag.get('/prospects')).data[0];
  assert.equal(p2.decision, 'acceptee');
  assert.equal((await ag.post(`/prospects/${p.id}/decision`, { decision: 'refusee' })).data.statut, 'perdu');
});

test('note de l\'établissement à la confirmation des heures, avis et alerte note basse', async () => {
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Brasserie Notée' })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data, CL = await connecte(ca.username, ca.password, 'Client2026X');
  const i = (await ag.post('/interimaires', { prenom: 'Zoé', nom: 'Test', poste: 'Serveur' })).data;
  const ia = (await ag.post('/acces', { type: 'interim', id: i.id })).data, IN = await connecte(ia.username, ia.password, 'Zoe2026Xx');
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: plusJours(2), debut: '18:00', fin: '22:00', nb_postes: 1, taux_horaire: 12.5 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  await IN.post(`/missions/${m.id}/repondre`, { accepte: true });
  await CL.post(`/missions/${m.id}/decision`, { interim_id: i.id, accepte: true });
  run('UPDATE missions SET date = ? WHERE id = ?', plusJours(-1), m.id);
  const h = (await IN.get('/heures')).data[0];
  assert.equal((await IN.post(`/heures/${h.id}/confirmer`, {})).status, 400, 'note obligatoire');
  assert.equal((await IN.post(`/heures/${h.id}/confirmer`, { note: 2, points: ['Horaires non respectés', 'inventé'], commentaire: 'Arrivé, personne pour m\'accueillir.' })).status, 200);
  const av = (await ag.get(`/avis?client_id=${c.id}`)).data;
  assert.equal(av.moyenne, 2); assert.equal(av.basses, 1); assert.equal(av.avis[0].axe, 'Horaires non respectés');
  assert.match((await ag.get('/notifications')).data.map(n => n.message).join(' | '), /Note basse : Brasserie Notée noté 2\/5/);
  // L'employeur note l'intérimaire après validation
  await CL.post(`/heures/${h.id}/valider`, {});
  await CL.post(`/heures/${h.id}/evaluer`, { note: 5, commentaire: 'Excellent service.' });
  const ai = (await ag.get(`/avis?interim_id=${i.id}`)).data;
  assert.equal(ai.moyenne, 5); assert.equal(ai.repartition[0].nombre, 1);
  assert.equal((await CL.get(`/avis?client_id=${c.id}`)).status, 403);
  const st = (await ag.get('/stats')).data.notes;
  assert.ok(st.clients.basses >= 1 && st.basses_mois >= 1); assert.equal(st.clients_bas[0].valeur, 2);
});
