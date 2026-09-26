'use strict';
// Tests d'envoi réel de bout en bout, avec un faux serveur SMTP et une fausse API Twilio locaux.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-envoi-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';

// Faux Twilio : enregistre les requêtes ; le numéro +33600000099 est refusé comme invalide.
const twilioRecus = [];
const twilio = http.createServer((req, res) => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
    const p = Object.fromEntries(new URLSearchParams(b)); p._auth = req.headers.authorization; p._url = req.url; twilioRecus.push(p);
    res.setHeader('Content-Type', 'application/json');
    if (String(p.To).endsWith('+33600000099')) { res.statusCode = 400; return res.end(JSON.stringify({ code: 21211, message: 'Invalid To' })); }
    res.end(JSON.stringify({ sid: 'SM' + twilioRecus.length }));
  });
}).listen(0);
// Faux serveur SMTP minimal
const mails = [];
const smtp = net.createServer(sock => {
  let data = false, buf = '', courant = '';
  sock.write('220 test ESMTP\r\n');
  sock.on('data', chunk => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const ligne = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (ligne === '.') { data = false; mails.push(courant); courant = ''; sock.write('250 OK\r\n'); } else courant += ligne + '\n'; continue; }
      const cmd = ligne.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 test\r\n');
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
}).listen(0);
process.env.TWILIO_API_BASE = `http://127.0.0.1:${twilio.address().port}`;

const { app, initAdmin } = require('../src/server');
const { all } = require('../src/db');
initAdmin();
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api`; });
test.after(() => { server.close(); twilio.close(); smtp.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-CHR': '1', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await res.text(); let data = t; try { data = JSON.parse(t); } catch { /* html */ }
    return { status: res.status, data };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b) };
}
const attendre = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return; await new Promise(r => setTimeout(r, 50)); } };
const plusJours = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

test('envoi réel e-mail (avec logo), SMS et WhatsApp', async () => {
  const ag = agent();
  await ag.post('/login', { username: 'admin', password: 'Admin-Temp1' });
  await ag.post('/password', { actuel: 'Admin-Temp1', nouveau: 'Agence2026' });
  const sid = 'AC' + '0'.repeat(32);
  const r = await ag.put('/parametres', { valeurs: {
    raison_sociale: 'CHR Intérim', site_url: 'https://chr-interim.example', email: 'contact@chr-interim.fr', telephone: '04 78 00 00 00',
    smtp_host: '127.0.0.1', smtp_port: String(smtp.address().port), smtp_from: 'CHR Intérim <missions@chr-interim.fr>',
    twilio_sid: sid, twilio_token: 'jeton-secret', twilio_sms_from: 'CHR Interim', twilio_whatsapp_from: '+33700000000', whatsapp_logo: 'oui',
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.canaux, { whatsapp: true, sms: true, mail: true });
  assert.equal((await ag.put('/parametres', { valeurs: { twilio_sms_from: 'Nom beaucoup trop long' } })).status, 400);

  // Aperçu de l'e-mail
  const ap = await ag.get('/parametres/apercu-email');
  assert.match(ap.data, /bandeau-horizontal\.png/);
  assert.match(ap.data, /Voir la mission/);

  // Diffusion d'une mission sur les 3 canaux
  const c = (await ag.post('/clients', { nom: 'Brasserie Test' })).data;
  const i = (await ag.post('/interimaires', { prenom: 'Léa', nom: 'Morin', poste: 'Serveuse', telephone: '06 12 34 56 78', email: 'lea@exemple.fr' })).data;
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveuse', date: plusJours(3), debut: '18:00', fin: '23:00', nb_postes: 1, taux_horaire: 12.5 })).data;
  const d = await ag.post(`/missions/${m.id}/diffuser`, { interims: [i.id], canaux: ['mail', 'sms', 'whatsapp'] });
  assert.deepEqual(d.data.simules, []);
  await attendre(() => mails.length >= 1 && twilioRecus.length >= 2);

  const sms = twilioRecus.find(x => !String(x.To).startsWith('whatsapp:'));
  assert.equal(sms.From, 'CHR Interim');
  assert.equal(sms.To, '+33612345678');
  assert.match(sms.Body, /nouvelle mission Serveuse/);
  assert.match(sms.Body, /https:\/\/chr-interim\.example/);
  assert.equal(sms._auth, 'Basic ' + Buffer.from(sid + ':jeton-secret').toString('base64'));
  const wa = twilioRecus.find(x => String(x.To).startsWith('whatsapp:'));
  assert.equal(wa.From, 'whatsapp:+33700000000');
  assert.equal(wa.To, 'whatsapp:+33612345678');
  assert.equal(wa.MediaUrl, 'https://chr-interim.example/img/bandeau-mobile.png');

  const mail = mails[0];
  assert.match(mail, /To: lea@exemple\.fr/);
  assert.match(mail, /Content-Type: text\/html/);
  assert.match(mail, /Content-Type: image\/png/);
  assert.match(mail, /Content-ID: <logo@chr-interim>/);
  assert.match(mail, /Reply-To: contact@chr-interim\.fr/);
  const journal = (await ag.get('/journal')).data;
  assert.equal(journal.filter(x => x.statut === 'envoye').length, 3);

  // Erreur Twilio traduite
  const t = await ag.post('/parametres/test', { canal: 'sms', destinataire: '06 00 00 00 99' });
  assert.equal(t.data.statut, 'echec');
  assert.match(t.data.detail, /numéro du destinataire invalide/);

  // Envoi des identifiants : mot de passe vérifié, jamais écrit en clair dans le journal
  const acc = (await ag.post('/acces', { type: 'interim', id: i.id })).data;
  assert.equal((await ag.post(`/acces/${acc.id}/envoyer`, { password: 'faux', canaux: ['sms'] })).status, 400);
  const env = await ag.post(`/acces/${acc.id}/envoyer`, { password: acc.password, canaux: ['mail', 'sms'] });
  assert.equal(env.data.resultats.mail.statut, 'envoye');
  assert.equal(env.data.resultats.sms.statut, 'envoye');
  await attendre(() => mails.length >= 2);
  assert.ok(twilioRecus.some(x => String(x.Body).includes(acc.password)), 'le SMS contient bien le mot de passe');
  assert.equal(all('SELECT contenu FROM envois_messages').some(x => x.contenu.includes(acc.password)), false, 'jamais en clair dans le journal');
});
