'use strict';
// Tests : CV joint aux candidatures (aperçu, téléchargement, fiche intérimaire).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-cv-'));
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


test('CV de candidature : aperçu dans l\'application, téléchargement, accès depuis la fiche intérimaire', async () => {
  const ag = await agence();
  const f = new FormData();
  for (const [k, v] of Object.entries({ consentement: '1', prenom: 'Lina', nom: 'Faure', telephone: '0600000077', ville: 'Lyon', poste_principal: 'Serveur', postes: 'Serveur' })) f.append(k, v);
  f.append('cv', new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' }), 'CV Lina.pdf');
  assert.equal((await fetch(base + '/public/candidature', { method: 'POST', headers: { 'X-CHR': '1' }, body: f })).status, 201);
  const c = (await ag.get('/candidats')).data.find(x => x.nom === 'Faure');
  assert.match(c.cv_fichier, /\.pdf$/);

  // Aperçu : affiché dans la page (même site uniquement)
  const cookie = await (async () => { const r = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CHR': '1' }, body: JSON.stringify({ username: 'admin', password: 'Agence2026' }) }); return r.headers.get('set-cookie').split(';')[0]; })();
  const vue = await fetch(`${base}/candidats/${c.id}/cv?vue=1`, { headers: { Cookie: cookie } });
  assert.equal(vue.status, 200); assert.equal(vue.headers.get('content-type'), 'application/pdf');
  assert.match(vue.headers.get('content-disposition'), /^inline/); assert.equal(vue.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(vue.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  const dl = await fetch(`${base}/candidats/${c.id}/cv`, { headers: { Cookie: cookie } });
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  assert.equal((await fetch(`${base}/candidats/${c.id}/cv?vue=1`)).status, 401, 'réservé à l\'agence');

  // Après inscription, le CV reste accessible depuis la fiche intérimaire
  const r = await ag.post(`/candidats/${c.id}/interimaire`);
  const i = (await ag.get('/interimaires')).data.find(x => x.id === r.data.interim_id);
  assert.equal(i.cv_candidat, c.id);
});
