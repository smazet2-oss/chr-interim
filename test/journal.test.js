'use strict';
// Tests : journal des envois (onglets par canal, filtre de statut, suppression par cases à cocher).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-journal-'));
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


test('journal : onglets par canal, statut, suppression des messages cochés', async () => {
  const ag = await agence();
  for (const [c, d, s] of [['mail', 'a@exemple.fr', 'envoye'], ['mail', 'b@exemple.fr', 'echec'], ['sms', '+33600000001', 'simule'], ['whatsapp', '+33600000002', 'envoye']])
    run('INSERT INTO envois_messages (canal, destinataire, contenu, statut) VALUES (?,?,?,?)', c, d, 'Message', s);
  const n0 = (await ag.get('/journal/compteurs')).data;
  assert.ok(n0.tous >= 4); assert.ok(n0.mail >= 2); assert.ok(n0.sms >= 1); assert.ok(n0.whatsapp >= 1);
  const mails = (await ag.get('/journal?canal=mail')).data;
  assert.ok(mails.length >= 2 && mails.every(x => x.canal === 'mail'));
  assert.ok((await ag.get('/journal?canal=mail&statut=echec')).data.every(x => x.canal === 'mail' && x.statut === 'echec'));
  assert.equal((await ag.get('/journal/compteurs?statut=echec')).data.mail, 1);

  const ids = mails.filter(x => /^[ab]@/.test(x.destinataire)).map(x => x.id);
  assert.equal((await ag.post('/journal/supprimer', { ids: [] })).status, 400);
  const r = await ag.post('/journal/supprimer', { ids: [...ids, 'x', -1] });
  assert.equal(r.data.supprimes, 2);
  assert.equal(one('SELECT COUNT(*) n FROM envois_messages WHERE destinataire IN (\'a@exemple.fr\', \'b@exemple.fr\')').n, 0);
  assert.equal((await ag.get('/journal/compteurs')).data.sms, n0.sms, 'les autres canaux sont conservés');

  // Réservé à l'agence
  assert.equal((await agent().post('/journal/supprimer', { ids: [1] })).status, 401);
});
