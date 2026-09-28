'use strict';
// Tests : mesure d'audience des liens du site (origines des visites).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-visites-'));
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


test('origine d\'une visite : lien marqué, puis site précédent', () => {
  const { classer } = require('../src/visites');
  assert.equal(classer('facebook'), 'facebook');
  assert.equal(classer('FB'), 'facebook');
  assert.equal(classer('email'), 'mail');
  assert.equal(classer('qr'), 'qr');
  assert.equal(classer('inconnu'), 'autre');
  assert.equal(classer('', 'https://l.facebook.com/l.php?u=x'), 'facebook');
  assert.equal(classer('', 'https://m.facebook.com/'), 'facebook');
  assert.equal(classer('', 'https://mail.google.com/mail/u/0/'), 'mail');
  assert.equal(classer('', 'https://outlook.live.com/'), 'mail');
  assert.equal(classer('', 'https://www.google.fr/'), 'recherche');
  assert.equal(classer('', ''), 'site', 'adresse tapée ou favori');
  assert.equal(classer('', 'https://www.exemple.fr/annuaire'), 'autre');
  assert.equal(classer('', 'https://chr.example/contact', 'chr.example'), 'interne');
});

test('visites comptées par page et origine, demandes rattachées, statistiques de l\'agence', async () => {
  const pub = agent(), ag = await agence();
  const v1 = await pub.post('/public/visite', { page: 'contact', src: 'facebook', ref: '' });
  assert.equal(v1.status, 201); assert.match(v1.data.jeton, /^[a-f0-9]{32}$/); assert.equal(v1.data.source, 'facebook');
  assert.equal((await pub.post('/public/visite', { page: 'candidature', src: '', ref: 'https://mail.google.com/' })).data.source, 'mail');
  assert.equal((await pub.post('/public/visite', { page: 'connexion', src: '', ref: '' })).data.source, 'site');
  assert.equal((await pub.post('/public/visite', { page: 'inconnue' })).data.jeton, null, 'page inconnue ignorée');
  assert.equal((await pub.post('/public/visite', { page: 'contact' }, { 'User-Agent': 'facebookexternalhit/1.1' })).data.jeton, null, 'robot ignoré');
  const interne = await pub.post('/public/visite', { page: 'connexion', ref: base.replace('/api', '/contact') });
  assert.equal(interne.data.jeton, null, 'navigation interne non comptée');

  // Demande envoyée depuis la visite Facebook
  const r = await pub.post('/public/contact', { etablissement: 'Le Zinc', repondant: 'Léa', telephone: '0472000001', consentement: true, visite: v1.data.jeton });
  assert.equal(r.status, 201);
  assert.equal(one('SELECT converti FROM visites WHERE jeton = ?', v1.data.jeton).converti, 1);
  const p = one('SELECT reponses FROM prospects WHERE etablissement = ?', 'Le Zinc');
  assert.ok(!('visite' in JSON.parse(p.reponses)), 'jeton non enregistré dans la fiche');

  const s = (await ag.get('/stats')).data.visites;
  assert.equal(s.mois, 3); assert.equal(s.demandes, 1); assert.equal(s.taux, 50);
  assert.deepEqual(s.sources.map(x => x.cle).sort(), ['facebook', 'mail', 'site']);
  assert.equal(s.sources.find(x => x.cle === 'facebook').demandes, 1);
  assert.equal(s.pages.find(x => x.cle === 'contact').demandes, 1);
  assert.equal(s.serie.length, 6); assert.equal(s.serie[5].valeur, 3);

  // Réservé à l'agence
  assert.equal((await pub.get('/stats')).status, 401);
});
