'use strict';
// Tests : âge (mineurs, moins de 16 ans, 64 ans ou plus) et contrôle des missions proposées aux mineurs.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-age-'));
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


const A = require('../src/age');
test('calcul de l\'âge et catégories', () => {
  assert.equal(A.age('2009-11-08', '2026-11-07'), 16); assert.equal(A.age('2009-11-07', '2026-11-07'), 17);
  assert.equal(A.categorie(15), 'moins16'); assert.equal(A.categorie(17), 'mineur'); assert.equal(A.categorie(18), null);
  assert.equal(A.categorie(63), null); assert.equal(A.categorie(64), 'senior'); assert.equal(A.age(null), null); assert.equal(A.age('x'), null);
});

test('missions des mineurs : nuit, durée, bar, moins de 16 ans', () => {
  const k = (a, debut, fin, poste = 'Serveur', secteur = 'Restauration') => A.controleMission(a, { debut, fin, poste }, secteur);
  assert.deepEqual(k(30, '22:00', '07:00'), { bloquants: [], alertes: [] }, 'majeur : aucun contrôle');
  assert.equal(k(17, '11:00', '15:00').bloquants.length, 0);
  assert.equal(k(17, '18:00', '00:00').bloquants.length, 1, 'fin après 23 h 30');
  assert.equal(k(17, '05:00', '11:00').bloquants.length, 1, 'début avant 6 h');
  assert.equal(k(17, '09:00', '18:30').bloquants.length, 1, 'plus de 8 heures');
  const nuit = k(17, '18:00', '23:00'); assert.equal(nuit.bloquants.length, 0); assert.match(nuit.alertes.join(), /dérogation/);
  assert.match(k(17, '12:00', '15:00', 'Barman', 'Bar').alertes.join(), /bar/);
  assert.match(k(15, '10:00', '12:00').bloquants.join(), /moins de 16 ans/);
  assert.match(k(15, '17:00', '20:30').bloquants.join(), /20 h/);
});

test('diffusion : mission non conforme non proposée au mineur, acceptation refusée', async () => {
  const ag = await agence();
  const c = (await ag.post('/clients', { nom: 'Brasserie Âge' })).data;
  const d = plusJours(5), dn = (() => { const x = new Date(); x.setFullYear(x.getFullYear() - 17); return x.toISOString().slice(0, 10); })();
  const mineur = (await ag.post('/interimaires', { prenom: 'Tom', nom: 'Jeune', poste: 'Serveur', telephone: '0611111199', date_naissance: dn })).data;
  const majeur = (await ag.post('/interimaires', { prenom: 'Max', nom: 'Adulte', poste: 'Serveur', telephone: '0611111198', date_naissance: '1990-01-01' })).data;
  const L = (await ag.get('/interimaires')).data;
  assert.equal(L.find(x => x.id === mineur.id).categorie_age, 'mineur'); assert.equal(L.find(x => x.id === majeur.id).categorie_age, null);
  const m = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: d, debut: '19:00', fin: '00:30', nb_postes: 1 })).data;
  const ctrl = (await ag.get(`/missions/${m.id}/controle-age`)).data;
  assert.ok(ctrl[mineur.id].bloquants.length); assert.equal(ctrl[majeur.id], undefined);
  const r = (await ag.post(`/missions/${m.id}/diffuser`, { interims: [mineur.id, majeur.id], canaux: ['sms'] })).data;
  assert.equal(r.envoyes, 1); assert.equal(r.ecartes[0].id, mineur.id);
  // Mission conforme : proposée au mineur
  const m2 = (await ag.post('/missions', { client_id: c.id, poste: 'Serveur', date: d, debut: '11:00', fin: '15:00', nb_postes: 1 })).data;
  assert.equal((await ag.post(`/missions/${m2.id}/diffuser`, { interims: [mineur.id], canaux: ['sms'] })).data.envoyes, 1);
});

test('âge légal de départ à la retraite selon la génération', () => {
  assert.equal(A.moisRetraite('1961-05-10'), 744); assert.equal(A.libelleMois(744), '62 ans');
  assert.equal(A.moisRetraite('1964-06-01'), 753); assert.equal(A.libelleMois(753), '62 ans et 9 mois');
  assert.equal(A.moisRetraite('1965-02-01'), 753, '1er trimestre 1965 : 62 ans et 9 mois');
  assert.equal(A.moisRetraite('1967-06-01'), 762); assert.equal(A.moisRetraite('1975-01-01'), 768);
  // Né le 1er mars 1964 : 62 ans et 9 mois le 1er décembre 2026
  assert.equal(A.categorie(62, '1964-03-01', '2026-11-30'), null);
  assert.equal(A.categorie(62, '1964-03-01', '2026-12-01'), 'senior');
  // Né en 1966 : 63 ans et 3 mois ; à 63 ans pile, pas encore
  assert.equal(A.categorie(63, '1963-01-01'.replace('1963', '1966'), '2029-01-01'), null);
  assert.equal(A.categorie(63, '1966-01-01', '2029-04-01'), 'senior');
});

const SJ = require('../src/sejour');
test('titres de séjour : situation et conditions', () => {
  const T = SJ.TITRES;
  assert.equal(SJ.situation({ nationalite: 'Française' }), null);
  assert.equal(SJ.situation({ nationalite: 'Union européenne / EEE / Suisse' }), null);
  assert.equal(SJ.situation({ nationalite: 'Autre', titre: T[0], expiration: '2030-01-01' }, '2026-11-07').niveau, 'autorise');
  const etu = SJ.situation({ nationalite: 'Autre', titre: T[3], expiration: '2027-09-30' }, '2026-11-07');
  assert.equal(etu.niveau, 'conditions'); assert.match(etu.regles.join(), /964 heures/);
  assert.equal(SJ.situation({ nationalite: 'Autre', titre: T[6] }, '2026-11-07').niveau, 'interdit');
  assert.equal(SJ.situation({ nationalite: 'Autre', titre: T[8] }, '2026-11-07').niveau, 'interdit');
  const exp = SJ.situation({ nationalite: 'Autre', titre: T[1], expiration: '2026-10-01' }, '2026-11-07');
  assert.equal(exp.niveau, 'interdit'); assert.match(exp.libelle, /expiré/);
  assert.equal(SJ.situation({ nationalite: 'Autre' }, '2026-11-07').niveau, 'verifier');
  assert.match(SJ.situation({ nationalite: 'Autre', titre: T[1], expiration: '2026-12-01' }, '2026-11-07').alertes.join(), /24 jours/);
  // Ancienne question de la candidature
  assert.equal(SJ.situationCandidat({ autorisation: 'Nationalité française ou européenne' }), null);
  assert.equal(SJ.situationCandidat({ autorisation: 'Démarches en cours' }).niveau, 'interdit');
  // Mission après l'expiration du titre
  assert.equal(SJ.controleMission({ nationalite: 'Autre', titre_sejour: T[0], titre_expiration: '2026-12-01' }, { date: '2026-12-15' }).bloquants.length, 1);
  assert.match(SJ.controleMission({ nationalite: 'Autre', titre_sejour: T[3], titre_expiration: '2027-09-30' }, { date: '2026-12-15' }).alertes.join(), /964/);
});

test('candidature étrangère : titre demandé, non acceptable mise en rouge et comptée dans les statistiques', async () => {
  const ag = await agence();
  const env = async champs => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.append(k, v); f.append('cv', new Blob(['%PDF-1.4 cv'], { type: 'application/pdf' }), 'cv.pdf');
    return (await fetch(base + '/public/candidature', { method: 'POST', headers: { 'X-CHR': '1' }, body: f })).status; };
  const base0 = { consentement: '1', prenom: 'Ana', nom: 'Silva', telephone: '0600000055', ville: 'Lyon', situation: 'Étudiant(e)', nationalite_cat: 'Autre nationalité', postes: 'Serveur' };
  assert.equal(await env(base0), 400, 'titre de séjour demandé');
  assert.equal(await env({ ...base0, titre_sejour: SJ.TITRES[6] }), 201);
  assert.equal(await env({ ...base0, prenom: 'Liu', nom: 'Wei', titre_sejour: SJ.TITRES[3], titre_expiration: '2030-09-30' }), 201);
  const L = (await ag.get('/candidats')).data, ana = L.find(c => c.nom === 'Silva'), liu = L.find(c => c.nom === 'Wei');
  assert.equal(ana.sejour.niveau, 'interdit'); assert.equal(liu.sejour.niveau, 'conditions');
  assert.equal((await ag.post(`/candidats/${ana.id}/decision`, { decision: 'acceptee', sans_envoi: true })).status, 409, 'non acceptable');
  assert.equal((await ag.post(`/candidats/${ana.id}/decision`, { decision: 'refusee', sans_envoi: true })).status, 200, 'refus possible');
  const r = (await ag.post(`/candidats/${liu.id}/decision`, { decision: 'acceptee', sans_envoi: true })).data;
  const fiche = (await ag.get('/interimaires')).data.find(x => x.id === r.interim_id);
  assert.equal(fiche.nationalite, 'Autre'); assert.equal(fiche.titre_sejour, SJ.TITRES[3]); assert.equal(fiche.sejour.niveau, 'conditions');
  // Statistiques de l'étude : les deux candidatures comptées
  const st = (await ag.get(`/etude/resultats?cible=interimaire&source=dossiers&annee=${plusJours(0).slice(0, 4)}`)).data;
  const q = st.sections.flatMap(x => x.questions).find(x => x.k === 'titre_sejour');
  assert.ok(q.options.find(o => o.l === SJ.TITRES[6]).n >= 1 && q.options.find(o => o.l === SJ.TITRES[3]).n >= 1);
});
