'use strict';
// Tests : statistiques jour par jour (visites et candidatures).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-jours-'));
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


test('statistiques par jour : visites par page et origine, demandes, candidatures', async () => {
  const ag = await agence(), auj = plusJours(0), m = auj.slice(0, 7);
  require('../src/visites');
  const ins = (sql, ...a) => run(sql, ...a);
  // Une visite Facebook transformée et une visite directe aujourd'hui (midi UTC = même jour à Paris)
  ins('INSERT INTO visites (jeton, page, source, converti, created_at) VALUES (?,?,?,?,?)', 'a'.repeat(32), 'contact', 'facebook', 1, auj + ' 10:00:00');
  ins('INSERT INTO visites (jeton, page, source, converti, created_at) VALUES (?,?,?,?,?)', 'b'.repeat(32), 'connexion', 'site', 0, auj + ' 11:00:00');
  ins('INSERT INTO visites (jeton, page, source, converti, created_at) VALUES (?,?,?,?,?)', 'c'.repeat(32), 'candidature', 'facebook', 0, auj + ' 12:00:00');
  ins('INSERT INTO candidats (prenom, nom, created_at) VALUES (?,?,?)', 'Léa', 'Roy', auj + ' 09:00:00');
  ins('INSERT INTO prospects (source, etablissement, created_at) VALUES (?,?,?)', 'site', 'Le Zinc', auj + ' 09:30:00');
  const d = (await ag.get('/stats/jours')).data;
  assert.equal(d.mois, m); assert.equal(d.jours.at(-1).date, auj, 'jusqu\'à aujourd\'hui');
  const j = d.jours.find(x => x.date === auj);
  assert.equal(j.visites, 3); assert.equal(j.contact, 1); assert.equal(j.connexion, 1); assert.equal(j.demandes, 1);
  assert.equal(j.origine.cle, 'facebook'); assert.equal(j.origine.n, 2);
  assert.equal(j.cand_interim, 1); assert.equal(j.cand_etab, 1);
  assert.equal(d.totaux.visites, 3); assert.equal(d.meilleur_visites.date, auj);
  // Mois passé complet
  const prec = d.mois_choix[1], dp = (await ag.get('/stats/jours?mois=' + prec)).data;
  assert.equal(dp.mois, prec); assert.ok(dp.jours.length >= 28);
  // Réservé à l'agence
  assert.equal((await agent().get('/stats/jours')).status, 401);
});
