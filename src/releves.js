'use strict';
// Relevés mensuels d'activité des agences partenaires et prévisionnel de l'ETT.
// Chaque mois, le partenaire remplit un fichier (CSV ouvert dans Excel, pré-rempli avec les intérimaires placés et les clients signés
// présentés par l'agence) : une ligne par mission avec les heures, le taux horaire brut, le coefficient et le chiffre d'affaires.
// L'agence en tire des statistiques : chaque mission est simulée comme si elle avait été réalisée par sa propre ETT
// (salaires, indemnités, charges, marge), avec une projection sur 12 mois.
const multer = require('multer');
const { db, one, all, run, tx } = require('./db');
const P = require('./parametres');

db.exec(`
CREATE TABLE IF NOT EXISTS releves (
  id INTEGER PRIMARY KEY,
  partenaire_id INTEGER NOT NULL REFERENCES partenaires(id) ON DELETE CASCADE,
  mois TEXT NOT NULL,
  fichier_nom TEXT, contenu TEXT NOT NULL,
  depose_par TEXT NOT NULL DEFAULT 'partenaire',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (partenaire_id, mois)
);
CREATE TABLE IF NOT EXISTS releves_lignes (
  id INTEGER PRIMARY KEY,
  releve_id INTEGER NOT NULL REFERENCES releves(id) ON DELETE CASCADE,
  presentation_id INTEGER REFERENCES presentations(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'interimaire',
  interimaire TEXT, client TEXT, poste TEXT, date_debut TEXT, date_fin TEXT,
  heures REAL NOT NULL, taux_horaire REAL NOT NULL, coefficient REAL, ca_ht REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'realisee', commentaire TEXT, origine TEXT
);
`);

const COLONNES = [
  ['ref', 'Réf. CHR (ne pas modifier)'], ['type', 'Type (Intérimaire ou Client)'], ['interimaire', 'Intérimaire (prénom nom)'], ['client', 'Établissement client'],
  ['poste', 'Poste'], ['date_debut', 'Début (JJ/MM/AAAA)'], ['date_fin', 'Fin (JJ/MM/AAAA)'], ['heures', 'Heures travaillées dans le mois'],
  ['taux', 'Taux horaire brut (€)'], ['coefficient', 'Coefficient de facturation'], ['ca_ht', 'CA HT facturé (€)'], ['statut', 'Statut (Réalisée ou Annulée)'], ['commentaire', 'Commentaire'],
];
const DEBUTS = { ref: 'ref', type: 'type', interimaire: 'interimaire', client: 'etablissement', poste: 'poste', date_debut: 'debut', date_fin: 'fin', heures: 'heures', taux: 'taux', coefficient: 'coefficient', ca_ht: 'ca ht', statut: 'statut', commentaire: 'commentaire' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const isMois = m => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const r2 = n => Math.round(n * 100) / 100;
const moisLib = m => new Date(m + '-15T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const finMois = m => { const [a, n] = m.split('-').map(Number); return `${m}-${String(new Date(a, n, 0).getDate()).padStart(2, '0')}`; };
const moisSuivant = (m, k = 1) => { const [a, n] = m.split('-').map(Number), d = new Date(Date.UTC(a, n - 1 + k, 15)); return d.toISOString().slice(0, 7); };
const fr = n => n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
const cellule = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const ligneCsv = L => L.map(cellule).join(';');

/** Fichier à remplir pour un mois : en-tête, consignes et lignes pré-remplies (intérimaires placés, clients signés). */
function modele(p, mois) {
  const fin = finMois(mois);
  const pres = all(`SELECT * FROM presentations WHERE partenaire_id = ? AND statut = 'placee' AND COALESCE(date_placement, '0000') <= ? ORDER BY type DESC, id`, p.id, fin);
  // Reprise du mois précédent : poste, client, taux et coefficient déjà connus
  const prec = one('SELECT id FROM releves WHERE partenaire_id = ? AND mois < ? ORDER BY mois DESC LIMIT 1', p.id, mois);
  const anciennes = prec ? all('SELECT * FROM releves_lignes WHERE releve_id = ? AND statut = \'realisee\'', prec.id) : [];
  const lignes = [];
  for (const x of pres) {
    const ref = (x.type === 'client' ? 'C-' : 'P-') + x.id, A = anciennes.filter(l => l.presentation_id === x.id);
    const base = { ref, type: x.type === 'client' ? 'Client' : 'Intérimaire', interimaire: x.type === 'client' ? '' : `${x.prenom} ${x.nom}`, client: x.type === 'client' ? x.etablissement : '', poste: x.type === 'client' ? '' : x.poste || '' };
    if (!A.length) lignes.push(base);
    for (const a of A) lignes.push({ ...base, interimaire: a.interimaire || base.interimaire, client: a.client || base.client, poste: a.poste || base.poste, taux: fr(a.taux_horaire), coefficient: fr(a.coefficient) });
  }
  if (!lignes.length) lignes.push({ ref: '', type: 'Intérimaire' });
  const txt = [
    `# Relevé mensuel d'activité · ${p.raison_sociale} · ${moisLib(mois)}`,
    `# Mois : ${mois}`,
    '# Une ligne par mission du mois (ou par intérimaire et par établissement). Pour plusieurs missions, copiez la ligne et gardez la même Réf. CHR.',
    '# Lignes pré-remplies : intérimaires placés et clients signés présentés par CHR Intérim. Ajoutez sans référence les autres missions réalisées chez les clients présentés.',
    '# Heures et taux horaire brut obligatoires. Indiquez le coefficient ou le CA HT facturé (sinon CA = heures × taux × coefficient). Laissez les heures vides si rien ce mois-ci.',
    ligneCsv(COLONNES.map(c => c[1])),
    ...lignes.map(l => ligneCsv(COLONNES.map(([k]) => l[k] ?? ''))),
  ].join('\r\n');
  return '﻿' + txt + '\r\n';
}

/** Lecture d'un fichier CSV (UTF-8 ou Windows-1252, séparateur ; , ou tabulation, guillemets). */
function lireCsv(buf) {
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  t = t.replace(/^﻿/, '');
  const lignesBrutes = t.split(/\r?\n/);
  const entete = lignesBrutes.find(l => /r[ée]f/i.test(l) && /heures/i.test(l)) || '';
  const sep = [';', '\t', ','].sort((a, b) => entete.split(b).length - entete.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return { rows, texte: t };
}
const nombre = v => { const s = String(v ?? '').replace(/[€\s  ]/g, '').replace(',', '.'); return s === '' ? null : Number(s); };
const date = v => { const s = String(v || '').trim(); if (!s) return null; let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = /^\d{4}-\d{2}-\d{2}$/.exec(s); return m ? s : undefined; };

/** Analyse et contrôle d'un relevé : { mois, lignes, erreurs }. */
function analyser(buf, p, moisDemande) {
  const { rows, texte } = lireCsv(buf);
  const mm = /#\s*Mois\s*:\s*(\d{4}-\d{2})/i.exec(texte);
  const mois = isMois(moisDemande) ? moisDemande : mm ? mm[1] : null;
  const erreurs = [];
  if (!mois) erreurs.push('Choisissez le mois du relevé.');
  const ih = rows.findIndex(r => r.some(c => /^r[ée]f/i.test(c.trim())) && r.some(c => /heures/i.test(c)));
  if (ih < 0) return { mois, lignes: [], erreurs: ['Ligne d\'en-tête introuvable : utilisez le fichier à remplir téléchargé dans votre espace, sans modifier la ligne des titres.'] };
  const pos = {};
  rows[ih].forEach((c, k) => { const n = norm(c); for (const [cle, deb] of Object.entries(DEBUTS)) if (pos[cle] === undefined && n.startsWith(deb)) { pos[cle] = k; break; } });
  for (const k of ['heures', 'taux']) if (pos[k] === undefined) erreurs.push(`Colonne « ${COLONNES.find(c => c[0] === k)[1]} » introuvable.`);
  const lignes = [], presMap = new Map(all('SELECT * FROM presentations WHERE partenaire_id = ?', p.id).map(x => [(x.type === 'client' ? 'C-' : 'P-') + x.id, x]));
  rows.slice(ih + 1).forEach((r, k) => {
    const n = ih + k + 2, v = c => pos[c] === undefined ? '' : String(r[pos[c]] ?? '').trim();
    if (!r.some(c => String(c).trim()) || String(r[0] || '').trim().startsWith('#')) return;
    const heures = nombre(v('heures')), ca = nombre(v('ca_ht'));
    if (heures === null && ca === null) return; // ligne pré-remplie sans activité ce mois-ci
    const e = m => erreurs.push(`Ligne ${n} : ${m}`);
    const ref = v('ref').toUpperCase(), x = ref ? presMap.get(ref) : null;
    if (ref && !x) return e(`référence « ${ref} » inconnue (ne modifiez pas la colonne Réf. CHR).`);
    const taux = nombre(v('taux')), coef = nombre(v('coefficient'));
    if (!(heures > 0 && heures <= 400)) return e('heures travaillées manquantes ou invalides (entre 0 et 400 par ligne).');
    if (!(taux > 0 && taux < 200)) return e('taux horaire brut manquant ou invalide.');
    if (coef !== null && !(coef >= 1 && coef <= 5)) return e('coefficient invalide (entre 1 et 5).');
    if (ca !== null && !(ca >= 0 && ca < 1e6)) return e('CA HT invalide.');
    if (coef === null && ca === null) return e('indiquez le coefficient de facturation ou le CA HT facturé.');
    const d1 = date(v('date_debut')), d2 = date(v('date_fin'));
    if (d1 === undefined || d2 === undefined) return e('date invalide (format JJ/MM/AAAA).');
    const type = x ? (x.type === 'client' ? 'client' : 'interimaire') : /client/i.test(v('type')) ? 'client' : 'interimaire';
    const interimaire = v('interimaire') || (x && x.type !== 'client' ? `${x.prenom} ${x.nom}` : ''), client = v('client') || (x && x.type === 'client' ? x.etablissement : '');
    if (!interimaire && !client) return e('indiquez l\'intérimaire ou l\'établissement client.');
    lignes.push({ presentation_id: x?.id || null, type, interimaire: interimaire.slice(0, 120), client: client.slice(0, 160), poste: (v('poste') || (x?.type !== 'client' ? x?.poste : '') || '').slice(0, 100),
      date_debut: d1, date_fin: d2, heures, taux_horaire: taux, coefficient: coef ?? r2(ca / (heures * taux)), ca_ht: r2(ca ?? heures * taux * coef),
      statut: /annul/i.test(v('statut')) ? 'annulee' : 'realisee', commentaire: v('commentaire').slice(0, 300),
      origine: x ? (x.type === 'client' ? 'Clients présentés' : x.source || 'Site CHR Intérim') : type === 'client' ? 'Clients présentés' : 'Autres missions du partenaire' });
  });
  if (!erreurs.length && !lignes.length) erreurs.push('Aucune mission dans le fichier : renseignez au moins les heures et le taux horaire d\'une ligne.');
  return { mois, lignes, erreurs };
}

function enregistrer(p, mois, lignes, buf, nomFichier, parQui) {
  return tx(() => {
    run('DELETE FROM releves WHERE partenaire_id = ? AND mois = ?', p.id, mois);
    const id = Number(run('INSERT INTO releves (partenaire_id, mois, fichier_nom, contenu, depose_par) VALUES (?,?,?,?,?)', p.id, mois, String(nomFichier || '').slice(0, 120), lireCsv(buf).texte, parQui).lastInsertRowid);
    for (const l of lignes) run(`INSERT INTO releves_lignes (releve_id, presentation_id, type, interimaire, client, poste, date_debut, date_fin, heures, taux_horaire, coefficient, ca_ht, statut, commentaire, origine)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, l.presentation_id, l.type, l.interimaire, l.client, l.poste, l.date_debut, l.date_fin, l.heures, l.taux_horaire, l.coefficient, l.ca_ht, l.statut, l.commentaire, l.origine);
    return id;
  });
}

/** Simulation d'une mission comme si l'agence était l'ETT : salaires, indemnités, charges, marge. */
function simuler(l) {
  const ifm = P.num('ifm_taux', 10) / 100, cp = P.num('iccp_taux', 10) / 100, ch = P.num('charges_patronales_taux', 20) / 100, cs = P.num('cotisations_salariales_taux', 22) / 100;
  const brut = l.heures * l.taux_horaire, i = brut * ifm, c = (brut + i) * cp, total = brut + i + c, charges = total * ch, cout = total + charges;
  return { brut: r2(brut), ifm: r2(i), iccp: r2(c), total_brut: r2(total), net: r2(total * (1 - cs)), charges: r2(charges), cout: r2(cout), ca: r2(l.ca_ht), marge: r2(l.ca_ht - cout), marge_pc: l.ca_ht ? Math.round((l.ca_ht - cout) / l.ca_ht * 1000) / 10 : 0 };
}

/** Mois attendus d'un partenaire : du mois du premier placement (ou client signé) au mois précédent. */
function moisAttendus(pid, aujourdhui) {
  const prem = one('SELECT MIN(date_placement) d FROM presentations WHERE partenaire_id = ? AND statut = \'placee\'', pid)?.d;
  if (!prem) return [];
  const L = [], dernier = moisSuivant(aujourdhui.slice(0, 7), -1);
  for (let m = prem.slice(0, 7); m <= dernier && L.length < 36; m = moisSuivant(m)) L.push(m);
  return L;
}

function previsionnel(q, aujourdhui) {
  const pid = Number(q.partenaire_id) || null, g = Math.max(-50, Math.min(100, Number(String(q.croissance ?? 5).replace(',', '.')) || 0)) / 100;
  const delai = Math.max(0, Math.min(90, parseInt(q.delai ?? P.num('delai_paiement_defaut', 15) * 2, 10) || 30));
  const L = all(`SELECT l.*, r.mois, r.partenaire_id, p.raison_sociale FROM releves_lignes l JOIN releves r ON r.id = l.releve_id JOIN partenaires p ON p.id = r.partenaire_id
    WHERE l.statut = 'realisee' ${pid ? 'AND r.partenaire_id = ?' : ''} ORDER BY r.mois, l.id`, ...(pid ? [pid] : [])).map(l => ({ ...l, sim: simuler(l) }));
  const somme = (A, f) => r2(A.reduce((a, x) => a + f(x), 0));
  const agreger = A => {
    const ca = somme(A, x => x.sim.ca), cout = somme(A, x => x.sim.cout), h = somme(A, x => x.heures), brut = somme(A, x => x.sim.brut);
    return { missions: A.length, heures: h, interimaires: new Set(A.map(x => x.interimaire).filter(Boolean)).size, clients: new Set(A.map(x => x.client).filter(Boolean)).size,
      ca_ht: ca, salaires_bruts: brut, cout: cout, charges: somme(A, x => x.sim.charges), marge: r2(ca - cout), marge_pc: ca ? Math.round((ca - cout) / ca * 1000) / 10 : null,
      taux_moyen: h ? r2(brut / h) : null, coefficient_moyen: brut ? Math.round(ca / brut * 100) / 100 : null, etp: Math.round(h / 151.67 * 10) / 10 };
  };
  const moisL = [...new Set(L.map(x => x.mois))].sort();
  const com = all(`SELECT substr(date_placement, 1, 7) m, SUM(commission_montant) s FROM presentations WHERE commission_statut IN ('a_facturer','facturee','payee') ${pid ? 'AND partenaire_id = ?' : ''} GROUP BY 1`, ...(pid ? [pid] : []));
  const comDe = m => r2(com.find(c => c.m === m)?.s || 0);
  const parMois = moisL.map(m => ({ mois: m, ...agreger(L.filter(x => x.mois === m)), commissions: comDe(m) }));
  const groupe = (cle, n = 8) => Object.entries(L.reduce((o, x) => ((o[cle(x) || 'Non précisé'] = o[cle(x) || 'Non précisé'] || []).push(x), o), {}))
    .map(([nom, A]) => ({ nom, ...agreger(A) })).sort((a, b) => b.ca_ht - a.ca_ht).slice(0, n);
  // Projection sur 12 mois : moyenne des 3 derniers mois connus, croissance mensuelle choisie
  const base = parMois.slice(-3), moy = k => base.length ? base.reduce((a, x) => a + x[k], 0) / base.length : 0;
  const depart = moisL.length ? moisSuivant(moisL[moisL.length - 1]) : moisSuivant(aujourdhui.slice(0, 7));
  let cumCa = 0, cumMarge = 0;
  const projection = base.length ? Array.from({ length: 12 }, (_, i) => {
    const f = Math.pow(1 + g, i + 1), ca = r2(moy('ca_ht') * f), marge = r2(moy('marge') * f), cout = r2(moy('cout') * f);
    cumCa += ca; cumMarge += marge;
    return { mois: moisSuivant(depart, i), ca_ht: ca, cout, marge, heures: Math.round(moy('heures') * f), etp: Math.round(moy('heures') * f / 151.67 * 10) / 10, cumul_ca: r2(cumCa), cumul_marge: r2(cumMarge) };
  }) : [];
  const caAn = projection.reduce((a, x) => a + x.ca_ht, 0), coutMoy = projection.length ? projection.reduce((a, x) => a + x.cout, 0) / 12 : 0;
  const total = agreger(L), comTot = r2(com.reduce((a, c) => a + (c.s || 0), 0));
  return {
    parametres: { croissance: g * 100, delai, ifm: P.num('ifm_taux', 10), iccp: P.num('iccp_taux', 10), charges: P.num('charges_patronales_taux', 20) },
    total: { ...total, commissions: comTot }, par_mois: parMois, projection,
    ett: { ca_annuel: r2(caAn), marge_annuelle: r2(projection.reduce((a, x) => a + x.marge, 0)), etp_moyen: projection.length ? Math.round(projection.reduce((a, x) => a + x.etp, 0) / 12 * 10) / 10 : 0,
      bfr: r2(coutMoy * delai / 30), garantie_financiere: r2(caAn * 0.08), commissions_annuelles: r2(parMois.slice(-3).reduce((a, x) => a + x.commissions, 0) / Math.max(1, Math.min(3, parMois.length)) * 12) },
    par_origine: groupe(x => x.origine), par_poste: groupe(x => x.poste), par_client: groupe(x => x.client), par_partenaire: groupe(x => x.raison_sociale),
    missions: L.slice(-200).reverse().map(({ sim, ...x }) => ({ mois: x.mois, partenaire: x.raison_sociale, interimaire: x.interimaire, client: x.client, poste: x.poste, heures: x.heures, taux_horaire: x.taux_horaire, coefficient: x.coefficient, origine: x.origine, ...sim })),
    releves: all('SELECT id, statut, raison_sociale FROM partenaires ORDER BY raison_sociale').filter(p => !pid || p.id === pid).map(p => {
      const att = moisAttendus(p.id, aujourdhui), dep = all('SELECT r.id, r.mois, r.created_at, r.depose_par, r.fichier_nom, COUNT(l.id) lignes, COALESCE(SUM(CASE WHEN l.statut = \'realisee\' THEN l.ca_ht END), 0) ca FROM releves r LEFT JOIN releves_lignes l ON l.releve_id = r.id WHERE r.partenaire_id = ? GROUP BY r.id ORDER BY r.mois DESC', p.id);
      return { partenaire_id: p.id, raison_sociale: p.raison_sociale, statut: p.statut, deposes: dep, manquants: att.filter(m => !dep.some(d => d.mois === m)) };
    }).filter(r => r.statut === 'actif' || r.deposes.length),
  };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 } });

function register(api, h) {
  const { fail, wrap, role } = h;
  const recevoir = (req, res, next) => upload.single('fichier')(req, res, e => e ? next(new h.HttpError(400, e.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (2 Mo maximum).' : 'Envoi du fichier impossible.')) : next());
  const deposer = (p, req, parQui) => {
    if (!req.file) fail(400, 'Joignez le fichier du relevé (CSV enregistré depuis Excel).');
    if (/\.xlsx?$/i.test(req.file.originalname || '')) fail(400, 'Fichier Excel (.xlsx) : enregistrez-le au format « CSV UTF-8 (délimité par des points-virgules) » ou « CSV (séparateur : point-virgule) », puis déposez-le.');
    const a = analyser(req.file.buffer, p, req.body?.mois);
    if (a.mois && a.mois > h.today().slice(0, 7)) a.erreurs.unshift('Le mois du relevé ne peut pas être dans le futur.');
    if (a.erreurs.length) fail(400, 'Relevé non enregistré. ' + a.erreurs.slice(0, 8).join(' ') + (a.erreurs.length > 8 ? ` (+ ${a.erreurs.length - 8} autre(s) erreur(s))` : ''));
    enregistrer(p, a.mois, a.lignes, req.file.buffer, req.file.originalname, parQui);
    const ok = a.lignes.filter(l => l.statut === 'realisee');
    return { mois: a.mois, lignes: a.lignes.length, heures: r2(ok.reduce((s, l) => s + l.heures, 0)), ca_ht: r2(ok.reduce((s, l) => s + l.ca_ht, 0)) };
  };
  const envoyerFichier = (res, nom, contenu) => { res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nom)}`, 'Cache-Control': 'private, no-store' }); res.send(contenu.startsWith('﻿') ? contenu : '﻿' + contenu); };
  const nomModele = (p, mois) => `releve-${mois}-${norm(p.raison_sociale).replace(/ /g, '-').slice(0, 40)}.csv`;
  const moisQ = req => { const m = String(req.query.mois || ''); if (!isMois(m)) fail(400, 'Mois invalide.'); return m; };

  /* Agence */
  api.get('/partenaires/previsionnel', role('agence'), (req, res) => res.json(previsionnel(req.query, h.today())));
  api.get('/partenaires/:id/releves/modele', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    const m = moisQ(req); envoyerFichier(res, nomModele(p, m), modele(p, m));
  }));
  api.post('/partenaires/:id/releves', role('agence'), recevoir, wrap((req, res) => {
    const p = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    res.status(201).json(deposer(p, req, 'agence'));
  }));
  api.get('/partenaires/releves/:id/fichier', role('agence'), wrap((req, res) => {
    const r = one('SELECT r.*, p.raison_sociale FROM releves r JOIN partenaires p ON p.id = r.partenaire_id WHERE r.id = ?', req.params.id); if (!r) fail(404, 'Relevé introuvable.');
    envoyerFichier(res, nomModele(r, r.mois), r.contenu);
  }));
  api.delete('/partenaires/releves/:id', role('agence'), wrap((req, res) => { if (!run('DELETE FROM releves WHERE id = ?', req.params.id).changes) fail(404, 'Relevé introuvable.'); res.json({ ok: true }); }));

  /* Partenaire */
  const moi = req => one('SELECT * FROM partenaires WHERE id = ?', req.user.partenaire_id) || fail(404, 'Partenaire introuvable.');
  api.get('/partenaire/releves', role('partenaire'), wrap((req, res) => {
    const p = moi(req), att = moisAttendus(p.id, h.today());
    const dep = all('SELECT r.id, r.mois, r.created_at, r.fichier_nom, r.depose_par, COUNT(l.id) lignes, COALESCE(SUM(CASE WHEN l.statut = \'realisee\' THEN l.heures END), 0) heures, COALESCE(SUM(CASE WHEN l.statut = \'realisee\' THEN l.ca_ht END), 0) ca FROM releves r LEFT JOIN releves_lignes l ON l.releve_id = r.id WHERE r.partenaire_id = ? GROUP BY r.id ORDER BY r.mois DESC', p.id);
    res.json({ deposes: dep, manquants: att.filter(m => !dep.some(d => d.mois === m)), mois_conseille: moisSuivant(h.today().slice(0, 7), -1), colonnes: COLONNES.map(c => c[1]) });
  }));
  api.get('/partenaire/releves/modele', role('partenaire'), wrap((req, res) => { const p = moi(req), m = moisQ(req); envoyerFichier(res, nomModele(p, m), modele(p, m)); }));
  api.get('/partenaire/releves/:id/fichier', role('partenaire'), wrap((req, res) => {
    const p = moi(req), r = one('SELECT * FROM releves WHERE id = ? AND partenaire_id = ?', req.params.id, p.id); if (!r) fail(404, 'Relevé introuvable.');
    envoyerFichier(res, nomModele(p, r.mois), r.contenu);
  }));
  api.post('/partenaire/releves', role('partenaire'), recevoir, wrap((req, res) => {
    const p = moi(req), r = deposer(p, req, 'partenaire');
    run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Relevé mensuel de ${p.raison_sociale} : ${moisLib(r.mois)}, ${r.lignes} mission(s), ${String(r.ca_ht).replace('.', ',')} € HT`);
    res.status(201).json(r);
  }));
}

module.exports = { register, modele, analyser, enregistrer, simuler, previsionnel, COLONNES };
