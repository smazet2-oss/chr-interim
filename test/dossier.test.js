'use strict';
// Tests : expériences, pièces du dossier, contrats, fiches de paie.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-dossier-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const { run } = require('../src/db');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body, form) => {
    const res = await fetch(base + url, {
      method, headers: form ? { 'X-CHR': '1', Cookie: cookie } : { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let data = text; try { data = JSON.parse(text); } catch { /* HTML */ }
    return { status: res.status, data };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), del: u => call('DELETE', u), upload: (u, fd) => call('POST', u, null, fd) };
}
async function connecte(username, password, nouveau) {
  const a = agent();
  const r = await a.post('/login', { username, password });
  assert.equal(r.status, 200);
  if (r.data.must_change) assert.equal((await a.post('/password', { actuel: password, nouveau })).status, 200);
  return a;
}
const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };
const pdf = (nom = 'doc.pdf') => { const fd = new FormData(); fd.append('fichier', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), nom); return fd; };

test('expériences, dossier légal, contrat et paie', async () => {
  const ag = await connecte('admin', 'Admin-Temp1', 'Agence2026');
  const c = (await ag.post('/clients', { nom: 'Hôtel Test', adresse: '1 place Bellecour', ville: 'Lyon' })).data;
  const i = (await ag.post('/interimaires', { prenom: 'Inès', nom: 'Garcia', poste: 'Serveuse', nationalite: 'Autre', date_naissance: '2000-05-01' })).data;
  const autre = (await ag.post('/interimaires', { prenom: 'Paul', nom: 'Roy', poste: 'Serveur' })).data;
  const a1 = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const a2 = (await ag.post('/acces', { type: 'interim', id: autre.id })).data;
  const ac = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const ines = await connecte(a1.username, a1.password, 'Ines2026x');
  const paul = await connecte(a2.username, a2.password, 'Paul2026x');
  const cl = await connecte(ac.username, ac.password, 'Client2026');

  // Expériences manuelles : ajout par l'intérimaire, pas sur la fiche d'un autre.
  assert.equal((await ines.post(`/interimaires/${i.id}/experiences`, { debut: '2022-01-01', fin: '2023-06-30', employeur: 'Café de la Gare', poste: 'Serveuse' })).status, 201);
  assert.equal((await ines.post(`/interimaires/${i.id}/experiences`, { debut: '2022-01-01', employeur: '', poste: 'X' })).status, 400);
  assert.equal((await paul.post(`/interimaires/${i.id}/experiences`, { debut: '2022-01-01', employeur: 'X', poste: 'Y' })).status, 404);
  assert.equal((await cl.get(`/interimaires/${i.id}/experiences`)).status, 403);

  // Dossier : nationalité hors UE → titre de séjour exigé.
  let d = (await ines.get(`/interimaires/${i.id}/pieces`)).data;
  assert.deepEqual(d.requises.sort(), ['domicile', 'identite', 'rib', 'secu', 'titre_sejour']);
  assert.equal(d.complet, false);
  const envoi = async (type, extra = {}) => { const fd = pdf(type + '.pdf'); fd.append('type', type); for (const [k, v] of Object.entries(extra)) fd.append(k, v); return ines.upload(`/interimaires/${i.id}/pieces`, fd); };
  assert.equal((await envoi('identite', { expire_le: '2001-01-01' })).status, 400, 'document expiré refusé');
  const exe = new FormData(); exe.append('type', 'rib'); exe.append('fichier', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'x.exe');
  assert.equal((await ines.upload(`/interimaires/${i.id}/pieces`, exe)).status, 400, 'format refusé');
  for (const t of ['identite', 'titre_sejour', 'secu', 'rib', 'domicile']) assert.equal((await envoi(t)).status, 201);
  d = (await ines.get(`/interimaires/${i.id}/pieces`)).data;
  assert.equal(d.complet, false, 'pièces à vérifier par l\'agence');
  assert.equal((await ines.post(`/pieces/${d.pieces[0].id}/statut`, { statut: 'valide' })).status, 403, 'seule l\'agence valide');
  assert.equal((await ag.post(`/pieces/${d.pieces[0].id}/statut`, { statut: 'refuse' })).status, 400, 'motif de refus obligatoire');
  for (const p of d.pieces) assert.equal((await ag.post(`/pieces/${p.id}/statut`, { statut: 'valide' })).status, 200);
  d = (await ines.get(`/interimaires/${i.id}/pieces`)).data;
  assert.equal(d.complet, true);
  assert.equal((await ines.del(`/pieces/${d.pieces[0].id}`)).status, 403, 'pièce validée : retrait réservé à l\'agence');
  assert.equal((await paul.get(`/pieces/${d.pieces[0].id}/fichier`)).status, 404, 'un autre intérimaire n\'y accède pas');
  assert.equal((await cl.get(`/pieces/${d.pieces[0].id}/fichier`)).status, 404, 'l\'employeur n\'y accède pas');

  // Mission verrouillée → ligne d'expérience automatique et contrat à signer.
  const m = (await cl.post('/missions', { poste: 'Serveuse', date: plusJours(3), debut: '12:00', fin: '16:00', nb_postes: 1 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  await ines.post(`/missions/${m.id}/repondre`, { accepte: true });
  assert.equal((await cl.post(`/missions/${m.id}/decision`, { interim_id: i.id, accepte: true })).data.verrouillee, true);
  const xp = (await ines.get(`/interimaires/${i.id}/experiences`)).data;
  const auto = xp.find(x => x.source === 'mission');
  assert.equal(auto.employeur, 'Hôtel Test');
  assert.equal((await ines.del(`/experiences/${auto.id}`)).status, 403, 'ligne de mission non supprimable par l\'intérimaire');
  const k = (await ines.get('/contrats')).data[0];
  assert.equal(k.statut, 'a_signer');
  assert.equal((await paul.get('/contrats')).data.length, 0);
  const doc = await ines.get(`/contrats/${k.id}/document`);
  assert.equal(doc.status, 200);
  assert.match(doc.data, /contrat de mission/i);
  assert.match(doc.data, /Hôtel Test/);
  assert.equal((await paul.get(`/contrats/${k.id}/document`)).status, 404);
  assert.equal((await ines.post(`/contrats/${k.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: 'Quelqu\'un' })).status, 400, 'nom exact exigé');
  assert.equal((await ines.post(`/contrats/${k.id}/signer`, { accepte: true, nom: 'ines garcia' })).status, 400, 'mention « Lu et approuvé » exigée');
  assert.equal((await ines.post(`/contrats/${k.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: 'ines garcia' })).status, 200);
  assert.equal((await ines.get('/contrats')).data[0].statut, 'a_signer', 'reste à signer par l\'employeur');
  // L'employeur voit le contrat sans les données personnelles de l'intérimaire, puis signe.
  const docClient = await cl.get(`/contrats/${k.id}/document`);
  assert.equal(docClient.status, 200); assert.match(docClient.data, /communiqué à l'agence uniquement/);
  assert.doesNotMatch(docClient.data, /01\/05\/2000/);
  assert.equal((await cl.post(`/contrats/${k.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: 'Directeur Hôtel Test' })).status, 200);
  assert.equal((await ines.get('/contrats')).data[0].statut, 'signe');
  assert.match((await ag.get(`/contrats/${k.id}/document`)).data, /Signé par toutes les parties/);
  assert.equal((await ines.post(`/contrats/${k.id}/signer`, { accepte: true, mention: 'Lu et approuvé', nom: 'Inès Garcia' })).status, 409);

  // Paie : on place la mission dans le passé. Heures non confirmées → alerte.
  const hier = plusJours(-1);
  run('UPDATE missions SET date = ? WHERE id = ?', hier, m.id);
  let enCours = (await ines.get('/paie/en-cours')).data;
  assert.equal(enCours.length, 1);
  assert.equal(enCours[0].bloquees[0].manque, 'Confirmation de vos heures');
  const hId = (await ines.get('/heures')).data[0].id;
  assert.equal((await ines.post(`/heures/${hId}/confirmer`, {})).status, 400, 'note de l\'établissement obligatoire');
  await ines.post(`/heures/${hId}/confirmer`, { note: 4 });
  enCours = (await ines.get('/paie/en-cours')).data;
  assert.equal(enCours[0].bloquees[0].manque, 'Validation par l\'employeur');
  // Fiche générée alors que les heures ne sont pas validées : aucune fiche.
  const debut = plusJours(-40), fin = plusJours(0);
  assert.equal((await ag.post('/bulletins/generer', { debut, fin })).data.crees, 0);
  await cl.post(`/heures/${hId}/valider`, {});
  assert.equal((await ag.post('/bulletins/generer', { debut, fin })).data.crees, 1);
  const b = (await ines.get('/bulletins')).data[0];
  assert.equal(b.heures, 4);
  assert.equal(b.brut, 48.08, 'taux par défaut du poste : SMIC 12,02 € × 4 h');
  assert.equal(b.statut, 'en_attente');
  assert.equal(b.bloquees.length, 0);
  assert.equal((await ines.get('/paie/en-cours')).data.length, 0, 'heures désormais sur une fiche');
  assert.equal((await ines.post(`/bulletins/${b.id}/payer`)).status, 403);
  assert.equal((await ag.upload(`/bulletins/${b.id}/fichier`, pdf('paie.pdf'))).status, 200);
  assert.equal((await ag.post(`/bulletins/${b.id}/payer`)).status, 200);
  assert.equal((await ines.get('/bulletins')).data[0].statut, 'paye');
  assert.equal((await paul.get(`/bulletins/${b.id}/fichier`)).status, 404);
  assert.equal((await ines.get(`/bulletins/${b.id}/fichier`)).status, 200);

  // Annulation : ligne d'expérience retirée, contrat annulé.
  await ag.post(`/missions/${m.id}/annuler`);
  assert.equal((await ines.get(`/interimaires/${i.id}/experiences`)).data.some(x => x.source === 'mission'), false);
  assert.equal((await ines.get('/contrats')).data[0].statut, 'annule');
});
