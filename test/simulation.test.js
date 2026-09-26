'use strict';
// Tests : simulation de paie (intérimaire) et de coût (employeur, agence).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-sim-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const S = require('../src/simulation');
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
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}
async function connecte(u, p, n) { const a = agent(); const r = await a.post('/login', { username: u, password: p }); if (r.data.must_change) await a.post('/password', { actuel: p, nouveau: n }); return a; }
const plusJours = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('calcul : paie, facturation et marge', () => {
  assert.equal(S.dureeHeures('18:00', '00:00'), 6);
  // 5 h à 12 € : 60 brut, IFM 6, congés 6,60, total 72,60
  const s = S.calculer({ debut: '18:00', fin: '23:00', nb_postes: 2, taux_horaire: 12, coefficient: 2, motif: 'Accroissement temporaire d\'activité' });
  assert.deepEqual([s.brut, s.ifm, s.iccp, s.total_brut], [60, 6, 6.6, 72.6]);
  assert.equal(s.ht, 240); assert.equal(s.ttc, 288); assert.equal(s.taux_facture, 24);
  assert.equal(s.cout_agence, 174.24); assert.equal(s.marge, 65.76);
  // Emploi d'usage : pas d'indemnité de fin de mission
  const u = S.calculer({ debut: '18:00', fin: '23:00', taux_horaire: 12, motif: 'Emploi d\'usage constant (secteur HCR)' });
  assert.equal(u.ifm, 0); assert.equal(u.iccp, 6); assert.equal(u.ifm_due, false);
});

test('chaque profil ne voit que sa simulation', async () => {
  const ag = await connecte('admin', 'Admin-Temp1', 'Agence2026');
  const c = (await ag.post('/clients', { nom: 'Brasserie Sim', coefficient: 2 })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const CL = await connecte(ca.username, ca.password, 'Client2026X');
  const i = (await ag.post('/interimaires', { prenom: 'Sam', nom: 'Test', poste: 'Serveur', telephone: '0611111111' })).data;
  const ia = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const IN = await connecte(ia.username, ia.password, 'Interim2026X');

  // Simulation en direct : l'employeur a le taux par défaut, sans marge
  const live = (await CL.post('/simulation', { debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 50 })).data;
  assert.equal(live.taux_facture, 24); assert.equal(live.ht, 120); assert.equal(live.marge, undefined); assert.equal(live.brut, undefined);
  const la = (await ag.post('/simulation', { client_id: c.id, debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 13 })).data;
  assert.equal(la.taux_horaire, 13); assert.ok(la.marge > 0);
  assert.equal((await IN.post('/simulation', { debut: '18:00', fin: '23:00' })).status, 403);
  assert.equal((await CL.post('/simulation', { debut: '25:00', fin: '23:00' })).status, 400);

  const jour = plusJours(3);
  const m = (await CL.post('/missions', { poste: 'Serveur', date: jour, debut: '18:00', fin: '23:00', nb_postes: 1 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  const sa = (await ag.get('/missions')).data[0].simulation;
  assert.equal(sa.ht, 120); assert.ok('marge' in sa);
  const sc = (await CL.get('/missions')).data[0].simulation;
  assert.deepEqual(Object.keys(sc).sort(), ['heures', 'ht', 'nb_postes', 'taux_facture', 'ttc', 'tva']);
  const si = (await IN.get('/missions')).data[0].simulation;
  assert.equal(si.total_brut, 72.6); assert.equal(si.ht, undefined); assert.equal(si.marge, undefined);
  assert.ok((await IN.get('/jour/' + jour)).data.missions[0].simulation.net > 0);
  assert.equal((await CL.get('/jour/' + jour)).data.missions[0].simulation.marge, undefined);
  // Le message de diffusion annonce la paie estimée
  const j = (await ag.get('/journal')).data;
  assert.ok(JSON.stringify(j).includes('72,60 € brut'));
});
