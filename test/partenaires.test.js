'use strict';
// Tests : partenariats avec des agences ETT (apport d'affaires en sourcing).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-partenaires-'));
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

const pdf = () => new Blob(['%PDF-1.4 cv'], { type: 'application/pdf' });
async function postuler(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ consentement: '1', ville: 'Lyon', situation: 'Étudiant(e)', nationalite_cat: 'Française', telephone: '0600000009', ...champs })) f.append(k, v);
  f.append('cv', pdf(), 'cv.pdf');
  return (await fetch(base + '/public/candidature', { method: 'POST', headers: { 'X-CHR': '1' }, body: f })).status;
}

test('partenaire : création, accès cloisonné, besoins, présentation, placement et commission', async () => {
  const ag = await agence();
  // Partenaire et accès
  let r = await ag.post('/partenaires', { raison_sociale: 'Intérim Plus Lyon', contact: 'Paul Martin', email: 'paul@interimplus.fr', commission_type: 'forfait', commission_valeur: '350' });
  assert.equal(r.status, 201); const pid = r.data.id; assert.match(r.data.convention_numero, /^AA-\d{4}-0001$/);
  r = await ag.post('/acces', { type: 'partenaire', id: pid }); assert.equal(r.status, 201); assert.equal(r.data.profil, 'partenaire');
  const pa = await connecte(r.data.username, r.data.password, 'Partenaire2026');
  r = await pa.get('/me'); assert.equal(r.data.profil, 'partenaire'); assert.equal(r.data.partenaire.raison_sociale, 'Intérim Plus Lyon');
  // Cloisonnement : aucune donnée de l'agence
  for (const u of ['/missions', '/candidats', '/clients', '/interimaires', '/notifications', '/partenaires', '/factures', '/stats']) assert.equal((await pa.get(u)).status, 403, u);
  assert.equal((await pa.post('/missions', {})).status, 403);
  // Besoin de recrutement déposé par le partenaire
  r = await pa.post('/partenaire/demandes', { poste: 'Serveur', ville: 'Lyon', nb_postes: 1, date_debut: plusJours(5), type_contrat: 'CDD', job_boards: ['Indeed', 'Inconnu'] });
  assert.equal(r.status, 201); const did = r.data.id; assert.deepEqual(r.data.job_boards, ['Indeed']);
  assert.ok((await ag.get('/notifications')).data.some(n => /Nouveau besoin du partenaire Intérim Plus Lyon/.test(n.message)));
  assert.equal((await ag.get('/partenaires-demandes')).data[0].raison_sociale, 'Intérim Plus Lyon');
  // Candidat venu d'une annonce Indeed (lien ?src=indeed), sans accord de partage
  assert.equal(await postuler({ prenom: 'Lina', nom: 'Roy', source: 'indeed' }), 201);
  const c = (await ag.get('/candidats')).data.find(x => x.prenom === 'Lina');
  assert.equal(c.source, 'Indeed'); assert.equal(c.partage_partenaires, 0);
  r = await ag.post('/presentations', { partenaire_id: pid, demande_id: did, candidat_id: c.id });
  assert.equal(r.status, 400); assert.match(r.data.error, /accord/);
  r = await ag.post('/presentations', { partenaire_id: pid, demande_id: did, candidat_id: c.id, consentement: true });
  assert.equal(r.status, 201); const xid = r.data.id; assert.equal(r.data.source, 'Indeed'); assert.equal(r.data.poste, 'Serveur');
  assert.equal((await ag.post('/presentations', { partenaire_id: pid, demande_id: did, candidat_id: c.id, consentement: true })).status, 409);
  // Le partenaire voit le candidat et son CV, pas les notes internes
  r = await pa.get('/partenaire/presentations'); assert.equal(r.data.length, 1); assert.equal(r.data[0].a_cv, true); assert.equal(r.data[0].notes_agence, undefined);
  assert.equal((await pa.get(`/partenaire/presentations/${xid}/cv`)).status, 200);
  assert.equal((await agent().get(`/partenaire/presentations/${xid}/cv`)).status, 401);
  // Placement : commission forfaitaire due, besoin pourvu
  r = await pa.put(`/partenaire/presentations/${xid}`, { statut: 'placee', retour_partenaire: 'Embauchée en CDD' });
  assert.equal(r.status, 200); assert.equal(r.data.commission_montant, 350); assert.equal(r.data.commission_statut, 'a_facturer'); assert.ok(r.data.date_placement);
  assert.equal((await pa.get('/partenaire/demandes')).data[0].statut, 'pourvue');
  assert.ok((await ag.get('/notifications')).data.some(n => /Lina Roy placé/.test(n.message)));
  // Facturation, paiement, facture visible par le partenaire
  r = await ag.post(`/presentations/${xid}/facturer`); assert.equal(r.status, 200); assert.match(r.data.facture_numero, /^COM-\d{4}-0001$/);
  assert.equal((await pa.put(`/partenaire/presentations/${xid}`, { statut: 'refusee' })).status, 409);
  r = await ag.post(`/presentations/${xid}/payee`); assert.equal(r.data.commission_statut, 'payee');
  r = await pa.get('/partenaire/commissions'); assert.equal(r.data.totaux.payee, 350);
  assert.equal((await pa.get(`/partenaire/factures/${xid}`)).status, 200);
  // Statistiques par job board
  const jb = (await ag.get('/partenaires')).data.job_boards.find(j => j.source === 'Indeed');
  assert.equal(jb.places, 1); assert.equal(jb.commissions, 350);
  // Convention signée en ligne ; modification des conditions financières : nouvelle convention à signer
  assert.equal((await pa.post('/partenaire/convention/signer', { nom: 'Paul Martin, gérant' })).status, 400);
  r = await pa.post('/partenaire/convention/signer', { nom: 'Paul Martin, gérant', accepte: true }); assert.ok(r.data.convention_signee_le);
  r = await ag.put(`/partenaires/${pid}`, { commission_type: 'pourcentage', commission_valeur: 8 }); assert.equal(r.data.nouvelle_convention, true); assert.equal(r.data.convention_signee_le, null);
  // Suspension : le partenaire est déconnecté et ne peut plus se connecter
  await ag.put(`/partenaires/${pid}`, { statut: 'suspendu' });
  assert.equal((await pa.get('/partenaire/tableau')).status, 401);
});

test('commission au pourcentage : en attente du chiffre d\'affaires déclaré par le partenaire', async () => {
  const ag = await agence();
  const pid = (await ag.post('/partenaires', { raison_sociale: 'Staff Hôtel', commission_type: 'pourcentage', commission_valeur: '10' })).data.id;
  assert.equal((await ag.post('/partenaires', { raison_sociale: 'X', commission_type: 'pourcentage', commission_valeur: 120 })).status, 400);
  // Candidat saisi par l'agence depuis un job board, avec accord de partage
  const f = new FormData(); for (const [k, v] of Object.entries({ prenom: 'Omar', nom: 'Diallo', telephone: '0611111111', ville: 'Lyon', poste: 'Cuisinier', source: 'HelloWork', partage: '1' })) f.append(k, v);
  f.append('cv', pdf(), 'cv.pdf');
  const login = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CHR': '1' }, body: JSON.stringify({ username: 'admin', password: 'Agence2026' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const r0 = await fetch(base + '/candidats/sourcing', { method: 'POST', headers: { 'X-CHR': '1', Cookie: cookie }, body: f });
  assert.equal(r0.status, 201); const cid = (await r0.json()).id;
  const c = (await ag.get('/candidats')).data.find(x => x.id === cid); assert.equal(c.source, 'HelloWork'); assert.equal(c.partage_partenaires, 1);
  let r = await ag.post('/presentations', { partenaire_id: pid, candidat_id: cid }); assert.equal(r.status, 201);
  r = await ag.put(`/presentations/${r.data.id}`, { statut: 'placee' }); assert.equal(r.data.commission_statut, 'attente_ca');
  assert.equal((await ag.post(`/presentations/${r.data.id}/facturer`)).status, 409);
  r = await ag.put(`/presentations/${r.data.id}`, { montant_ca: '4 200,50' }); assert.equal(r.data.commission_montant, 420.05); assert.equal(r.data.commission_statut, 'a_facturer');
  // Un partenaire ne voit pas les présentations d'un autre
  const acc = (await ag.post('/acces', { type: 'partenaire', id: pid })).data;
  const pa = await connecte(acc.username, acc.password, 'Partenaire2026');
  const autre = one('SELECT id FROM presentations WHERE partenaire_id != ? LIMIT 1', pid).id;
  assert.equal((await pa.put(`/partenaire/presentations/${autre}`, { statut: 'entretien' })).status, 404);
  assert.equal((await pa.get(`/partenaire/factures/${autre}`)).status, 404);
  assert.equal((await pa.get('/partenaire/presentations')).data.length, 1);
});
