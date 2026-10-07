'use strict';
// Tests : relances (contrats non signés, factures échues) et prospects (page publique, visites terrain).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-rel-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin, relances } = require('../src/server');
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

test('relances : contrat non signé et facture échue', async () => {
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Brasserie Relance', email: 'resto@exemple.fr', telephone: '0478000000' })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const CL = await connecte(ca.username, ca.password, 'Client2026X');
  const i = (await ag.post('/interimaires', { prenom: 'Rémi', nom: 'Test', poste: 'Serveur', telephone: '0612345678', email: 'remi@exemple.fr' })).data;
  const ia = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const IN = await connecte(ia.username, ia.password, 'Interim2026X');
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: plusJours(5), debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 12.5 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  await IN.post(`/missions/${m.id}/repondre`, { accepte: true });
  await CL.post(`/missions/${m.id}/decision`, { interim_id: i.id, accepte: true });
  const k = (await ag.get('/contrats')).data[0];
  assert.equal(k.statut, 'a_signer');

  // Relance manuelle : les deux parties sont relancées
  assert.deepEqual((await ag.post(`/contrats/${k.id}/relancer`)).data.envoyes, ['intérimaire', 'employeur']);
  assert.equal((await CL.post(`/contrats/${k.id}/relancer`)).status, 403);
  // L'intérimaire signe : seul l'employeur est relancé ensuite
  await IN.post(`/contrats/${k.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: 'Rémi Test' });
  assert.deepEqual((await ag.post(`/contrats/${k.id}/relancer`)).data.envoyes, ['employeur']);
  // Relance automatique : rien avant le délai, puis relance une fois le délai passé
  assert.equal((await relances.tourner()).contrats, 0);
  run('UPDATE contrats SET relance_le = datetime(\'now\', \'-25 hours\') WHERE id = ?', k.id);
  assert.equal((await relances.tourner()).contrats, 1);
  assert.equal(one('SELECT nb_relances FROM contrats WHERE id = ?', k.id).nb_relances, 3);
  // Plafond atteint (3) : plus de relance automatique
  run('UPDATE contrats SET relance_le = datetime(\'now\', \'-25 hours\') WHERE id = ?', k.id);
  assert.equal((await relances.tourner()).contrats, 0);
  const hist = (await ag.get('/relances')).data;
  assert.ok(hist.length >= 4 && hist.every(r => r.numero === k.numero));
  assert.ok((await CL.get('/notifications')).data.some(n => /Relance : contrat/.test(n.message)));

  // Facture échue relancée
  const f = run('INSERT INTO factures (numero, client_id, debut, fin, montant_ht, echeance, tva_taux) VALUES (?,?,?,?,?,?,20)', 'F-TEST-1', c.id, plusJours(-40), plusJours(-30), 100, plusJours(-2)).lastInsertRowid;
  assert.equal((await relances.tourner()).factures, 1);
  assert.equal((await relances.tourner()).factures, 0, 'pas avant le délai de relance');
  assert.deepEqual((await ag.post(`/factures/${f}/relancer`)).data.envoyes, ['employeur']);
  await ag.post(`/factures/${f}/payee`);
  assert.equal((await ag.post(`/factures/${f}/relancer`)).status, 409);
  // Désactivation des relances automatiques
  await ag.put('/parametres', { valeurs: { relances_auto: 'non' } });
  run('UPDATE contrats SET nb_relances = 0 WHERE id = ?', k.id);
  assert.equal((await relances.tourner()).contrats, 0);
  await ag.put('/parametres', { valeurs: { relances_auto: 'oui' } });
});

test('prospects : page publique et visite terrain', async () => {
  const pub = agent();
  const q = (await pub.get('/public/questionnaire')).data;
  assert.ok(q.questionnaire.length >= 5);
  const base = { etablissement: 'Le Petit Bouchon', repondant: 'Anne Roux, gérante', telephone: '0472000000', type_etab: 'Brasserie / restauration rapide',
    postes: ['Serveur / chef de rang', 'Commis / plongeur', 'Inventé'], coefficient: 'Entre 1,95 et 2,10', message: 'Besoin de 2 extras le samedi.' };
  assert.equal((await pub.post('/public/contact', base)).status, 400, 'consentement obligatoire');
  assert.equal((await pub.post('/public/contact', { ...base, consentement: true, coefficient: 'Gratuit' })).status, 400, 'option inconnue refusée');
  assert.equal((await pub.post('/public/contact', { ...base, consentement: true })).status, 201);
  assert.equal((await pub.post('/public/contact', { consentement: true, site_web: 'spam', etablissement: 'x' })).status, 201, 'robot ignoré sans erreur');
  assert.equal((await pub.get('/prospects')).status, 401);

  const ag = await agence();
  let L = (await ag.get('/prospects')).data;
  assert.equal(L.length, 1);
  assert.deepEqual(L[0].reponses.postes, ['Serveur / chef de rang', 'Commis / plongeur']);
  assert.equal(L[0].source, 'site');
  // Visite terrain saisie par l'agence, avec date de relance
  const v = (await ag.post('/prospects', { etablissement: 'Hôtel du Parc', repondant: 'M. Blanc', email: 'parc@exemple.fr', type_etab: 'Hôtel / hôtel-restaurant', accord: 'oral', enqueteur: 'Claire', date_relance: plusJours(0) })).data;
  assert.equal(v.statut, 'a_relancer');
  assert.equal((await ag.put(`/prospects/${v.id}`, { statut: 'en_discussion', notes_agence: 'Rappeler après la saison.' })).data.statut, 'en_discussion');
  // Conversion en client : coefficient par défaut
  const cid = (await ag.post(`/prospects/${v.id}/client`)).data.client_id;
  const cli = (await ag.get('/clients')).data.find(x => x.id === cid);
  assert.equal(cli.nom, 'Hôtel du Parc'); assert.equal(cli.coefficient, 1.45); assert.equal(cli.secteur, 'Hôtellerie');
  assert.equal((await ag.post(`/prospects/${v.id}/client`)).status, 409);
  // Suppression (RGPD)
  assert.equal((await ag.del(`/prospects/${L[0].id}`)).status, 200);
  L = (await ag.get('/prospects')).data;
  assert.equal(L.length, 1);
});

test('candidatures : page publique avec CV, suivi et inscription', async () => {
  const envoi = async (champs, cv) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) for (const x of [].concat(v)) fd.append(k, x);
    if (cv) fd.append('cv', new Blob([cv.contenu], { type: cv.type }), cv.nom);
    const r = await fetch(base + '/public/candidature', { method: 'POST', headers: { 'X-CHR': '1' }, body: fd });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const pub = agent();
  assert.ok((await pub.get('/public/candidature')).data.questionnaire.length >= 4);
  const c = { prenom: 'Sarah', nom: 'Lopez', telephone: '0655443322', ville: 'Lyon 7e', postes: ['Serveur', 'Barman'], poste_principal: 'Barman', experience: 'Moins d\'un an', creneaux: ['Le soir', 'Le week-end'], situation: 'Autre', situation_autre: 'Intermittente du spectacle' };
  assert.equal((await envoi(c)).status, 400, 'consentement obligatoire');
  assert.equal((await envoi({ ...c, consentement: '1' }, { contenu: 'MZ exécutable', type: 'application/pdf', nom: 'cv.pdf' })).status, 400, 'faux PDF refusé');
  const pdf = { contenu: '%PDF-1.4 cv', type: 'application/pdf', nom: 'CV Sarah.pdf' };
  assert.equal((await envoi({ ...c, consentement: '1', ville: '' }, pdf)).status, 400, 'ville obligatoire');
  const sansCv = await envoi({ ...c, consentement: '1' });
  assert.equal(sansCv.status, 400, 'CV obligatoire'); assert.match(sansCv.data.error, /CV/);
  const { situation, situation_autre, ...sansSituation } = c; void situation; void situation_autre;
  assert.equal((await envoi({ ...sansSituation, consentement: '1' }, pdf)).status, 400, 'situation obligatoire');
  assert.equal((await envoi({ ...c, consentement: '1', situation: 'Rentier' }, pdf)).status, 400, 'situation inconnue refusée');
  assert.equal((await envoi({ ...c, consentement: '1' }, { contenu: '%PDF-1.4 cv', type: 'application/pdf', nom: 'CV Sarah.pdf' })).status, 201);
  assert.equal((await pub.get('/candidats')).status, 401);

  const ag = await agence();
  const L = (await ag.get('/candidats')).data;
  assert.equal(L.length, 1); assert.equal(L[0].poste, 'Barman'); assert.equal(L[0].reponses.situation, 'Autre'); assert.equal(L[0].reponses.situation_autre, 'Intermittente du spectacle'); assert.deepEqual(L[0].reponses.creneaux, ['Le soir', 'Le week-end']);
  const cv = await fetch(`${base}/candidats/${L[0].id}/cv`, { headers: { Cookie: '' } });
  assert.equal(cv.status, 401, 'CV réservé à l\'agence');
  assert.equal((await ag.put(`/candidats/${L[0].id}`, { statut: 'entretien', date_relance: plusJours(1) })).data.statut, 'entretien');
  const iid = (await ag.post(`/candidats/${L[0].id}/interimaire`)).data.interim_id;
  const fiche = (await ag.get('/interimaires')).data.find(x => x.id === iid);
  assert.equal(fiche.poste, 'Barman'); assert.equal(fiche.secteur, 'Bar'); assert.equal(fiche.ville, 'Lyon 7e');
  assert.equal((await ag.get('/candidats')).data[0].statut, 'inscrit');
  assert.equal((await ag.post(`/candidats/${L[0].id}/interimaire`)).status, 409);
  assert.equal((await ag.del(`/candidats/${L[0].id}`)).status, 200);
});
