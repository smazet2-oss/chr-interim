'use strict';
// Tests : mise à jour du SMIC au 1er juin 2026 et de la grille HCR (avenant n° 33).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-smic-'));
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


test('SMIC 12,31 € au 1er juin 2026 : paramètres, intérimaires, missions à venir, alerte pour les missions passées', async () => {
  const ag = await agence(), auj = plusJours(0);
  // Situation avant la mise à jour : anciennes valeurs enregistrées, une valeur personnalisée conservée
  run('DELETE FROM parametres WHERE cle = \'migration_smic_2026_06\'');
  for (const [k, v] of [['smic_horaire', '12.02'], ['grille_I_1', '11.88'], ['grille_III_2', '13.10'], ['grille_IV_1', '14.00']])
    run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur', k, v);
  const cid = run('INSERT INTO clients (nom) VALUES (\'Le Bouchon\')').lastInsertRowid;
  const iid = run('INSERT INTO interimaires (prenom, nom, poste, taux_horaire) VALUES (\'Max\', \'Roy\', \'Plongeur\', 12.02)').lastInsertRowid;
  const futur = run('INSERT INTO missions (client_id, poste, date, debut, fin, nb_postes, taux_horaire, statut) VALUES (?,?,?,?,?,?,?,?)', cid, 'Plongeur', plusJours(5), '18:00', '23:00', 1, 12.02, 'diffusee').lastInsertRowid;
  const passee = run('INSERT INTO missions (client_id, poste, date, debut, fin, nb_postes, taux_horaire, statut) VALUES (?,?,?,?,?,?,?,?)', cid, 'Serveur', '2026-06-15', '18:00', '23:00', 1, 12.10, 'verrouillee').lastInsertRowid;
  const bilan = require('../src/migrations').smicJuin2026(auj);
  assert.equal(require('../src/migrations').smicJuin2026(auj), null, 'une seule fois');
  const P = require('../src/parametres');
  assert.equal(P.get('smic_horaire'), '12.31');
  assert.equal(P.get('grille_I_1'), '12.00'); assert.equal(P.get('grille_III_2'), '13.54'); assert.equal(P.get('grille_IV_1'), '14.00', 'valeur personnalisée conservée');
  assert.equal(one('SELECT taux_horaire t FROM interimaires WHERE id = ?', iid).t, 12.31);
  assert.equal(one('SELECT taux_horaire t FROM missions WHERE id = ?', futur).t, 12.31);
  assert.equal(one('SELECT taux_horaire t FROM missions WHERE id = ?', passee).t, 12.10, 'mission passée inchangée (paie déjà établie)');
  assert.equal(bilan.passees, 1);
  assert.match(one('SELECT message FROM notifications WHERE pour_agence = 1 AND message LIKE \'SMIC au 1er juin%\'').message, /12,31 €.*1 mission/);
  // Plancher : la configuration et les nouvelles missions suivent le SMIC
  const cfg = (await ag.get('/config')).data;
  assert.equal(cfg.smic, 12.31); assert.equal(cfg.taux_postes['Plongeur'], 12.31); assert.equal(cfg.taux_postes['Serveur'], 12.31);
});
