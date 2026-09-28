'use strict';
// Tests : envoi des e-mails par l'API web de Brevo (hébergeur qui bloque les ports SMTP).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-brevo-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
// Faux Brevo : la clé « mauvaise » est refusée, l'expéditeur inconnu@ n'est pas validé.
const recus = [];
const brevo = http.createServer((req, res) => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
    const p = JSON.parse(b); p._cle = req.headers['api-key']; p._url = req.url; recus.push(p);
    res.setHeader('Content-Type', 'application/json');
    if (p._cle === 'mauvaise') { res.statusCode = 401; return res.end(JSON.stringify({ code: 'unauthorized', message: 'Key not found' })); }
    if (p.sender.email === 'inconnu@exemple.fr') { res.statusCode = 400; return res.end(JSON.stringify({ code: 'invalid_parameter', message: 'Sender is not valid' })); }
    res.statusCode = 201; res.end(JSON.stringify({ messageId: '<abc@smtp-relay.mailin.fr>' }));
  });
}).listen(0);
process.env.BREVO_API_BASE = `http://127.0.0.1:${brevo.address().port}`;
const { app, initAdmin } = require('../src/server');
initAdmin();

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); brevo.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}) };
}

test('e-mail par l\'API Brevo : envoi, clé refusée, expéditeur non validé', async () => {
  const ag = agent();
  const r0 = await ag.post('/login', { username: 'admin', password: 'Admin-Temp1' });
  if (r0.data.must_change) await ag.post('/password', { actuel: 'Admin-Temp1', nouveau: 'Agence2026' });
  const regler = v => ag.put('/parametres', { valeurs: v, effacer: [] });
  assert.equal((await regler({ mail_methode: 'API Brevo (HTTPS)', brevo_cle: 'xkeysib-bonne', smtp_from: 'CHR Intérim <chr-interims@gmail.com>', site_url: 'https://chr.example' })).status, 200);
  assert.equal((await ag.get('/parametres')).data.canaux.mail, true);

  const ok = (await ag.post('/parametres/test', { canal: 'mail', destinataire: 'lea@exemple.fr' })).data;
  assert.equal(ok.statut, 'envoye', ok.detail);
  const m = recus.at(-1);
  assert.equal(m._url, '/v3/smtp/email'); assert.equal(m._cle, 'xkeysib-bonne');
  assert.deepEqual(m.sender, { name: 'CHR Intérim', email: 'chr-interims@gmail.com' });
  assert.deepEqual(m.to, [{ email: 'lea@exemple.fr' }]);
  assert.match(m.htmlContent, /https:\/\/chr\.example\/img\/bandeau-horizontal\.png/);

  await regler({ brevo_cle: 'mauvaise' });
  const k = (await ag.post('/parametres/test', { canal: 'mail', destinataire: 'lea@exemple.fr' })).data;
  assert.equal(k.statut, 'echec'); assert.match(k.detail, /clé API Brevo refusée/);

  await regler({ brevo_cle: 'xkeysib-bonne', smtp_from: 'inconnu@exemple.fr' });
  const s = (await ag.post('/parametres/test', { canal: 'mail', destinataire: 'lea@exemple.fr' })).data;
  assert.equal(s.statut, 'echec'); assert.match(s.detail, /expédition non validée/);
});
