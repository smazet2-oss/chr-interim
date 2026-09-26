'use strict';
// Dossier de l'intérimaire : expériences (CV), pièces légales, contrats de mission et fiches de paie.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const { one, all, run, tx, DATA_DIR } = require('./db');
const P = require('./parametres');

const PIECES_DIR = path.join(DATA_DIR, 'pieces');
fs.mkdirSync(PIECES_DIR, { recursive: true });

/**
 * Pièces à fournir pour un contrat de mission.
 * obligatoire : toujours exigée · condition : exigée selon la situation (nationalité, âge).
 */
const PIECES = [
  { type: 'identite', label: 'Pièce d\'identité en cours de validité', detail: 'Carte nationale d\'identité (recto verso) ou passeport.', obligatoire: true, expiration: true },
  { type: 'titre_sejour', label: 'Titre de séjour autorisant à travailler', detail: 'Obligatoire pour les personnes qui ne sont pas ressortissantes de l\'Union européenne, de l\'Espace économique européen ou de la Suisse. L\'agence en vérifie l\'authenticité auprès de la préfecture avant la première mission.', condition: 'etranger', expiration: true },
  { type: 'secu', label: 'Carte Vitale ou attestation de droits à l\'Assurance maladie', detail: 'Pour votre numéro de sécurité sociale.', obligatoire: true },
  { type: 'rib', label: 'RIB à votre nom', detail: 'Pour le versement de votre salaire.', obligatoire: true },
  { type: 'domicile', label: 'Justificatif de domicile de moins de 3 mois', detail: 'Facture d\'énergie ou de téléphone, quittance de loyer, avis d\'imposition, ou attestation d\'hébergement avec la pièce d\'identité de l\'hébergeant.', obligatoire: true },
  { type: 'autorisation_parentale', label: 'Autorisation parentale', detail: 'Obligatoire si vous avez moins de 18 ans.', condition: 'mineur' },
  { type: 'diplomes', label: 'Diplômes et certificats liés au poste', detail: 'CAP ou BEP, attestation de formation à l\'hygiène alimentaire (HACCP), permis d\'exploitation, etc.' },
  { type: 'medical', label: 'Attestation de suivi médical', detail: 'Si vous avez déjà passé une visite d\'information et de prévention (médecine du travail) pour ce type de poste.' },
  { type: 'permis', label: 'Permis de conduire', detail: 'Seulement si le poste l\'exige.' },
  { type: 'cv', label: 'CV', detail: 'Facultatif : vos expériences peuvent être saisies dans votre profil.' },
];
const PIECE_TYPES = new Set(PIECES.map(p => p.type));
const NATIONALITES = ['Française', 'Union européenne / EEE / Suisse', 'Autre'];

function age(dateNaissance, ref) {
  if (!dateNaissance) return null;
  const n = new Date(dateNaissance + 'T12:00'), r = new Date(ref + 'T12:00');
  let a = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) a--;
  return a;
}
/** Pièces exigées pour cet intérimaire, selon sa nationalité et son âge. */
function piecesRequises(i, today) {
  return PIECES.filter(p => p.obligatoire
    || (p.condition === 'etranger' && i.nationalite === 'Autre')
    || (p.condition === 'mineur' && (age(i.date_naissance, today) ?? 99) < 18)).map(p => p.type);
}
function etatDossier(iid, today) {
  const i = one('SELECT * FROM interimaires WHERE id = ?', iid);
  const pieces = all('SELECT type, statut, expire_le FROM pieces WHERE interim_id = ?', iid);
  const requises = piecesRequises(i, today);
  const manquantes = requises.filter(t => !pieces.some(p => p.type === t && p.statut === 'valide' && (!p.expire_le || p.expire_le >= today)));
  return { requises, manquantes, complet: manquantes.length === 0 };
}
function majDossierComplet(iid, today) {
  run('UPDATE interimaires SET dossier_complet = ? WHERE id = ?', etatDossier(iid, today).complet ? 1 : 0, iid);
}

/** Quinzaine (1–15 ou 16–fin de mois) contenant la date. */
function quinzaine(iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10)), p = iso.slice(0, 8);
  if (d <= 15) return [p + '01', p + '15'];
  return [p + '16', p + String(new Date(y, m, 0).getDate()).padStart(2, '0')];
}

/** Travail restant à faire pour qu'un relevé d'heures soit payable. */
function manque(h) {
  if (!h.valide_interim) return 'Confirmation de vos heures';
  if (h.extra_statut === 'attente') return 'Accord de l\'employeur sur les heures en plus';
  if (!h.valide_client) return 'Validation par l\'employeur';
  return null;
}

module.exports = function register(api, h) {
  const { fail, str, isDate, today, wrap, role, HttpError } = h;

  const uploadPiece = multer({
    storage: multer.diskStorage({ destination: PIECES_DIR, filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex')) }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, f, cb) => {
      const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(f.mimetype);
      cb(ok ? null : new HttpError(400, 'Format refusé : PDF ou photo (JPG, PNG, HEIC) uniquement.'), ok);
    },
  });
  const uploadPdf = multer({
    storage: multer.diskStorage({ destination: PIECES_DIR, filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex')) }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, f, cb) => cb(f.mimetype === 'application/pdf' ? null : new HttpError(400, 'La fiche de paie doit être un PDF.'), f.mimetype === 'application/pdf'),
  });
  const nomFichier = f => str(Buffer.from(f.originalname, 'latin1').toString('utf8'), 150);
  /** Intérimaire concerné : soi-même, ou n'importe lequel pour l'agence. */
  function cible(req, id) {
    if (req.user.profil === 'interim') {
      if (id && Number(id) !== req.user.interim_id) fail(404, 'Intérimaire introuvable.');
      return req.user.interim_id;
    }
    if (req.user.profil !== 'agence') fail(403, 'Accès refusé.');
    const iid = Number(id);
    if (!one('SELECT 1 FROM interimaires WHERE id = ?', iid)) fail(404, 'Intérimaire introuvable.');
    return iid;
  }

  /* ----- Expériences ----- */
  api.get('/interimaires/:id/experiences', wrap((req, res) => {
    const iid = cible(req, req.params.id);
    res.json(all('SELECT * FROM experiences WHERE interim_id = ? ORDER BY debut DESC, id DESC', iid));
  }));
  api.post('/interimaires/:id/experiences', role('agence', 'interim'), wrap((req, res) => {
    const iid = cible(req, req.params.id), b = req.body;
    const employeur = str(b.employeur, 150), poste = str(b.poste, 100);
    if (!employeur || !poste) fail(400, 'Indiquez l\'employeur et le poste.');
    if (!isDate(b.debut)) fail(400, 'Date de début invalide.');
    if (b.fin && !isDate(b.fin)) fail(400, 'Date de fin invalide.');
    if (b.fin && b.fin < b.debut) fail(400, 'La date de fin est avant la date de début.');
    const r = run('INSERT INTO experiences (interim_id, debut, fin, employeur, poste, description) VALUES (?,?,?,?,?,?)',
      iid, b.debut, b.fin || null, employeur, poste, str(b.description, 1000) || null);
    res.status(201).json(one('SELECT * FROM experiences WHERE id = ?', r.lastInsertRowid));
  }));
  api.delete('/experiences/:id', role('agence', 'interim'), wrap((req, res) => {
    const e = one('SELECT * FROM experiences WHERE id = ?', req.params.id);
    if (!e || (req.user.profil === 'interim' && e.interim_id !== req.user.interim_id)) fail(404, 'Expérience introuvable.');
    if (e.source === 'mission' && req.user.profil !== 'agence') fail(403, 'Les missions réalisées avec l\'agence ne peuvent pas être retirées.');
    run('DELETE FROM experiences WHERE id = ?', e.id);
    res.json({ ok: true });
  }));

  /* ----- Pièces du dossier ----- */
  api.get('/pieces/types', (req, res) => res.json({ pieces: PIECES, nationalites: NATIONALITES }));
  api.get('/interimaires/:id/pieces', wrap((req, res) => {
    const iid = cible(req, req.params.id);
    res.json({
      pieces: all('SELECT id, type, nom, mime, taille, expire_le, statut, commentaire, created_at FROM pieces WHERE interim_id = ? ORDER BY id DESC', iid),
      ...etatDossier(iid, today()),
    });
  }));
  api.post('/interimaires/:id/pieces', role('agence', 'interim'), uploadPiece.single('fichier'), wrap((req, res) => {
    const drop = () => req.file && fs.rmSync(req.file.path, { force: true });
    try {
      const iid = cible(req, req.params.id);
      if (!req.file) fail(400, 'Aucun fichier reçu.');
      if (!PIECE_TYPES.has(req.body.type)) fail(400, 'Type de pièce inconnu.');
      const exp = req.body.expire_le || null;
      if (exp && !isDate(exp)) fail(400, 'Date d\'expiration invalide.');
      if (exp && exp < today()) fail(400, 'Ce document est expiré.');
      const r = run('INSERT INTO pieces (interim_id, type, nom, fichier, mime, taille, expire_le, statut) VALUES (?,?,?,?,?,?,?,?)',
        iid, req.body.type, nomFichier(req.file), req.file.filename, req.file.mimetype, req.file.size, exp,
        req.user.profil === 'agence' ? 'valide' : 'a_verifier');
      majDossierComplet(iid, today());
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch (e) { drop(); throw e; }
  }));
  function pieceAccessible(req) {
    const p = one('SELECT * FROM pieces WHERE id = ?', req.params.id);
    if (!p || (req.user.profil === 'interim' && p.interim_id !== req.user.interim_id) || req.user.profil === 'client') fail(404, 'Document introuvable.');
    return p;
  }
  api.get('/pieces/:id/fichier', wrap((req, res) => {
    const p = pieceAccessible(req);
    res.set('Content-Type', p.mime);
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(p.nom)}`);
    res.sendFile(path.join(PIECES_DIR, path.basename(p.fichier)));
  }));
  api.post('/pieces/:id/statut', role('agence'), wrap((req, res) => {
    const p = pieceAccessible(req);
    if (!['valide', 'refuse'].includes(req.body.statut)) fail(400, 'Statut invalide.');
    const com = str(req.body.commentaire, 300);
    if (req.body.statut === 'refuse' && !com) fail(400, 'Indiquez la raison du refus : l\'intérimaire la verra.');
    run('UPDATE pieces SET statut = ?, commentaire = ? WHERE id = ?', req.body.statut, com || null, p.id);
    majDossierComplet(p.interim_id, today());
    if (req.body.statut === 'refuse') {
      run('INSERT INTO notifications (interim_id, message) VALUES (?,?)', p.interim_id, `Document refusé (${PIECES.find(x => x.type === p.type)?.label}) : ${com}`);
    }
    res.json({ ok: true });
  }));
  api.delete('/pieces/:id', role('agence', 'interim'), wrap((req, res) => {
    const p = pieceAccessible(req);
    if (req.user.profil === 'interim' && p.statut === 'valide') fail(403, 'Un document validé ne peut être retiré que par l\'agence.');
    run('DELETE FROM pieces WHERE id = ?', p.id);
    fs.rmSync(path.join(PIECES_DIR, path.basename(p.fichier)), { force: true });
    majDossierComplet(p.interim_id, today());
    res.json({ ok: true });
  }));

  /* ----- Contrats de mission ----- */
  const CONTRAT_SQL = `SELECT k.*, m.poste, m.date, m.debut, m.fin, m.taux_horaire, m.motif, m.client_id,
    c.nom AS client_nom, c.adresse AS client_adresse, c.ville AS client_ville,
    i.prenom, i.nom AS interim_nom, i.ville AS interim_ville, i.date_naissance, i.nationalite
    FROM contrats k JOIN missions m ON m.id = k.mission_id JOIN clients c ON c.id = m.client_id JOIN interimaires i ON i.id = k.interim_id`;
  function contratAccessible(req) {
    const k = one(CONTRAT_SQL + ' WHERE k.id = ?', req.params.id);
    if (!k || (req.user.profil === 'interim' && k.interim_id !== req.user.interim_id)) fail(404, 'Contrat introuvable.');
    if (req.user.profil === 'client') fail(404, 'Contrat introuvable.');
    return k;
  }
  api.get('/contrats', role('agence', 'interim'), (req, res) => {
    const rows = req.user.profil === 'agence'
      ? all(CONTRAT_SQL + (req.query.interim_id ? ' WHERE k.interim_id = ?' : '') + ' ORDER BY m.date DESC', ...(req.query.interim_id ? [Number(req.query.interim_id)] : []))
      : all(CONTRAT_SQL + ' WHERE k.interim_id = ? ORDER BY m.date DESC', req.user.interim_id);
    res.json(rows.map(({ signe_ip, ...k }) => k));
  });
  api.post('/contrats/:id/signer', role('interim'), wrap((req, res) => {
    const k = contratAccessible(req);
    if (k.statut !== 'a_signer') fail(409, k.statut === 'signe' ? 'Ce contrat est déjà signé.' : 'Ce contrat est annulé.');
    if (!req.body.accepte) fail(400, 'Cochez la case pour confirmer que vous avez lu le contrat.');
    const nom = str(req.body.nom, 120);
    const attendu = `${k.prenom} ${k.interim_nom}`;
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (norm(nom) !== norm(attendu)) fail(400, `Pour signer, saisissez exactement votre nom : ${attendu}.`);
    run('UPDATE contrats SET statut = \'signe\', signe_le = datetime(\'now\'), signe_nom = ?, signe_ip = ? WHERE id = ?', nom, req.ip, k.id);
    res.json({ ok: true });
  }));
  /** Contrat lisible et imprimable (HTML). */
  api.get('/contrats/:id/document', wrap((req, res) => {
    const k = contratAccessible(req);
    const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const cfg = k => P.get(k) ? e(P.get(k)) : '<mark>[à compléter]</mark>';
    const adresse = [P.get('adresse'), [P.get('code_postal'), P.get('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const pc = k => String(P.num(k, 10)).replace('.', ',');
    const d = new Date(k.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const taux = Number(k.taux_horaire).toFixed(2).replace('.', ',');
    const usage = /usage|saisonnier/i.test(k.motif);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrat ${e(k.numero)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:24px auto;padding:0 20px;color:#111;line-height:1.55;font-size:15px}
h1{font-size:22px;text-align:center;margin-bottom:4px}p.sub{text-align:center;color:#555;margin-top:0}h2{font-size:15px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #999;padding-bottom:3px;margin-top:26px}
dl{display:grid;grid-template-columns:220px 1fr;gap:4px 14px;margin:8px 0}dt{color:#555}dd{margin:0}mark{background:#fde68a}
.sig{border:1px solid #999;padding:12px 14px;margin-top:10px}.ok{color:#166534;font-weight:bold}.wait{color:#92400e;font-weight:bold}
.entete{background:#112233;margin:-24px -20px 22px;padding:18px 24px;border-bottom:5px solid #C99948;-webkit-print-color-adjust:exact;print-color-adjust:exact}.entete img{display:block;height:58px;width:auto;max-width:100%}h2{border-bottom-color:#C99948!important}
@media print{body{margin:0}.entete{margin:0 0 22px}} @media (max-width:560px){body{font-size:14px;padding:0 14px}.entete{margin:-24px -14px 18px;padding:14px}.entete img{height:26px}h1{font-size:18px}h2{font-size:13px}} @media (max-width:560px){dl{grid-template-columns:1fr}dt{margin-top:6px}}</style></head><body>
<div class="entete"><picture><source media="(max-width: 560px)" srcset="/img/logo-compact.png"><img src="/img/logo-horizontal.png" alt="CHR Intérim, spécialiste des métiers HCR"></picture></div>
<h1>Contrat de mission (travail temporaire)</h1><p class="sub">N° ${e(k.numero)} · établi le ${new Date(k.created_at + 'Z').toLocaleDateString('fr-FR')}</p>
<h2>Entreprise de travail temporaire</h2><dl><dt>Raison sociale</dt><dd>${cfg('raison_sociale')}${P.get('forme_juridique') ? ' (' + e(P.get('forme_juridique')) + ')' : ''}</dd><dt>Adresse</dt><dd>${adresse ? e(adresse) : '<mark>[à compléter]</mark>'}</dd><dt>SIRET</dt><dd>${cfg('siret')}</dd><dt>Garantie financière</dt><dd>${cfg('garantie_financiere')}</dd>${P.get('telephone') || P.get('email') ? `<dt>Contact</dt><dd>${e([P.get('telephone'), P.get('email')].filter(Boolean).join(' · '))}</dd>` : ''}</dl>
<h2>Salarié intérimaire</h2><dl><dt>Nom et prénom</dt><dd>${e(k.interim_nom.toUpperCase())} ${e(k.prenom)}</dd><dt>Date de naissance</dt><dd>${k.date_naissance ? new Date(k.date_naissance + 'T12:00').toLocaleDateString('fr-FR') : '<mark>[à compléter]</mark>'}</dd><dt>Nationalité</dt><dd>${e(k.nationalite)}</dd><dt>Ville</dt><dd>${e(k.interim_ville || '')}</dd></dl>
<h2>Entreprise utilisatrice</h2><dl><dt>Raison sociale</dt><dd>${e(k.client_nom)}</dd><dt>Lieu de mission</dt><dd>${e([k.client_adresse, k.client_ville].filter(Boolean).join(', ')) || '<mark>[à compléter]</mark>'}</dd></dl>
<h2>Mission</h2><dl><dt>Motif de recours</dt><dd>${e(k.motif)}</dd><dt>Poste et qualification</dt><dd>${e(k.poste)}</dd><dt>Date</dt><dd>${e(d)}</dd><dt>Horaires</dt><dd>${e(k.debut)} – ${e(k.fin)}</dd><dt>Terme de la mission</dt><dd>${new Date(k.date + 'T12:00').toLocaleDateString('fr-FR')}, fin de service</dd><dt>Période d'essai</dt><dd>2 jours (mission d'un mois au plus)</dd></dl>
<h2>Rémunération</h2><dl><dt>Salaire horaire brut</dt><dd>${taux} €, identique à celui d'un salarié de qualification équivalente de l'entreprise utilisatrice</dd>
<dt>Indemnité de fin de mission</dt><dd>${usage ? 'Non due pour ce motif de recours (article L1251-33 du Code du travail)' : `${pc('ifm_taux')} % de la rémunération brute totale`}</dd><dt>Indemnité compensatrice de congés payés</dt><dd>${pc('iccp_taux')} % de la rémunération totale, indemnité de fin de mission comprise</dd><dt>Heures supplémentaires</dt><dd>Majorées selon la convention collective ${e(P.get('convention'))}, après accord de l'entreprise utilisatrice</dd></dl>
<h2>Protection sociale</h2><dl><dt>Caisse de retraite complémentaire</dt><dd>${cfg('caisse_retraite')}</dd><dt>Organisme de prévoyance</dt><dd>${cfg('organisme_prevoyance')}</dd></dl>
<h2>Mentions</h2><p>L'embauche du salarié par l'entreprise utilisatrice à l'issue de la mission n'est pas interdite. Le salarié bénéficie des équipements collectifs de l'entreprise utilisatrice (restauration, transports) dans les mêmes conditions que ses salariés. Les documents de prise de poste de l'entreprise utilisatrice (règlement intérieur, consignes de sécurité et d'hygiène) sont disponibles dans l'espace intérimaire.</p>
<h2>Signature</h2><div class="sig">${k.statut === 'signe' ? `<span class="ok">Signé électroniquement</span> par ${e(k.signe_nom)} le ${new Date(k.signe_le + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.` : k.statut === 'annule' ? '<span class="wait">Contrat annulé.</span>' : '<span class="wait">En attente de la signature du salarié.</span>'}</div>
</body></html>`);
  }));

  /* ----- Fiches de paie ----- */
  const HEURES_VALIDEES = `SELECT h.id, h.interim_id, m.date, m.taux_horaire,
    h.heures_prevues + CASE WHEN h.extra_statut = 'accepte' THEN h.extra ELSE 0 END AS total
    FROM heures h JOIN missions m ON m.id = h.mission_id
    WHERE h.valide_interim = 1 AND h.valide_client = 1 AND h.extra_statut != 'attente' AND m.date BETWEEN ? AND ?
    AND h.id NOT IN (SELECT heure_id FROM bulletin_heures)`;
  const EN_SUSPENS = `SELECT h.*, m.date, m.debut, m.fin, c.nom AS client_nom FROM heures h JOIN missions m ON m.id = h.mission_id JOIN clients c ON c.id = m.client_id
    WHERE h.interim_id = ? AND m.date <= ? AND h.id NOT IN (SELECT heure_id FROM bulletin_heures)
    AND (h.valide_interim = 0 OR h.valide_client = 0 OR h.extra_statut = 'attente')`;
  const calcul = (heures, brut) => { const ifm = brut * P.num('ifm_taux', 10) / 100, iccp = (brut + ifm) * P.num('iccp_taux', 10) / 100; return { heures, brut, ifm, iccp, total: brut + ifm + iccp }; };
  const r2 = n => Math.round(n * 100) / 100;

  function avecAlerte(b) {
    const bloquees = all(EN_SUSPENS + ' AND m.date BETWEEN ? AND ?', b.interim_id, today(), b.debut, b.fin);
    const { fichier, ...rest } = b;
    return { ...rest, a_fichier: !!fichier, bloquees: bloquees.map(x => ({ date: x.date, client_nom: x.client_nom, manque: manque(x) })) };
  }
  api.get('/bulletins', role('agence', 'interim'), (req, res) => {
    const rows = req.user.profil === 'agence'
      ? all('SELECT b.*, i.prenom, i.nom FROM bulletins b JOIN interimaires i ON i.id = b.interim_id ORDER BY b.debut DESC, i.nom')
      : all('SELECT * FROM bulletins WHERE interim_id = ? ORDER BY debut DESC', req.user.interim_id);
    res.json(rows.map(avecAlerte));
  });
  /** Pour l'intérimaire : heures pas encore sur une fiche de paie, par quinzaine, avec ce qui bloque le paiement. */
  api.get('/paie/en-cours', role('interim'), (req, res) => {
    const iid = req.user.interim_id, t = today();
    const suspens = all(EN_SUSPENS, iid, t);
    const valides = all(`${HEURES_VALIDEES} AND h.interim_id = ?`, '0000-01-01', t, iid);
    const P = {};
    const per = d => { const [a, b] = quinzaine(d); return (P[a] = P[a] || { debut: a, fin: b, heures: 0, brut: 0, bloquees: [] }); };
    valides.forEach(v => { const p = per(v.date); p.heures += v.total; p.brut += v.total * v.taux_horaire; });
    suspens.forEach(s => per(s.date).bloquees.push({ date: s.date, client_nom: s.client_nom, manque: manque(s) }));
    res.json(Object.values(P).sort((a, b) => b.debut.localeCompare(a.debut)).map(p => ({ ...p, ...calcul(p.heures, r2(p.brut)) })));
  });
  api.post('/bulletins/generer', role('agence'), wrap((req, res) => {
    const { debut, fin } = req.body;
    if (!isDate(debut) || !isDate(fin) || debut > fin) fail(400, 'Période invalide.');
    const lignes = all(HEURES_VALIDEES, debut, fin);
    const par = {};
    lignes.forEach(l => (par[l.interim_id] = par[l.interim_id] || []).push(l));
    let n = 0;
    tx(() => {
      for (const [iid, ls] of Object.entries(par)) {
        const c = calcul(ls.reduce((s, l) => s + l.total, 0), r2(ls.reduce((s, l) => s + l.total * l.taux_horaire, 0)));
        const r = run('INSERT INTO bulletins (interim_id, debut, fin, heures, brut, ifm, iccp, total) VALUES (?,?,?,?,?,?,?,?)',
          iid, debut, fin, c.heures, c.brut, r2(c.ifm), r2(c.iccp), r2(c.total));
        ls.forEach(l => run('INSERT INTO bulletin_heures (bulletin_id, heure_id) VALUES (?,?)', r.lastInsertRowid, l.id));
        run('INSERT INTO notifications (interim_id, message) VALUES (?,?)', iid, `Fiche de paie du ${debut} au ${fin} disponible.`);
        n++;
      }
    });
    res.json({ crees: n });
  }));
  function bulletinAccessible(req) {
    const b = one('SELECT * FROM bulletins WHERE id = ?', req.params.id);
    if (!b || (req.user.profil === 'interim' && b.interim_id !== req.user.interim_id) || req.user.profil === 'client') fail(404, 'Fiche de paie introuvable.');
    return b;
  }
  api.post('/bulletins/:id/payer', role('agence'), wrap((req, res) => {
    const b = bulletinAccessible(req);
    if (b.statut === 'paye') fail(409, 'Déjà payée.');
    run('UPDATE bulletins SET statut = \'paye\', paye_le = ? WHERE id = ?', today(), b.id);
    run('INSERT INTO notifications (interim_id, message) VALUES (?,?)', b.interim_id, `Salaire du ${b.debut} au ${b.fin} versé.`);
    res.json({ ok: true });
  }));
  api.post('/bulletins/:id/fichier', role('agence'), uploadPdf.single('fichier'), wrap((req, res) => {
    const b = bulletinAccessible(req);
    if (!req.file) fail(400, 'Aucun fichier reçu.');
    if (b.fichier) fs.rmSync(path.join(PIECES_DIR, path.basename(b.fichier)), { force: true });
    run('UPDATE bulletins SET fichier = ?, fichier_nom = ? WHERE id = ?', req.file.filename, nomFichier(req.file), b.id);
    res.json({ ok: true });
  }));
  api.get('/bulletins/:id/fichier', wrap((req, res) => {
    const b = bulletinAccessible(req);
    if (!b.fichier) fail(404, 'Aucun PDF déposé pour cette fiche.');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(b.fichier_nom || 'fiche-de-paie.pdf')}`);
    res.sendFile(path.join(PIECES_DIR, path.basename(b.fichier)));
  }));
};

/** Au verrouillage d'une mission : ligne d'expérience et contrat de mission pour chaque intérimaire retenu. */
module.exports.surVerrouillage = function surVerrouillage(m, interimIds, annee) {
  for (const iid of interimIds) {
    run('INSERT OR IGNORE INTO experiences (interim_id, debut, fin, employeur, poste, source, mission_id) VALUES (?,?,?,?,?,\'mission\',?)',
      iid, m.date, m.date, m.client_nom, m.poste, m.id);
    const n = one('SELECT COUNT(*) n FROM contrats WHERE numero LIKE ?', `C-${annee}-%`).n + 1;
    run('INSERT OR IGNORE INTO contrats (numero, mission_id, interim_id) VALUES (?,?,?)', `C-${annee}-${String(n).padStart(5, '0')}`, m.id, iid);
  }
};
/** À l'annulation d'une mission : retrait de la ligne d'expérience, contrats annulés. */
module.exports.surAnnulation = function surAnnulation(missionId) {
  run('DELETE FROM experiences WHERE mission_id = ?', missionId);
  run('UPDATE contrats SET statut = \'annule\' WHERE mission_id = ?', missionId);
};
module.exports.PIECES = PIECES;
module.exports.NATIONALITES = NATIONALITES;
