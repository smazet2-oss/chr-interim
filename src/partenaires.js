'use strict';
// Partenariats avec des agences d'emploi (ETT) : l'agence est apporteur d'affaires en sourcing.
// Elle trouve des candidats sur les job boards (Indeed, HelloWork, France Travail…), les présente
// aux agences partenaires selon leurs besoins de recrutement, et perçoit une commission sur chaque placement.
// Espace partenaire : besoins de recrutement, candidats présentés (profil, CV avec accord du candidat),
// retours et placements, commissions et factures, convention d'apporteur d'affaires signée en ligne.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, one, all, run, tx, addColumn, DATA_DIR } = require('./db');
const P = require('./parametres');
const { envoyer } = require('./notify');

db.exec(`
CREATE TABLE IF NOT EXISTS partenaires (
  id INTEGER PRIMARY KEY,
  raison_sociale TEXT NOT NULL,
  siret TEXT, adresse TEXT, ville TEXT, contact TEXT, email TEXT, telephone TEXT,
  zones TEXT NOT NULL DEFAULT '',          -- villes ou départements couverts
  metiers TEXT NOT NULL DEFAULT '',        -- métiers recrutés
  commission_type TEXT NOT NULL DEFAULT 'forfait' CHECK (commission_type IN ('forfait', 'pourcentage')),
  commission_valeur REAL NOT NULL DEFAULT 300,
  delai_paiement INTEGER NOT NULL DEFAULT 30,
  duree_garantie INTEGER NOT NULL DEFAULT 12,  -- non-contournement (mois)
  conditions TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'termine')),
  convention_numero TEXT, convention_signee_le TEXT, convention_signee_nom TEXT, convention_signee_mode TEXT,
  notes_agence TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS partenaires_demandes (
  id INTEGER PRIMARY KEY,
  partenaire_id INTEGER NOT NULL REFERENCES partenaires(id) ON DELETE CASCADE,
  poste TEXT NOT NULL, ville TEXT, nb_postes INTEGER NOT NULL DEFAULT 1,
  date_debut TEXT, date_fin TEXT,
  type_contrat TEXT NOT NULL DEFAULT 'Mission d''intérim',
  taux_horaire REAL, description TEXT NOT NULL DEFAULT '',
  job_boards TEXT NOT NULL DEFAULT '[]',
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'pourvue', 'annulee')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS presentations (
  id INTEGER PRIMARY KEY,
  partenaire_id INTEGER NOT NULL REFERENCES partenaires(id) ON DELETE CASCADE,
  demande_id INTEGER REFERENCES partenaires_demandes(id) ON DELETE SET NULL,
  candidat_id INTEGER REFERENCES candidats(id) ON DELETE SET NULL,
  prenom TEXT NOT NULL, nom TEXT NOT NULL, poste TEXT, ville TEXT, telephone TEXT, email TEXT,
  source TEXT, resume TEXT NOT NULL DEFAULT '', cv_fichier TEXT, cv_nom TEXT,
  consentement_le TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'proposee' CHECK (statut IN ('proposee', 'entretien', 'retenue', 'refusee', 'placee')),
  retour_partenaire TEXT NOT NULL DEFAULT '',
  date_placement TEXT, montant_ca REAL,
  commission_montant REAL,
  commission_statut TEXT NOT NULL DEFAULT 'non_due' CHECK (commission_statut IN ('non_due', 'attente_ca', 'a_facturer', 'facturee', 'payee')),
  facture_numero TEXT, facturee_le TEXT, payee_le TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
addColumn('users', 'partenaire_id', 'INTEGER REFERENCES partenaires(id) ON DELETE CASCADE');
// Origine des candidatures (job board) et accord du candidat pour être présenté aux agences partenaires
addColumn('candidats', 'source', "TEXT NOT NULL DEFAULT 'Site CHR Intérim'");
addColumn('candidats', 'partage_partenaires', 'INTEGER NOT NULL DEFAULT 0');

const JOB_BOARDS = ['Site CHR Intérim', 'Indeed', 'HelloWork', 'France Travail', 'LinkedIn', 'Facebook', 'Jobteaser', 'StudentJob', 'L\'Hôtellerie Restauration (lhotellerie-restauration.fr)', 'Leboncoin', 'Bouche-à-oreille', 'Autre'];
/** Origine d'une candidature d'après le lien de l'annonce (?src=indeed, ?src=hellowork…). */
const ALIAS = { indeed: 'Indeed', hellowork: 'HelloWork', 'france-travail': 'France Travail', francetravail: 'France Travail', 'pole-emploi': 'France Travail', poleemploi: 'France Travail', linkedin: 'LinkedIn',
  facebook: 'Facebook', fb: 'Facebook', jobteaser: 'Jobteaser', studentjob: 'StudentJob', leboncoin: 'Leboncoin', lhotellerie: JOB_BOARDS[8], 'lhotellerie-restauration': JOB_BOARDS[8] };
const sourceDepuisLien = s => ALIAS[String(s || '').toLowerCase().replace(/[^a-z-]/g, '')] || JOB_BOARDS.find(j => j.toLowerCase() === String(s || '').toLowerCase()) || 'Site CHR Intérim';
const CONTRATS = ['Mission d\'intérim', 'CDD', 'CDI', 'Saisonnier', 'Extra'];
const ST_PRES = ['proposee', 'entretien', 'retenue', 'refusee', 'placee'];
const CV_DIR = path.join(DATA_DIR, 'cv');
fs.mkdirSync(CV_DIR, { recursive: true });
const FORMATS = { 'application/pdf': ['.pdf', b => b.subarray(0, 4).toString() === '%PDF'], 'image/jpeg': ['.jpg', b => b[0] === 0xff && b[1] === 0xd8], 'image/png': ['.png', b => b.subarray(1, 4).toString() === 'PNG'],
  'application/msword': ['.doc', b => b.readUInt32BE(0) === 0xd0cf11e0], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx', b => b.subarray(0, 2).toString() === 'PK'] };
/** Erreur avec code HTTP (classe du serveur, fournie à l'enregistrement des routes). */
let HttpErr = class extends Error { constructor(s, m) { super(m); this.status = s; } };
const ko = (s, m) => new HttpErr(s, m);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 40 } });

const str = (v, max = 200) => (v == null ? '' : String(v).trim().slice(0, max));
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const nombre = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.').replace(/\s/g, '')));
const e = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
const dfr = iso => iso ? new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR') : '—';
const eur = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const lireDemande = d => d && { ...d, job_boards: JSON.parse(d.job_boards || '[]') };
const libCommission = p => p.commission_type === 'forfait' ? `${eur(p.commission_valeur)} HT par candidat placé` : `${String(p.commission_valeur).replace('.', ',')} % du chiffre d'affaires HT réalisé sur le placement`;

/** Commission d'une présentation selon la convention du partenaire (recalculée tant qu'elle n'est pas facturée). */
function commission(p, pres) {
  if (['facturee', 'payee'].includes(pres.commission_statut)) return { commission_montant: pres.commission_montant, commission_statut: pres.commission_statut };
  if (pres.statut !== 'placee') return { commission_montant: null, commission_statut: 'non_due' };
  if (p.commission_type === 'forfait') return { commission_montant: Math.round(p.commission_valeur * 100) / 100, commission_statut: 'a_facturer' };
  if (!(pres.montant_ca > 0)) return { commission_montant: null, commission_statut: 'attente_ca' };
  return { commission_montant: Math.round(pres.montant_ca * p.commission_valeur) / 100, commission_statut: 'a_facturer' };
}
/** Enregistre le statut, le retour, le placement et le chiffre d'affaires d'une présentation. */
function majPresentation(pres, b, parPartenaire) {
  const p = one('SELECT * FROM partenaires WHERE id = ?', pres.partenaire_id);
  const n = { statut: pres.statut, retour_partenaire: pres.retour_partenaire, date_placement: pres.date_placement, montant_ca: pres.montant_ca, commission_statut: pres.commission_statut, commission_montant: pres.commission_montant };
  if (b.statut !== undefined) { if (!ST_PRES.includes(b.statut)) throw ko(400, 'Statut invalide.'); n.statut = b.statut; }
  if (b.retour_partenaire !== undefined) n.retour_partenaire = str(b.retour_partenaire, 2000);
  if (b.date_placement !== undefined) { if (b.date_placement && !isDate(b.date_placement)) throw ko(400, 'Date de placement invalide.'); n.date_placement = b.date_placement || null; }
  if (b.montant_ca !== undefined) { const v = nombre(b.montant_ca); if (v !== null && !(v >= 0 && v < 1e7)) throw ko(400, 'Chiffre d\'affaires invalide.'); n.montant_ca = v; }
  if (['facturee', 'payee'].includes(pres.commission_statut) && (n.statut !== 'placee' || n.montant_ca !== pres.montant_ca)) throw ko(409, 'Commission déjà facturée : contactez l\'agence pour toute correction.');
  if (n.statut === 'placee' && !n.date_placement) n.date_placement = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  if (n.statut !== 'placee') { n.date_placement = null; }
  Object.assign(n, commission(p, { ...pres, ...n }));
  run(`UPDATE presentations SET statut = ?, retour_partenaire = ?, date_placement = ?, montant_ca = ?, commission_montant = ?, commission_statut = ?, updated_at = datetime('now') WHERE id = ?`,
    n.statut, n.retour_partenaire, n.date_placement, n.montant_ca, n.commission_montant, n.commission_statut, pres.id);
  if (parPartenaire && n.statut !== pres.statut) {
    const lib = { proposee: 'proposé', entretien: 'en entretien', retenue: 'retenu', refusee: 'non retenu', placee: 'placé' }[n.statut];
    run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Partenaire ${p.raison_sociale} : ${pres.prenom} ${pres.nom} ${lib}${n.retour_partenaire ? ' : ' + n.retour_partenaire.slice(0, 120) : ''}`);
  }
  if (n.statut === 'placee' && pres.demande_id) {
    const d = one('SELECT * FROM partenaires_demandes WHERE id = ?', pres.demande_id);
    const places = one('SELECT COUNT(*) n FROM presentations WHERE demande_id = ? AND statut = \'placee\'', pres.demande_id).n;
    if (d && d.statut === 'ouverte' && places >= d.nb_postes) run('UPDATE partenaires_demandes SET statut = \'pourvue\', updated_at = datetime(\'now\') WHERE id = ?', d.id);
  }
  return one('SELECT * FROM presentations WHERE id = ?', pres.id);
}

/** Vue partenaire d'une présentation : sans les notes internes, CV seulement avec l'accord du candidat. */
const pourPartenaire = x => ({ id: x.id, demande_id: x.demande_id, prenom: x.prenom, nom: x.nom, poste: x.poste, ville: x.ville, telephone: x.telephone, email: x.email, source: x.source, resume: x.resume,
  a_cv: !!x.cv_fichier, cv_nom: x.cv_nom, statut: x.statut, retour_partenaire: x.retour_partenaire, date_placement: x.date_placement, montant_ca: x.montant_ca,
  commission_montant: x.commission_montant, commission_statut: x.commission_statut, facture_numero: x.facture_numero, facturee_le: x.facturee_le, payee_le: x.payee_le, created_at: x.created_at, demande_poste: x.demande_poste || null });

function totaux(L) {
  const s = st => Math.round(L.filter(x => st.includes(x.commission_statut)).reduce((a, x) => a + (x.commission_montant || 0), 0) * 100) / 100;
  return { a_facturer: s(['a_facturer']), facturee: s(['facturee']), payee: s(['payee']), attente_ca: L.filter(x => x.commission_statut === 'attente_ca').length };
}
const presentationsDe = pid => all(`SELECT x.*, d.poste AS demande_poste FROM presentations x LEFT JOIN partenaires_demandes d ON d.id = x.demande_id WHERE x.partenaire_id = ? ORDER BY x.id DESC`, pid);

/** Convention d'apporteur d'affaires (modèle à faire relire par un juriste avant signature). */
function conventionHtml(p) {
  const g = k => e(P.get(k));
  const ag = `<b>${g('raison_sociale')}</b>${P.get('forme_juridique') ? ', ' + g('forme_juridique') : ''}${P.get('siret') ? ', SIRET ' + g('siret') : ''}<br>${e([P.get('adresse'), [P.get('code_postal'), P.get('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', '))}`;
  const pa = `<b>${e(p.raison_sociale)}</b>${p.siret ? ', SIRET ' + e(p.siret) : ''}<br>${e([p.adresse, p.ville].filter(Boolean).join(', '))}${p.contact ? '<br>Représentée par ' + e(p.contact) : ''}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convention ${e(p.convention_numero || '')}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:800px;margin:0 auto;padding:24px;line-height:1.55}h1{color:#112233;font-size:22px;margin:0 0 4px}h2{color:#112233;font-size:15px;margin:22px 0 6px;border-bottom:2px solid #C99948;padding-bottom:3px}
dl{display:grid;grid-template-columns:minmax(160px,auto) 1fr;gap:4px 16px;margin:0}dt{color:#6b7280}dd{margin:0}.etat{display:inline-block;padding:3px 10px;border-radius:12px;background:#EEF1F5;font-size:13px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.sig div{border:1px solid #d1d5db;border-radius:8px;padding:12px;min-height:80px}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #112233;padding-bottom:12px;margin-bottom:16px}
.note{background:#FFF7E6;border:1px solid #F2D49B;border-radius:8px;padding:8px 12px;font-size:13px}@media print{.noprint{display:none}}</style></head><body>
<header><div><h1>Convention d'apporteur d'affaires</h1><div>Sourcing de candidats · N° ${e(p.convention_numero || 'à attribuer')} · <span class="etat">${p.convention_signee_le ? 'Signée' : 'En attente de signature'}</span></div></div><a href="/" title="Accueil"><img src="/img/logo-horizontal.png" alt="Accueil" style="height:44px"></a></header>
<h2>Entre les parties</h2><dl><dt>L'apporteur d'affaires</dt><dd>${ag}</dd><dt>L'agence partenaire</dt><dd>${pa}</dd></dl>
<h2>Article 1 · Objet</h2><p>L'apporteur d'affaires recherche, sur les sites d'emploi (job boards), les réseaux sociaux et son propre vivier, des candidats correspondant aux besoins de recrutement que l'agence partenaire lui transmet dans son espace en ligne, principalement pour les métiers de l'hôtellerie, des cafés et de la restauration. Il présente ces candidats à l'agence partenaire, qui reste seule juge de leur recrutement et seule employeur des personnes qu'elle embauche ou met à disposition.</p>
<h2>Article 2 · Présentation des candidats</h2><p>Chaque candidat est présenté dans l'espace partenaire avec son profil et, s'il est joint, son CV. L'apporteur d'affaires ne présente un candidat qu'avec son accord préalable et en conserve la preuve. L'agence partenaire indique pour chaque candidat la suite donnée (entretien, retenu, non retenu, placé), au plus tard 15 jours après sa présentation, et déclare tout placement dans un délai de 8 jours.</p>
<h2>Article 3 · Rémunération</h2><dl><dt>Commission</dt><dd><b>${libCommission(p)}</b></dd><dt>Fait générateur</dt><dd>Toute embauche ou mise à disposition, sous quelque forme que ce soit, d'un candidat présenté, dans les ${p.duree_garantie} mois suivant sa présentation</dd>
<dt>Facturation</dt><dd>À la déclaration du placement${p.commission_type === 'pourcentage' ? ', sur la base du chiffre d\'affaires HT déclaré par l\'agence partenaire' : ''}, TVA en sus</dd><dt>Paiement</dt><dd>${p.delai_paiement} jours à compter de la date de facture ; pénalités de retard au taux légal et indemnité forfaitaire de 40 € pour frais de recouvrement</dd></dl>
<h2>Article 4 · Non-contournement</h2><p>L'agence partenaire s'interdit d'embaucher ou de mettre à disposition un candidat présenté sans déclarer le placement, directement ou par une société liée, pendant ${p.duree_garantie} mois à compter de sa présentation.</p>
<h2>Article 5 · Données personnelles</h2><p>Chaque partie est responsable des traitements qu'elle met en œuvre au sens du Règlement général sur la protection des données (RGPD). Les données des candidats sont utilisées uniquement pour le recrutement, ne sont pas cédées à des tiers et sont supprimées à la demande du candidat ou au plus tard 2 ans après le dernier contact. L'agence partenaire informe le candidat qu'elle détient ses données dès son premier contact.</p>
<h2>Article 6 · Indépendance et non-exclusivité</h2><p>Les parties agissent en toute indépendance. La présente convention n'est pas exclusive. L'apporteur d'affaires n'effectue aucun acte de placement au nom de l'agence partenaire et ne peut l'engager.</p>
<h2>Article 7 · Durée</h2><p>Convention conclue pour un an à compter de sa signature, renouvelable par tacite reconduction, résiliable par chaque partie avec un préavis d'un mois. Les commissions sur les candidats présentés avant la résiliation restent dues.</p>
${p.conditions ? `<h2>Conditions particulières</h2><p style="white-space:pre-wrap">${e(p.conditions)}</p>` : ''}
<div class="sig"><div><b>Pour ${g('raison_sociale')}</b><br><span style="color:#6b7280">Convention établie le ${dfr(p.created_at)}</span></div>
<div><b>Pour ${e(p.raison_sociale)}</b><br>${p.convention_signee_le ? `Signée ${p.convention_signee_mode === 'papier' ? 'sur papier' : 'électroniquement'} par <b>${e(p.convention_signee_nom)}</b> le ${dfr(p.convention_signee_le)}` : '<span style="color:#6b7280">En attente de signature</span>'}</div></div>
<p class="note noprint" style="margin-top:24px">Modèle indicatif : à faire relire par votre conseil avant la première signature. Pour imprimer ou enregistrer en PDF : menu Imprimer du navigateur (Ctrl + P).</p></body></html>`;
}

/** Facture de commission (une par placement). */
function factureHtml(x, p) {
  const g = k => e(P.get(k)), tva = P.num('tva_taux', 20), ht = x.commission_montant || 0, tv = Math.round(ht * tva) / 100;
  const ech = x.facturee_le ? new Date(Date.parse(x.facturee_le.slice(0, 10) + 'T12:00Z') + p.delai_paiement * 864e5).toISOString().slice(0, 10) : null;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facture ${e(x.facture_numero)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:800px;margin:0 auto;padding:24px;line-height:1.5}h1{color:#112233;font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}td.r,th.r{text-align:right}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #112233;padding-bottom:12px;margin-bottom:16px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.tot td{font-weight:bold}@media print{.noprint{display:none}}</style></head><body>
<header><div><h1>Facture ${e(x.facture_numero)}</h1><div>Date : ${dfr(x.facturee_le)} · échéance : ${dfr(ech)}${x.payee_le ? ' · <b>payée le ' + dfr(x.payee_le) + '</b>' : ''}</div></div><img src="/img/logo-horizontal.png" alt="" style="height:44px"></header>
<div class="cols"><div><b>${g('raison_sociale')}</b><br>${e([P.get('adresse'), [P.get('code_postal'), P.get('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', '))}${P.get('siret') ? '<br>SIRET ' + g('siret') : ''}${P.get('tva_intra') ? '<br>TVA ' + g('tva_intra') : ''}</div>
<div><b>${e(p.raison_sociale)}</b><br>${e([p.adresse, p.ville].filter(Boolean).join(', '))}${p.siret ? '<br>SIRET ' + e(p.siret) : ''}</div></div>
<table><thead><tr><th>Désignation</th><th class="r">Montant HT</th></tr></thead><tbody>
<tr><td>Commission d'apport d'affaires (convention ${e(p.convention_numero || '')}) : placement de ${e(x.prenom)} ${e(x.nom)}${x.poste ? ', ' + e(x.poste) : ''}, le ${dfr(x.date_placement)}${x.montant_ca && p.commission_type === 'pourcentage' ? `<br><span style="color:#6b7280">${String(p.commission_valeur).replace('.', ',')} % de ${eur(x.montant_ca)} HT de chiffre d'affaires déclaré</span>` : ''}</td><td class="r">${eur(ht)}</td></tr>
<tr><td class="r">TVA ${String(tva).replace('.', ',')} %</td><td class="r">${eur(tv)}</td></tr><tr class="tot"><td class="r">Total TTC</td><td class="r">${eur(ht + tv)}</td></tr></tbody></table>
<p style="font-size:13px;color:#6b7280;margin-top:18px">Paiement à ${p.delai_paiement} jours${P.get('iban') ? ', par virement : IBAN ' + g('iban') : ''}. Pénalités de retard : ${g('penalites') || 'taux légal'} ; indemnité forfaitaire de 40 € pour frais de recouvrement.</p>
<p class="noprint" style="color:#6b7280;font-size:13px">Pour imprimer ou enregistrer en PDF : menu Imprimer du navigateur (Ctrl + P).</p></body></html>`;
}

function envoyerCv(res, x) {
  if (!x?.cv_fichier) throw ko(404, 'Aucun CV pour ce candidat.');
  const f = path.join(CV_DIR, path.basename(x.cv_fichier));
  if (!fs.existsSync(f)) throw ko(404, 'Fichier du CV introuvable.');
  res.set('Cache-Control', 'private, no-store');
  res.download(f, x.cv_nom || 'cv' + path.extname(x.cv_fichier));
}

/** Données du partenaire envoyées à son espace (sans les notes internes de l'agence). */
const publicPartenaire = p => { const { notes_agence, ...r } = p; return r; }; // eslint-disable-line no-unused-vars

function register(api, h) {
  const { fail, wrap, role } = h;
  if (h.HttpError) HttpErr = h.HttpError;
  const faire = wrap;
  const partenaireBody = (b, ancien = {}) => {
    const p = {};
    for (const k of ['raison_sociale', 'siret', 'adresse', 'ville', 'contact', 'email', 'telephone', 'zones', 'metiers']) if (b[k] !== undefined) p[k] = str(b[k], k === 'zones' || k === 'metiers' ? 300 : 200);
    if (b.conditions !== undefined) p.conditions = str(b.conditions, 2000);
    if (b.notes_agence !== undefined) p.notes_agence = str(b.notes_agence, 3000);
    if (b.commission_type !== undefined) { if (!['forfait', 'pourcentage'].includes(b.commission_type)) fail(400, 'Type de commission invalide.'); p.commission_type = b.commission_type; }
    if (b.commission_valeur !== undefined) p.commission_valeur = nombre(b.commission_valeur);
    const type = p.commission_type || ancien.commission_type || 'forfait', val = p.commission_valeur ?? ancien.commission_valeur ?? 300;
    if (!(val > 0) || (type === 'pourcentage' && val > 100) || val > 100000) fail(400, type === 'pourcentage' ? 'Pourcentage de commission invalide (entre 0 et 100).' : 'Montant de commission invalide.');
    if (b.delai_paiement !== undefined) { p.delai_paiement = parseInt(b.delai_paiement, 10); if (!(p.delai_paiement >= 0 && p.delai_paiement <= 60)) fail(400, 'Délai de paiement invalide (60 jours maximum).'); }
    if (b.duree_garantie !== undefined) { p.duree_garantie = parseInt(b.duree_garantie, 10); if (!(p.duree_garantie >= 1 && p.duree_garantie <= 36)) fail(400, 'Durée de non-contournement invalide (1 à 36 mois).'); }
    if (b.statut !== undefined) { if (!['actif', 'suspendu', 'termine'].includes(b.statut)) fail(400, 'Statut invalide.'); p.statut = b.statut; }
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) fail(400, 'Adresse e-mail invalide.');
    return p;
  };
  const demandeBody = b => {
    const d = { poste: str(b.poste, 100), ville: str(b.ville, 100), nb_postes: parseInt(b.nb_postes || 1, 10), date_debut: b.date_debut || null, date_fin: b.date_fin || null,
      type_contrat: CONTRATS.includes(b.type_contrat) ? b.type_contrat : CONTRATS[0], taux_horaire: nombre(b.taux_horaire), description: str(b.description, 2000),
      job_boards: JSON.stringify((Array.isArray(b.job_boards) ? b.job_boards : b.job_boards ? [b.job_boards] : []).filter(x => JOB_BOARDS.includes(x))) };
    if (!d.poste) fail(400, 'Indiquez le poste à pourvoir.');
    if (!(d.nb_postes >= 1 && d.nb_postes <= 50)) fail(400, 'Nombre de postes invalide (1 à 50).');
    for (const k of ['date_debut', 'date_fin']) if (d[k] && !isDate(d[k])) fail(400, 'Date invalide.');
    if (d.date_debut && d.date_fin && d.date_fin < d.date_debut) fail(400, 'La date de fin précède la date de début.');
    if (d.taux_horaire !== null && !(d.taux_horaire > 0 && d.taux_horaire < 200)) fail(400, 'Taux horaire invalide.');
    return d;
  };
  const insererDemande = (pid, d) => Number(run('INSERT INTO partenaires_demandes (partenaire_id, poste, ville, nb_postes, date_debut, date_fin, type_contrat, taux_horaire, description, job_boards) VALUES (?,?,?,?,?,?,?,?,?,?)',
    pid, d.poste, d.ville || null, d.nb_postes, d.date_debut, d.date_fin, d.type_contrat, d.taux_horaire, d.description, d.job_boards).lastInsertRowid);
  const numeroConvention = () => { const a = h.today().slice(0, 4), n = one('SELECT COUNT(*) n FROM partenaires WHERE convention_numero LIKE ?', `AA-${a}-%`).n + 1; return `AA-${a}-${String(n).padStart(4, '0')}`; };
  const stats = pid => {
    const L = presentationsDe(pid);
    return { demandes_ouvertes: one('SELECT COUNT(*) n FROM partenaires_demandes WHERE partenaire_id = ? AND statut = \'ouverte\'', pid).n, presentes: L.length,
      a_traiter: L.filter(x => x.statut === 'proposee').length, entretiens: L.filter(x => x.statut === 'entretien').length, places: L.filter(x => x.statut === 'placee').length, ...totaux(L) };
  };

  /* ---------- Agence ---------- */
  api.get('/partenaires', role('agence'), (req, res) => {
    const L = all('SELECT p.*, (SELECT username FROM users u WHERE u.partenaire_id = p.id LIMIT 1) AS acces FROM partenaires p ORDER BY p.statut = \'actif\' DESC, p.raison_sociale');
    // Performance des job boards : candidats sourcés, présentés, placés et commissions
    const jb = all(`SELECT COALESCE(c.source, 'Site CHR Intérim') AS source, COUNT(*) AS candidats,
        (SELECT COUNT(*) FROM presentations x WHERE x.source = COALESCE(c.source, 'Site CHR Intérim')) AS presentes,
        (SELECT COUNT(*) FROM presentations x WHERE x.source = COALESCE(c.source, 'Site CHR Intérim') AND x.statut = 'placee') AS places,
        (SELECT COALESCE(SUM(commission_montant), 0) FROM presentations x WHERE x.source = COALESCE(c.source, 'Site CHR Intérim') AND x.commission_statut IN ('a_facturer','facturee','payee')) AS commissions
      FROM candidats c GROUP BY 1 ORDER BY candidats DESC`);
    res.json({ partenaires: L.map(p => ({ ...p, ...stats(p.id) })), job_boards: jb, liste_job_boards: JOB_BOARDS, contrats: CONTRATS });
  });
  api.post('/partenaires', role('agence'), wrap((req, res) => {
    const p = partenaireBody(req.body || {});
    if (!p.raison_sociale) fail(400, 'Indiquez la raison sociale de l\'agence partenaire.');
    const cols = Object.keys(p);
    const id = Number(run(`INSERT INTO partenaires (${cols.join(', ')}, convention_numero) VALUES (${cols.map(() => '?').join(', ')}, ?)`, ...cols.map(k => p[k]), numeroConvention()).lastInsertRowid);
    res.status(201).json(one('SELECT * FROM partenaires WHERE id = ?', id));
  }));
  api.get('/partenaires/:id', role('agence'), wrap((req, res) => {
    const p = one('SELECT p.*, (SELECT username FROM users u WHERE u.partenaire_id = p.id LIMIT 1) AS acces FROM partenaires p WHERE p.id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    res.json({ ...p, ...stats(p.id), demandes: all('SELECT * FROM partenaires_demandes WHERE partenaire_id = ? ORDER BY statut = \'ouverte\' DESC, id DESC', p.id).map(lireDemande), presentations: presentationsDe(p.id) });
  }));
  api.put('/partenaires/:id', role('agence'), wrap((req, res) => {
    const a = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!a) fail(404, 'Partenaire introuvable.');
    const p = partenaireBody(req.body || {}, a); if (p.raison_sociale === '') fail(400, 'La raison sociale est obligatoire.');
    // Conditions financières modifiées après signature : nouvelle convention à signer
    const financier = ['commission_type', 'commission_valeur', 'delai_paiement', 'duree_garantie', 'conditions'].some(k => p[k] !== undefined && p[k] !== a[k]);
    tx(() => {
      const cols = Object.keys(p); if (cols.length) run(`UPDATE partenaires SET ${cols.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...cols.map(k => p[k]), a.id);
      if (financier && a.convention_signee_le) run('UPDATE partenaires SET convention_numero = ?, convention_signee_le = NULL, convention_signee_nom = NULL, convention_signee_mode = NULL WHERE id = ?', numeroConvention(), a.id);
      // Suspension ou fin du partenariat : les comptes du partenaire sont déconnectés
      if (p.statut && p.statut !== 'actif') run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE partenaire_id = ?)', a.id);
    });
    res.json({ ...one('SELECT * FROM partenaires WHERE id = ?', a.id), nouvelle_convention: financier && !!a.convention_signee_le });
  }));
  api.delete('/partenaires/:id', role('agence'), wrap((req, res) => {
    const a = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!a) fail(404, 'Partenaire introuvable.');
    if (one('SELECT 1 FROM presentations WHERE partenaire_id = ? AND commission_statut IN (\'facturee\', \'payee\')', a.id)) fail(409, 'Des commissions ont été facturées à ce partenaire : passez-le en « Partenariat terminé » pour conserver l\'historique.');
    run('DELETE FROM partenaires WHERE id = ?', a.id);
    res.json({ ok: true });
  }));
  api.get('/partenaires/:id/convention', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    res.type('html').send(conventionHtml(p));
  }));
  /** Convention signée sur papier : l'agence l'enregistre. */
  api.post('/partenaires/:id/convention/signer', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    if (p.convention_signee_le) fail(409, 'La convention est déjà signée.');
    const nom = str(req.body?.nom, 120); if (nom.length < 3) fail(400, 'Indiquez le nom et la fonction du signataire.');
    run('UPDATE partenaires SET convention_signee_le = datetime(\'now\'), convention_signee_nom = ?, convention_signee_mode = \'papier\' WHERE id = ?', nom, p.id);
    res.json(one('SELECT * FROM partenaires WHERE id = ?', p.id));
  }));
  api.post('/partenaires/:id/demandes', role('agence'), wrap((req, res) => {
    const p = one('SELECT * FROM partenaires WHERE id = ?', req.params.id); if (!p) fail(404, 'Partenaire introuvable.');
    res.status(201).json(lireDemande(one('SELECT * FROM partenaires_demandes WHERE id = ?', insererDemande(p.id, demandeBody(req.body || {})))));
  }));
  /** Besoins de tous les partenaires (sourcing) avec le nombre de candidats déjà présentés. */
  api.get('/partenaires-demandes', role('agence'), (req, res) => {
    res.json(all(`SELECT d.*, p.raison_sociale, (SELECT COUNT(*) FROM presentations x WHERE x.demande_id = d.id) AS presentes,
      (SELECT COUNT(*) FROM presentations x WHERE x.demande_id = d.id AND x.statut = 'placee') AS places
      FROM partenaires_demandes d JOIN partenaires p ON p.id = d.partenaire_id ORDER BY d.statut = 'ouverte' DESC, COALESCE(d.date_debut, '9999'), d.id DESC`).map(lireDemande));
  });
  api.put('/partenaires-demandes/:id', role('agence'), wrap((req, res) => {
    const d = one('SELECT * FROM partenaires_demandes WHERE id = ?', req.params.id); if (!d) fail(404, 'Besoin introuvable.');
    const b = req.body || {};
    if (b.statut !== undefined && !['ouverte', 'pourvue', 'annulee'].includes(b.statut)) fail(400, 'Statut invalide.');
    const jb = b.job_boards !== undefined ? JSON.stringify((Array.isArray(b.job_boards) ? b.job_boards : [b.job_boards]).filter(x => JOB_BOARDS.includes(x))) : d.job_boards;
    run('UPDATE partenaires_demandes SET statut = ?, job_boards = ?, updated_at = datetime(\'now\') WHERE id = ?', b.statut ?? d.statut, jb, d.id);
    res.json(lireDemande(one('SELECT * FROM partenaires_demandes WHERE id = ?', d.id)));
  }));

  /** Présenter un candidat à un partenaire (avec l'accord du candidat). */
  api.post('/presentations', role('agence'), wrap(async (req, res) => {
    const b = req.body || {};
    const p = one('SELECT * FROM partenaires WHERE id = ?', Number(b.partenaire_id)); if (!p) fail(400, 'Choisissez l\'agence partenaire.');
    if (p.statut !== 'actif') fail(409, 'Ce partenariat n\'est pas actif.');
    const c = one('SELECT * FROM candidats WHERE id = ?', Number(b.candidat_id)); if (!c) fail(400, 'Choisissez le candidat à présenter.');
    if (!c.partage_partenaires && !b.consentement) fail(400, 'Confirmez que le candidat a donné son accord pour être présenté à cette agence partenaire.');
    const r = JSON.parse(c.reponses || '{}');
    const st = require('./sejour').situationCandidat(r, h.today());
    if (st?.niveau === 'interdit') fail(409, `Présentation impossible : ${st.court.toLowerCase()} (pas d'autorisation de travail valable en France).`);
    let demande = null;
    if (b.demande_id) { demande = one('SELECT * FROM partenaires_demandes WHERE id = ? AND partenaire_id = ?', Number(b.demande_id), p.id); if (!demande) fail(400, 'Ce besoin n\'appartient pas à ce partenaire.'); }
    if (one('SELECT 1 FROM presentations WHERE partenaire_id = ? AND candidat_id = ? AND COALESCE(demande_id, 0) = ?', p.id, c.id, demande?.id || 0)) fail(409, 'Ce candidat a déjà été présenté à ce partenaire pour ce besoin.');
    const resume = str(b.resume, 2000) || [r.experience && 'Expérience : ' + r.experience, r.situation && 'Situation : ' + (r.situation === 'Autre' && r.situation_autre ? r.situation_autre : r.situation),
      (r.creneaux || []).length && 'Disponibilités : ' + r.creneaux.join(', '), r.vehicule && 'Véhiculé(e)', (r.formations || []).filter(x => x !== 'Autre').length && 'Formations : ' + r.formations.filter(x => x !== 'Autre').join(', '), r.langues && 'Langues : ' + r.langues].filter(Boolean).join('\n');
    const id = Number(run(`INSERT INTO presentations (partenaire_id, demande_id, candidat_id, prenom, nom, poste, ville, telephone, email, source, resume, cv_fichier, cv_nom, consentement_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      p.id, demande?.id || null, c.id, c.prenom, c.nom, demande?.poste || c.poste, c.ville, c.telephone, c.email, c.source || 'Site CHR Intérim', resume, c.cv_fichier, c.cv_nom).lastInsertRowid);
    run('UPDATE candidats SET partage_partenaires = 1 WHERE id = ?', c.id);
    let envoi = null;
    if (p.email) envoi = await envoyer('mail', { email: p.email }, `Nouveau candidat présenté : ${c.prenom} ${c.nom}`,
      `${P.get('raison_sociale')} vous présente un candidat${demande ? ` pour votre besoin « ${demande.poste} »` : ''} : ${c.prenom} ${c.nom}${c.poste ? ', ' + c.poste : ''}${c.ville ? ', ' + c.ville : ''}.\n\nRetrouvez son profil${c.cv_fichier ? ' et son CV' : ''} dans votre espace partenaire, rubrique « Candidats présentés », et indiquez-nous la suite donnée.`,
      { titre: 'Nouveau candidat présenté', bouton: 'Ouvrir mon espace partenaire' });
    res.status(201).json({ ...one('SELECT * FROM presentations WHERE id = ?', id), envoi: envoi?.statut || null });
  }));
  api.get('/presentations', role('agence'), (req, res) => {
    res.json(all(`SELECT x.*, p.raison_sociale, d.poste AS demande_poste FROM presentations x JOIN partenaires p ON p.id = x.partenaire_id LEFT JOIN partenaires_demandes d ON d.id = x.demande_id
      ${req.query.partenaire_id ? 'WHERE x.partenaire_id = ?' : ''} ORDER BY x.id DESC`, ...(req.query.partenaire_id ? [Number(req.query.partenaire_id)] : [])));
  });
  api.put('/presentations/:id', role('agence'), faire((req, res) => {
    const x = one('SELECT * FROM presentations WHERE id = ?', req.params.id); if (!x) fail(404, 'Présentation introuvable.');
    res.json(majPresentation(x, req.body || {}, false));
  }));
  api.delete('/presentations/:id', role('agence'), wrap((req, res) => {
    const x = one('SELECT * FROM presentations WHERE id = ?', req.params.id); if (!x) fail(404, 'Présentation introuvable.');
    if (['facturee', 'payee'].includes(x.commission_statut)) fail(409, 'Commission facturée : la présentation est conservée.');
    run('DELETE FROM presentations WHERE id = ?', x.id); res.json({ ok: true });
  }));
  api.get('/presentations/:id/cv', role('agence'), faire((req, res) => envoyerCv(res, one('SELECT * FROM presentations WHERE id = ?', req.params.id))));
  /** Facturer la commission d'un placement (numéro COM-AAAA-0001), puis la marquer payée. */
  api.post('/presentations/:id/facturer', role('agence'), wrap((req, res) => {
    const x = one('SELECT * FROM presentations WHERE id = ?', req.params.id); if (!x) fail(404, 'Présentation introuvable.');
    if (x.commission_statut !== 'a_facturer') fail(409, x.commission_statut === 'attente_ca' ? 'En attente du chiffre d\'affaires déclaré par le partenaire.' : 'Aucune commission à facturer sur ce candidat.');
    const a = h.today().slice(0, 4), n = one('SELECT COUNT(*) n FROM presentations WHERE facture_numero LIKE ?', `COM-${a}-%`).n + 1;
    run('UPDATE presentations SET commission_statut = \'facturee\', facture_numero = ?, facturee_le = ?, updated_at = datetime(\'now\') WHERE id = ?', `COM-${a}-${String(n).padStart(4, '0')}`, h.today(), x.id);
    res.json(one('SELECT * FROM presentations WHERE id = ?', x.id));
  }));
  api.post('/presentations/:id/payee', role('agence'), wrap((req, res) => {
    const x = one('SELECT * FROM presentations WHERE id = ?', req.params.id); if (!x) fail(404, 'Présentation introuvable.');
    if (x.commission_statut !== 'facturee') fail(409, 'Facturez d\'abord la commission.');
    run('UPDATE presentations SET commission_statut = \'payee\', payee_le = ?, updated_at = datetime(\'now\') WHERE id = ?', h.today(), x.id);
    res.json(one('SELECT * FROM presentations WHERE id = ?', x.id));
  }));
  api.get('/presentations/:id/facture', role('agence'), wrap((req, res) => {
    const x = one('SELECT * FROM presentations WHERE id = ?', req.params.id); if (!x?.facture_numero) fail(404, 'Facture introuvable.');
    res.type('html').send(factureHtml(x, one('SELECT * FROM partenaires WHERE id = ?', x.partenaire_id)));
  }));
  /** Candidat trouvé sur un job board, saisi par l'agence (CV facultatif). */
  api.post('/candidats/sourcing', role('agence'), (req, res, next) => upload.single('cv')(req, res, x => x ? next(x.code === 'LIMIT_FILE_SIZE' ? ko(400, 'CV trop volumineux (5 Mo maximum).') : x) : next()), wrap((req, res) => {
    const b = req.body || {};
    const c = { prenom: str(b.prenom, 80), nom: str(b.nom, 80), telephone: str(b.telephone, 30), email: str(b.email, 120), ville: str(b.ville, 100), poste: str(b.poste, 100) };
    if (!c.prenom || !c.nom) fail(400, 'Indiquez le prénom et le nom du candidat.');
    if (!c.telephone && !c.email) fail(400, 'Indiquez un téléphone ou un e-mail.');
    const source = JOB_BOARDS.includes(b.source) ? b.source : 'Autre';
    let fichier = null;
    if (req.file) {
      const f = FORMATS[req.file.mimetype];
      if (!f || !f[1](req.file.buffer)) fail(400, 'CV refusé : PDF, Word ou image uniquement.');
      fichier = crypto.randomBytes(16).toString('hex') + f[0];
      fs.writeFileSync(path.join(CV_DIR, fichier), req.file.buffer);
    }
    const r = { prenom: c.prenom, nom: c.nom, telephone: c.telephone, email: c.email, ville: c.ville, ...(c.poste ? { postes: [c.poste], poste_principal: c.poste } : {}),
      ...(b.experience ? { experience: str(b.experience, 100) } : {}), ...(b.message ? { message: str(b.message, 2000) } : {}), ...(b.annonce ? { annonce: str(b.annonce, 300) } : {}) };
    const id = Number(run('INSERT INTO candidats (prenom, nom, telephone, email, ville, poste, reponses, cv_fichier, cv_nom, source, partage_partenaires) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      c.prenom, c.nom, c.telephone || null, c.email || null, c.ville || null, c.poste || null, JSON.stringify(r), fichier, req.file ? String(req.file.originalname).slice(0, 120) : null, source, b.partage ? 1 : 0).lastInsertRowid);
    res.status(201).json({ id });
  }));

  /* ---------- Espace partenaire ---------- */
  const moi = req => { const p = one('SELECT * FROM partenaires WHERE id = ?', req.user.partenaire_id); if (!p) fail(404, 'Partenaire introuvable.'); return p; };
  const mienne = (req, table) => { const x = one(`SELECT * FROM ${table} WHERE id = ? AND partenaire_id = ?`, req.params.id, req.user.partenaire_id); if (!x) fail(404, 'Élément introuvable.'); return x; };
  const P_ = role('partenaire');
  api.get('/partenaire/tableau', P_, wrap((req, res) => {
    const p = moi(req), L = presentationsDe(p.id);
    res.json({ partenaire: publicPartenaire(p), commission: libCommission(p), stats: stats(p.id),
      agence: { nom: P.get('raison_sociale'), email: P.get('email'), telephone: P.get('telephone') },
      a_traiter: L.filter(x => x.statut === 'proposee').slice(0, 10).map(pourPartenaire),
      demandes: all('SELECT d.*, (SELECT COUNT(*) FROM presentations x WHERE x.demande_id = d.id) AS presentes FROM partenaires_demandes d WHERE partenaire_id = ? AND statut = \'ouverte\' ORDER BY id DESC', p.id).map(lireDemande),
      job_boards: JOB_BOARDS, contrats: CONTRATS });
  }));
  api.get('/partenaire/demandes', P_, (req, res) => res.json(all(`SELECT d.*, (SELECT COUNT(*) FROM presentations x WHERE x.demande_id = d.id) AS presentes,
    (SELECT COUNT(*) FROM presentations x WHERE x.demande_id = d.id AND x.statut = 'placee') AS places FROM partenaires_demandes d WHERE partenaire_id = ? ORDER BY d.statut = 'ouverte' DESC, d.id DESC`, req.user.partenaire_id).map(lireDemande)));
  api.post('/partenaire/demandes', P_, wrap(async (req, res) => {
    const p = moi(req), d = demandeBody(req.body || {}), id = insererDemande(p.id, d);
    run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Nouveau besoin du partenaire ${p.raison_sociale} : ${d.nb_postes} × ${d.poste}${d.ville ? ', ' + d.ville : ''}`);
    if (P.get('email')) await envoyer('mail', { email: P.get('email') }, `Besoin de recrutement : ${p.raison_sociale}`,
      `L'agence partenaire ${p.raison_sociale} demande ${d.nb_postes} × ${d.poste}${d.ville ? ' à ' + d.ville : ''}${d.date_debut ? ' à partir du ' + dfr(d.date_debut) : ''} (${d.type_contrat}).${d.description ? '\n\n' + d.description : ''}\n\nRetrouvez le besoin dans l'espace agence, rubrique Partenariats › Sourcing job boards.`,
      { titre: 'Nouveau besoin d\'un partenaire', bouton: 'Ouvrir le sourcing' });
    res.status(201).json(lireDemande(one('SELECT * FROM partenaires_demandes WHERE id = ?', id)));
  }));
  api.put('/partenaire/demandes/:id', P_, wrap((req, res) => {
    const d = mienne(req, 'partenaires_demandes'), b = req.body || {};
    if (b.statut !== undefined) {
      if (!['ouverte', 'pourvue', 'annulee'].includes(b.statut)) fail(400, 'Statut invalide.');
      run('UPDATE partenaires_demandes SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?', b.statut, d.id);
    } else {
      const n = demandeBody({ ...lireDemande(d), ...b });
      run('UPDATE partenaires_demandes SET poste = ?, ville = ?, nb_postes = ?, date_debut = ?, date_fin = ?, type_contrat = ?, taux_horaire = ?, description = ?, job_boards = ?, updated_at = datetime(\'now\') WHERE id = ?',
        n.poste, n.ville || null, n.nb_postes, n.date_debut, n.date_fin, n.type_contrat, n.taux_horaire, n.description, n.job_boards, d.id);
    }
    res.json(lireDemande(one('SELECT * FROM partenaires_demandes WHERE id = ?', d.id)));
  }));
  api.get('/partenaire/presentations', P_, (req, res) => res.json(presentationsDe(req.user.partenaire_id).map(pourPartenaire)));
  api.put('/partenaire/presentations/:id', P_, faire((req, res) => {
    const x = mienne(req, 'presentations'), b = req.body || {};
    res.json(pourPartenaire(majPresentation(x, { statut: b.statut, retour_partenaire: b.retour_partenaire, date_placement: b.date_placement, montant_ca: b.montant_ca }, true)));
  }));
  api.get('/partenaire/presentations/:id/cv', P_, faire((req, res) => envoyerCv(res, mienne(req, 'presentations'))));
  api.get('/partenaire/commissions', P_, (req, res) => {
    const p = moi(req), L = presentationsDe(p.id).filter(x => x.statut === 'placee' || x.commission_statut !== 'non_due').map(pourPartenaire);
    res.json({ commission: libCommission(p), delai_paiement: p.delai_paiement, lignes: L, totaux: totaux(L) });
  });
  api.get('/partenaire/factures/:id', P_, wrap((req, res) => {
    const x = mienne(req, 'presentations'); if (!x.facture_numero) fail(404, 'Facture introuvable.');
    res.type('html').send(factureHtml(x, moi(req)));
  }));
  api.get('/partenaire/convention', P_, wrap((req, res) => res.type('html').send(conventionHtml(moi(req)))));
  api.post('/partenaire/convention/signer', P_, wrap((req, res) => {
    const p = moi(req);
    if (p.convention_signee_le) fail(409, 'La convention est déjà signée.');
    const nom = str(req.body?.nom, 120); if (nom.length < 3) fail(400, 'Indiquez le nom et la fonction du signataire.');
    if (!req.body?.accepte) fail(400, 'Cochez la case d\'acceptation pour signer.');
    run('UPDATE partenaires SET convention_signee_le = datetime(\'now\'), convention_signee_nom = ?, convention_signee_mode = \'en_ligne\' WHERE id = ?', nom, p.id);
    run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Convention d'apporteur d'affaires signée par ${p.raison_sociale} (${nom})`);
    res.json(publicPartenaire(one('SELECT * FROM partenaires WHERE id = ?', p.id)));
  }));
}

module.exports = { register, JOB_BOARDS, CONTRATS, commission, sourceDepuisLien };
