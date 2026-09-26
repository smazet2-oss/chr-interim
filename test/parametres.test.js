'use strict';
// Tests : paramètres de l'agence, secrets chiffrés, facture imprimable, test d'envoi.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-param-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const { one, run } = require('../src/db');
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
    const t = await res.text(); let data = t; try { data = JSON.parse(t); } catch { /* HTML */ }
    return { status: res.status, data };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b) };
}
async function connecte(u, p, n) {
  const a = agent(); const r = await a.post('/login', { username: u, password: p });
  if (r.data.must_change) await a.post('/password', { actuel: p, nouveau: n });
  return a;
}
const plusJours = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('paramètres de l\'agence', async () => {
  const ag = await connecte('admin', 'Admin-Temp1', 'Agence2026');
  let p = (await ag.get('/parametres')).data;
  assert.equal(p.valeurs.raison_sociale, 'CHR Intérim');
  assert.equal(p.valeurs.tva_taux, '20');
  assert.equal(p.canaux.mail, false);

  // Validation des formats
  assert.equal((await ag.put('/parametres', { valeurs: { siret: '123' } })).status, 400);
  assert.equal((await ag.put('/parametres', { valeurs: { tva_taux: '45' } })).status, 400);
  assert.equal((await ag.put('/parametres', { valeurs: { raison_sociale: '' } })).status, 400);

  // Enregistrement, secret chiffré et jamais renvoyé
  const r = await ag.put('/parametres', { valeurs: {
    raison_sociale: 'CHR Intérim Lyon', forme_juridique: 'SAS', capital: '10000', siret: '912 345 678 00011', adresse: '5 rue de la République',
    code_postal: '69002', ville: 'Lyon', email: 'contact@chr-interim.fr', iban: 'FR76 3000 6000 0112 3456 7890 189', tva_taux: '20',
    ifm_taux: '10', iccp_taux: '10', smtp_host: '127.0.0.1', smtp_port: '1', smtp_pass: 'motdepasse-secret', garantie_financiere: 'Atradius n° 123',
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  p = r.data;
  assert.deepEqual(p.valeurs.smtp_pass, { defini: true });
  assert.equal(JSON.stringify(p).includes('motdepasse-secret'), false);
  const brut = one('SELECT valeur FROM parametres WHERE cle = ?', 'smtp_pass').valeur;
  assert.match(brut, /^enc:/);
  assert.equal(brut.includes('motdepasse'), false);
  // Secret vide = conservé
  await ag.put('/parametres', { valeurs: { smtp_pass: '' } });
  assert.equal(one('SELECT valeur FROM parametres WHERE cle = ?', 'smtp_pass').valeur, brut);
  assert.equal(p.canaux.mail, true);

  // Réservé à l'agence
  const c = (await ag.post('/clients', { nom: 'Brasserie Param', ville: 'Lyon' })).data;
  assert.equal(c.coefficient, 1.45, 'coefficient par défaut');
  assert.equal(c.delai_paiement, 15);
  const acc = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const cl = await connecte(acc.username, acc.password, 'Client2026');
  assert.equal((await cl.get('/parametres')).status, 403);
  assert.equal((await cl.put('/parametres', { valeurs: { iban: 'X' } })).status, 403);

  // Test d'envoi : SMTP injoignable → échec journalisé, sans planter
  const t = await ag.post('/parametres/test', { canal: 'mail', destinataire: 'test@exemple.fr' });
  assert.equal(t.data.statut, 'echec');
  assert.equal((await ag.post('/parametres/test', { canal: 'sms', destinataire: '0600000000' })).status, 409, 'SMS non configuré');

  // Facture : TVA, IBAN, identité légale ; contrat : identité de l'agence
  const i = (await ag.post('/interimaires', { prenom: 'Tom', nom: 'Vidal', poste: 'Serveur' })).data;
  const ai = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const tom = await connecte(ai.username, ai.password, 'Tom2026xx');
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: plusJours(2), debut: '18:00', fin: '22:00', nb_postes: 1, taux_horaire: 12.5 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  await tom.post(`/missions/${m.id}/repondre`, { accepte: true });
  await cl.post(`/missions/${m.id}/decision`, { interim_id: i.id, accepte: true });
  const k = (await tom.get('/contrats')).data[0];
  const doc = (await tom.get(`/contrats/${k.id}/document`)).data;
  assert.match(doc, /CHR Intérim Lyon/);
  assert.match(doc, /5 rue de la République, 69002 Lyon/);
  assert.match(doc, /Atradius/);
  run('UPDATE missions SET date = ? WHERE id = ?', plusJours(-1), m.id);
  const h = (await tom.get('/heures')).data[0];
  await tom.post(`/heures/${h.id}/confirmer`, {});
  await cl.post(`/heures/${h.id}/valider`, {});
  await ag.put('/parametres', { valeurs: { facture_prefixe: 'CHR', tva_taux: '20' } });
  const g = (await ag.post('/factures/generer', { debut: plusJours(-10), fin: plusJours(0) })).data;
  assert.match(g.creees[0], /^CHR-\d{4}-0001$/);
  const f = (await cl.get('/factures')).data[0];
  assert.equal(f.montant_ht, 72.5); // 4 h × 12,50 € × coefficient par défaut 1,45
  assert.equal(f.montant_ttc, 87);
  const fd = await cl.get(`/factures/${f.id}/document`);
  assert.equal(fd.status, 200);
  assert.match(fd.data, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(fd.data, /TVA 20 %/);
  assert.match(fd.data, /40 €/);
  assert.equal((await tom.get(`/factures/${f.id}/document`)).status, 404, 'un intérimaire ne voit pas les factures');
});
