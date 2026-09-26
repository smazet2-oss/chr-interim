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
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}), del: u => call('DELETE', u) };
}
async function connecte(u, p, n) { const a = agent(); const r = await a.post('/login', { username: u, password: p }); if (r.data.must_change) await a.post('/password', { actuel: p, nouveau: n }); return a; }
let AG;
const agence = async () => AG || (AG = await connecte('admin', 'Admin-Temp1', 'Agence2026'));
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
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Brasserie Sim', coefficient: 2 })).data;
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const CL = await connecte(ca.username, ca.password, 'Client2026X');
  const i = (await ag.post('/interimaires', { prenom: 'Sam', nom: 'Test', poste: 'Serveur', telephone: '0611111111' })).data;
  const ia = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  const IN = await connecte(ia.username, ia.password, 'Interim2026X');

  // Simulation en direct : l'employeur a le taux par défaut, sans marge
  // Simulation en direct : l'employeur a le taux minimum HCR du poste (Serveur : niveau I-3, 12,10 €), sans marge
  const live = (await CL.post('/simulation', { poste: 'Serveur', debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 50 })).data;
  assert.equal(live.taux_facture, 24.2); assert.equal(live.ht, 121); assert.equal(live.marge, undefined); assert.equal(live.brut, undefined);
  const la = (await ag.post('/simulation', { client_id: c.id, debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 13 })).data;
  assert.equal(la.taux_horaire, 13); assert.ok(la.marge > 0);
  assert.equal((await IN.post('/simulation', { debut: '18:00', fin: '23:00' })).status, 403);
  assert.equal((await CL.post('/simulation', { debut: '25:00', fin: '23:00' })).status, 400);

  const jour = plusJours(3);
  const m = (await CL.post('/missions', { poste: 'Serveur', date: jour, debut: '18:00', fin: '23:00', nb_postes: 1 })).data;
  await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['sms'] });
  assert.equal(m.taux_horaire, 12.1);
  const sa = (await ag.get('/missions')).data[0].simulation;
  const attendu = S.calculer({ date: jour, debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 12.1, coefficient: 2, motif: m.motif });
  assert.equal(sa.ht, attendu.ht); assert.ok('marge' in sa);
  const sc = (await CL.get('/missions')).data[0].simulation;
  assert.deepEqual(Object.keys(sc).sort(), ['heures', 'ht', 'majorations', 'nb_postes', 'taux_facture', 'ttc', 'tva']);
  const si = (await IN.get('/missions')).data[0].simulation;
  assert.equal(si.total_brut, attendu.total_brut); assert.equal(si.ht, undefined); assert.equal(si.marge, undefined);
  assert.ok((await IN.get('/jour/' + jour)).data.missions[0].simulation.net > 0);
  assert.equal((await CL.get('/jour/' + jour)).data.missions[0].simulation.marge, undefined);
  // Le message de diffusion annonce la paie estimée
  const j = (await ag.get('/journal')).data;
  assert.ok(JSON.stringify(j).includes(attendu.total_brut.toFixed(2).replace('.', ',') + ' € brut'));
});

test('convention HCR : jours fériés, majorations et taux par poste', async () => {
  const H = require('../src/hcr');
  assert.ok(H.estFerie('2026-04-06') && H.estFerie('2026-05-14') && H.estFerie('2026-05-25'), 'lundi de Pâques, Ascension, Pentecôte 2026');
  assert.ok(!H.estFerie('2026-04-07'));
  assert.deepEqual(H.decomposer('2026-04-30', '20:00', '02:00'), { total: 6, nuit: 4, dimanche: 0, ferie: 0, mai1: 2 });
  assert.deepEqual(H.decomposer('2026-09-27', '10:00', '14:00'), { total: 4, nuit: 0, dimanche: 4, ferie: 0, mai1: 0 });
  // Par défaut (HCR) : seul le 1er mai est majoré, à 100 %
  assert.equal(H.facteur('2026-09-27', '10:00', '14:00'), 1);
  assert.equal(H.facteur('2026-05-01', '10:00', '14:00'), 2);
  const s = S.calculer({ date: '2026-05-01', debut: '10:00', fin: '14:00', taux_horaire: 12.5, coefficient: 1.45 });
  assert.equal(s.brut, 100); assert.equal(s.ht, 145); assert.equal(s.majorations[0].cle, 'mai1');
  assert.equal(H.tauxPoste('Plongeur'), 12.02, 'grille sous le SMIC : le SMIC s\'applique');
  assert.equal(H.tauxPoste('Maître d\'hôtel'), 13.1);
  // Paramètres modifiables : nuit majorée à 20 %
  const ag = await agence();
  assert.equal((await ag.put('/parametres', { valeurs: { maj_nuit_pc: '20' } })).status, 200);
  assert.equal(H.facteur('2026-09-28', '20:00', '00:00'), 1.1);
  assert.equal((await ag.put('/parametres', { valeurs: { maj_1er_mai_pc: '50' } })).status, 400, '1er mai : 100 % minimum');
  await ag.put('/parametres', { valeurs: { maj_nuit_pc: '0' } });
});

test('contrat commercial : coefficient par défaut, signature, calcul automatique', async () => {
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Hôtel Contrat' })).data;
  assert.equal(c.coefficient, 1.45);
  assert.equal((await ag.post('/clients', { nom: 'Trop bas', coefficient: 1.3 })).status, 400);
  assert.equal((await ag.put(`/clients/${c.id}`, { coefficient: 1.6 })).status, 200, 'à la hausse sans contrat');
  const ca = (await ag.post('/acces', { type: 'client', id: c.id })).data;
  const CL = await connecte(ca.username, ca.password, 'Hotel2026X');

  assert.equal((await ag.post('/contrats-clients', { client_id: c.id, coefficient: 1.2, delai_paiement: 30 })).status, 400);
  const k = (await ag.post('/contrats-clients', { client_id: c.id, coefficient: '1,9', delai_paiement: 30, conditions: 'Tenue fournie par le client.' })).data;
  assert.equal(k.statut, 'a_signer'); assert.equal(k.coefficient, 1.9);
  assert.equal((await CL.get('/clients')).data[0].coefficient, 1.6, 'pas encore signé');
  const vu = (await CL.get('/contrats-clients')).data;
  assert.equal(vu.contrats.length, 1);
  assert.equal((await CL.get(`/contrats-clients/${k.id}/document`)).status, 200);
  assert.equal((await CL.post(`/contrats-clients/${k.id}/signer`, { nom: 'Jean Dupont, directeur' })).status, 400, 'case d\'acceptation obligatoire');
  const signe = (await CL.post(`/contrats-clients/${k.id}/signer`, { nom: 'Jean Dupont, directeur', accepte: true })).data;
  assert.equal(signe.statut, 'signe'); assert.equal(signe.signe_mode, 'en_ligne');
  const apres = (await CL.get('/clients')).data[0];
  assert.equal(apres.coefficient, 1.9); assert.equal(apres.delai_paiement, 30);
  // Le coefficient du contrat sert aux calculs
  assert.equal((await CL.post('/simulation', { poste: 'Serveur', debut: '10:00', fin: '14:00' })).data.taux_facture, 22.99);
  // Modifier le coefficient hors contrat est refusé
  assert.equal((await ag.put(`/clients/${c.id}`, { coefficient: 2.5 })).status, 409);
  // Nouveau contrat signé sur papier par l'agence : remplace le précédent
  const k2 = (await ag.post('/contrats-clients', { client_id: c.id, coefficient: 2.1, delai_paiement: 15 })).data;
  await ag.post(`/contrats-clients/${k2.id}/signer`, { nom: 'Jean Dupont' });
  const L = (await ag.get(`/contrats-clients?client_id=${c.id}`)).data.contrats;
  assert.deepEqual(L.map(x => x.statut), ['signe', 'remplace']);
  assert.equal((await CL.get('/clients')).data[0].coefficient, 2.1);
  // Un client avec contrat signé ne peut plus être supprimé
  assert.equal((await ag.del(`/clients/${c.id}`)).status, 409);
});
