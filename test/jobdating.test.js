'use strict';
// Job dating des alternants : badges QR, application des recruteurs, anonymat, demandes de rendez-vous.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-jd-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'Admin-Temp1';
const { app, initAdmin } = require('../src/server');
const qr = require('../src/qrcode');
initAdmin();

let base, racine;
const server = app.listen(0);
test.before(() => { racine = `http://127.0.0.1:${server.address().port}`; base = racine + '/api'; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

/** Client HTTP qui garde ses cookies (session agence ou recruteur). */
function agent() {
  let cookie = '';
  const call = async (method, url, body) => {
    const form = body instanceof FormData;
    const res = await fetch(base + url, {
      method, headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), 'X-CHR': '1', Cookie: cookie },
      body: form ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => null) : await res.text();
    return { status: res.status, data, type };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b ?? {}), put: (u, b) => call('PUT', u, b), del: u => call('DELETE', u), get cookie() { return cookie; } };
}
const formulaire = champs => { const fd = new FormData(); for (const [k, v] of Object.entries(champs)) fd.append(k, v); return fd; };

test('QR code : la matrice a la taille de la version attendue', () => {
  assert.equal(qr.matrice('a').length, 21, 'version 1');
  const lien = 'https://chr-interim.onrender.com/jd/AbCdEfGhIjKlMnOp';
  const m = qr.matrice(lien);
  assert.ok(m.length >= 29 && m.length <= 37);
  // Motifs de repérage aux trois coins
  for (const [x, y] of [[0, 0], [m.length - 7, 0], [0, m.length - 7]]) assert.ok(m[y][x] && m[y + 6][x + 6] && !m[y + 1][x + 1] && m[y + 3][x + 3]);
  assert.match(qr.svg(lien), /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
});

test('job dating : badges, scan anonyme, rendez-vous, abandon discret', async () => {
  const ag = agent();
  await ag.post('/login', { username: 'admin', password: 'Admin-Temp1' });
  assert.equal((await ag.post('/password', { actuel: 'Admin-Temp1', nouveau: 'Agence2026' })).status, 200);

  // Événement, alternants (avec CV anonymisé), recruteurs
  assert.equal((await ag.post('/jobdating/evenements', { nom: '', date: '2026-10-15' })).status, 400);
  const ev = (await ag.post('/jobdating/evenements', { nom: 'Job dating HCR automne', date: '2026-10-15', lieu: 'CFA de Lyon' })).data;
  const pdf = new Blob([Buffer.from('%PDF-1.4\n% CV anonymisé\n')], { type: 'application/pdf' });
  const sansConfirmation = formulaire({ prenom: 'Léa', nom: 'Durand', formation: 'BTS MHR' }); sansConfirmation.append('cv', pdf, 'cv-lea.pdf');
  assert.equal((await ag.post(`/jobdating/evenements/${ev.id}/alternants`, sansConfirmation)).status, 400, 'CV refusé sans confirmation d\'anonymisation');
  const fdLea = formulaire({ prenom: 'Léa', nom: 'Durand', email: 'lea@example.fr', telephone: '0611223344', formation: 'BTS Management en hôtellerie-restauration',
    niveau: 'BTS / Bac+2', contrat: 'Apprentissage', postes: 'Chef de rang, réceptionniste', secteur: 'Restauration', debut: '2026-11-02', competences: 'Service, anglais', projet: 'Devenir maître d\'hôtel', cv_anonyme: '1' });
  fdLea.append('cv', pdf, 'cv-lea.pdf');
  const lea = (await ag.post(`/jobdating/evenements/${ev.id}/alternants`, fdLea)).data;
  assert.equal(lea.numero, 1);
  const tom = (await ag.post(`/jobdating/evenements/${ev.id}/alternants`, formulaire({ prenom: 'Tom', nom: 'Petit', formation: 'CAP Cuisine', niveau: 'CAP / BEP' }))).data;
  assert.equal(tom.numero, 2);
  const faux = formulaire({ prenom: 'X', nom: 'Y', formation: 'CAP', cv_anonyme: '1' }); faux.append('cv', new Blob(['pas un pdf'], { type: 'application/pdf' }), 'faux.pdf');
  assert.equal((await ag.post(`/jobdating/evenements/${ev.id}/alternants`, faux)).status, 400, 'contenu du fichier vérifié');

  const emp = (await ag.post(`/jobdating/evenements/${ev.id}/employeurs`, { entreprise: 'Hôtel du Parc', contact: 'M. Martin, DRH', email: 'rh@hotelduparc.fr' })).data;
  const emp2 = (await ag.post(`/jobdating/evenements/${ev.id}/employeurs`, { entreprise: 'Brasserie Nord' })).data;
  assert.match(emp.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(emp.token, undefined, 'le jeton n\'est pas exposé, seulement le lien');

  const tab = (await ag.get(`/jobdating/evenements/${ev.id}`)).data;
  const lienLea = tab.alternants.find(a => a.id === lea.id).lien, tokenLea = lienLea.split('/jd/')[1];
  assert.equal(tab.alternants[0].cv_fichier, undefined);

  // Documents imprimables et QR codes
  const badges = await ag.get(`/jobdating/evenements/${ev.id}/badges`);
  assert.equal(badges.status, 200); assert.match(badges.data, /n° 1/); assert.match(badges.data, /<svg/);
  assert.match(badges.data, /Remise des badges/); assert.match(badges.data, /Léa/);
  const badgeSeul = await ag.get(`/jobdating/evenements/${ev.id}/badges?alternant=${lea.id}`);
  assert.doesNotMatch(badgeSeul.data, /Durand/, 'le badge porte le numéro, pas le nom');
  assert.match((await ag.get(`/jobdating/evenements/${ev.id}/cartes-recruteurs`)).data, new RegExp(emp.code));
  assert.match((await ag.get(`/jobdating/alternants/${lea.id}/qr.svg`)).type, /svg/);

  // Recruteur : connexion par code
  const rec = agent();
  assert.equal((await rec.get('/jd/moi')).status, 401);
  assert.equal((await rec.post('/jd/connexion', { code: 'ZZZZ-ZZZZ' })).status, 401);
  const moi = await rec.post('/jd/connexion', { code: emp.code.toLowerCase().replace('-', ' ') });
  assert.equal(moi.status, 200); assert.equal(moi.data.evenement.nom, 'Job dating HCR automne');
  assert.equal((await rec.get('/jobdating/evenements')).status, 401, 'pas d\'accès à l\'espace agence');

  // Scan du QR code : profil anonyme
  const p = (await rec.get('/jd/scan/' + encodeURIComponent(lienLea))).data;
  assert.equal(p.numero, 1); assert.equal(p.formation, 'BTS Management en hôtellerie-restauration'); assert.equal(p.cv, true);
  for (const k of ['prenom', 'nom', 'email', 'telephone', 'token', 'cv_fichier', 'cv_nom']) assert.equal(p[k], undefined, `${k} ne doit pas être visible`);
  assert.doesNotMatch(JSON.stringify(p), /Léa|Durand|lea@|0611/);
  const cv = await rec.get(`/jd/profils/${p.id}/cv`);
  assert.equal(cv.status, 200); assert.match(cv.type, /pdf/);
  assert.equal((await rec.get(`/jd/profils/${tom.id}`)).status, 404, 'profil non scanné inaccessible par identifiant');
  const parNumero = (await rec.get('/jd/scan/2')).data;
  assert.equal(parNumero.id, tom.id);

  // Lien du badge ouvert par le recruteur connecté : redirection vers l'application
  const r1 = await fetch(`${racine}/jd/${tokenLea}`, { headers: { Cookie: rec.cookie }, redirect: 'manual' });
  assert.equal(r1.status, 302); assert.equal(r1.headers.get('location'), `/recruteur#p=${tokenLea}`);
  // … ou par quelqu'un d'autre (l'alternant) : le badge seul, sans données personnelles
  const r2 = await fetch(`${racine}/jd/${tokenLea}`, { redirect: 'manual' });
  const html = await r2.text();
  assert.equal(r2.status, 200); assert.match(html, /n° 1/); assert.doesNotMatch(html, /Durand|BTS/);
  assert.equal((await fetch(`${racine}/recruteur`)).status, 200);

  // Un autre recruteur ne voit pas les décisions du premier ; un recruteur d'un autre job dating ne peut pas scanner
  const ev2 = (await ag.post('/jobdating/evenements', { nom: 'Autre', date: '2026-12-01' })).data;
  const empAutre = (await ag.post(`/jobdating/evenements/${ev2.id}/employeurs`, { entreprise: 'Ailleurs' })).data;
  const autre = agent(); await autre.post('/jd/connexion', { code: empAutre.code });
  assert.equal((await autre.get('/jd/scan/' + tokenLea)).status, 404);
  assert.equal((await autre.get(`/jd/profils/${lea.id}/cv`)).status, 404);

  // Abandon : aucune notification à l'alternant, aucune alerte à l'organisme
  const envoisAvant = (await ag.get('/journal')).data.length;
  const ab = await rec.post(`/jd/profils/${tom.id}/decision`, { decision: 'abandon' });
  assert.equal(ab.data.decision, 'abandon');
  assert.equal((await ag.get('/journal')).data.length, envoisAvant, 'aucun message envoyé pour un abandon');
  // Retour sur la décision
  assert.equal((await rec.post(`/jd/profils/${tom.id}/decision`, { decision: null })).data.decision, null);
  assert.equal((await rec.post(`/jd/profils/${tom.id}/decision`, { decision: 'peut-être' })).status, 400);

  // Demande de rendez-vous → organisme prévenu
  const rdv = await rec.post(`/jd/profils/${lea.id}/decision`, { decision: 'rdv', message: 'Poste de commis de salle', disponibilites: 'Mardi après-midi' });
  assert.equal(rdv.data.rdv_statut, 'demande'); assert.equal(rdv.data.prenom, undefined);
  const notifs = (await ag.get('/notifications')).data;
  assert.ok(notifs.some(n => /Hôtel du Parc \(M\. Martin, DRH\) demande un rendez-vous avec Candidat·e n° 1 \(Léa Durand/.test(n.message)));
  const liste = (await ag.get('/jobdating/evenements')).data.find(e => e.id === ev.id);
  assert.equal(liste.nb_a_traiter, 1); assert.equal(liste.nb_scans, 2);

  // L'organisme planifie : le recruteur voit le rendez-vous et le prénom ; l'alternant est prévenu
  const tab2 = (await ag.get(`/jobdating/evenements/${ev.id}`)).data;
  const dem = tab2.demandes[0];
  assert.equal(dem.prenom, 'Léa'); assert.equal(tab2.totaux.rdv, 1);
  assert.equal((await ag.post(`/jobdating/demandes/${dem.id}/planifier`, { rdv_le: '2026-10-20', rdv_lieu: 'x' })).status, 400);
  const pl = await ag.post(`/jobdating/demandes/${dem.id}/planifier`, { rdv_le: '2026-10-20T14:30', rdv_lieu: 'Hôtel du Parc, accueil', prevenir_employeur: true, prevenir_alternant: true, canaux_alternant: ['mail'] });
  assert.equal(pl.status, 200); assert.equal(pl.data.resultats.alternant.mail.statut, 'simule'); assert.equal(pl.data.resultats.employeur.statut, 'simule');
  const journal = (await ag.get('/journal')).data;
  assert.ok(journal.some(j => j.destinataire === 'lea@example.fr' && /Hôtel du Parc/.test(j.contenu) && /14 h 30/.test(j.contenu)));
  const vu = (await rec.get(`/jd/profils/${lea.id}`)).data;
  assert.equal(vu.rdv_statut, 'planifie'); assert.equal(vu.prenom, 'Léa'); assert.equal(vu.nom, undefined);
  assert.equal((await rec.post(`/jd/profils/${lea.id}/decision`, { decision: 'abandon' })).status, 409, 'rendez-vous fixé : modification par l\'organisme');

  // Le second recruteur ne voit que ses propres profils
  const rec2 = agent(); await rec2.post('/jd/connexion', { code: emp2.code });
  assert.deepEqual((await rec2.get('/jd/profils')).data, []);
  assert.equal((await rec.get('/jd/profils')).data.length, 2);

  // Nouveau code : l'ancien ne marche plus et la session est fermée
  const nouveau = (await ag.post(`/jobdating/employeurs/${emp2.id}/code`)).data;
  assert.notEqual(nouveau.code, emp2.code);
  assert.equal((await rec2.get('/jd/profils')).status, 401);
  assert.equal((await agent().post('/jd/connexion', { code: emp2.code })).status, 401);

  // Job dating clos : plus de nouveaux scans, les profils déjà vus restent accessibles
  await ag.put(`/jobdating/evenements/${ev.id}`, { statut: 'clos' });
  const rec3 = agent(); await rec3.post('/jd/connexion', { code: nouveau.code });
  assert.equal((await rec3.get('/jd/scan/1')).status, 409);
  assert.equal((await rec.get(`/jd/profils/${tom.id}`)).status, 200);

  // Suppression de l'événement : données et CV effacés
  const cvs = fs.readdirSync(path.join(dir, 'jobdating'));
  assert.equal(cvs.length, 1);
  assert.equal((await ag.del(`/jobdating/evenements/${ev.id}`)).status, 200);
  assert.equal(fs.readdirSync(path.join(dir, 'jobdating')).length, 0);
  assert.equal((await rec.get('/jd/moi')).status, 401);
});
