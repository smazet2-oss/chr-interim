'use strict';
// Contrat commercial entre l'agence et une entreprise cliente : coefficient de facturation et délai de paiement.
// Sans contrat signé, l'entreprise a le coefficient par défaut (Paramètres › Facturation, 1,90).
// Dès la signature, le coefficient et le délai du contrat deviennent ceux de l'entreprise et servent à tous les calculs.
const { db, one, all, run, tx } = require('./db');
const P = require('./parametres');

db.exec(`CREATE TABLE IF NOT EXISTS contrats_clients (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  coefficient REAL NOT NULL,
  delai_paiement INTEGER NOT NULL,
  date_effet TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'a_signer',
  signe_le TEXT, signe_nom TEXT, signe_mode TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const coefMin = () => P.num('coefficient_minimum', 1.9);
const contratSigne = cid => one('SELECT * FROM contrats_clients WHERE client_id = ? AND statut = \'signe\' ORDER BY id DESC LIMIT 1', cid);

/** Une fois : les entreprises sans contrat signé restées sur l'ancien coefficient par défaut (2) passent au coefficient par défaut. */
function migrer() {
  if (one('SELECT 1 FROM parametres WHERE cle = \'migration_coefficient_defaut\'')) return;
  run(`UPDATE clients SET coefficient = ? WHERE coefficient = 2.0 AND id NOT IN (SELECT client_id FROM contrats_clients WHERE statut = 'signe')`, coefMin());
  run('INSERT INTO parametres (cle, valeur) VALUES (\'migration_coefficient_defaut\', \'fait\')');
}

module.exports = function register(api, h) {
  const { fail, isDate, wrap, role, str, today } = h;
  migrer();

  const accessible = req => {
    const k = one('SELECT k.*, c.nom AS client_nom FROM contrats_clients k JOIN clients c ON c.id = k.client_id WHERE k.id = ?', req.params.id);
    if (!k || req.user.profil === 'interim' || (req.user.profil === 'client' && k.client_id !== req.user.client_id)) fail(404, 'Contrat introuvable.');
    return k;
  };

  api.get('/contrats-clients', wrap((req, res) => {
    if (req.user.profil === 'interim') fail(403, 'Accès refusé.');
    const cid = req.user.profil === 'client' ? req.user.client_id : Number(req.query.client_id);
    res.json({ coefficient_minimum: coefMin(), contrats: all('SELECT * FROM contrats_clients WHERE client_id = ? ORDER BY id DESC', cid) });
  }));

  /** L'agence enregistre un contrat, à signer par l'entreprise (ou à marquer signé s'il l'a été sur papier). */
  api.post('/contrats-clients', role('agence'), wrap((req, res) => {
    const b = req.body, c = one('SELECT * FROM clients WHERE id = ?', Number(b.client_id));
    if (!c) fail(400, 'Client introuvable.');
    const coef = Math.round(Number(String(b.coefficient).replace(',', '.')) * 100) / 100;
    if (!(coef >= coefMin() && coef <= 5)) fail(400, `Coefficient invalide : ${String(coefMin()).replace('.', ',')} minimum, 5 maximum.`);
    const delai = parseInt(b.delai_paiement, 10); if (!(delai >= 0 && delai <= 60)) fail(400, 'Délai de paiement invalide (60 jours maximum).');
    const effet = b.date_effet || today(); if (!isDate(effet)) fail(400, 'Date d\'effet invalide.');
    const annee = today().slice(0, 4), n = one('SELECT COUNT(*) n FROM contrats_clients WHERE numero LIKE ?', `CC-${annee}-%`).n + 1;
    const r = tx(() => {
      run('UPDATE contrats_clients SET statut = \'annule\' WHERE client_id = ? AND statut = \'a_signer\'', c.id);
      const r = run('INSERT INTO contrats_clients (client_id, numero, coefficient, delai_paiement, date_effet, conditions) VALUES (?,?,?,?,?,?)',
        c.id, `CC-${annee}-${String(n).padStart(4, '0')}`, coef, delai, effet, str(b.conditions, 2000));
      run('INSERT INTO notifications (client_id, message) VALUES (?,?)', c.id, `Nouveau contrat à signer : coefficient ${String(coef).replace('.', ',')}, paiement à ${delai} jours.`);
      return r;
    });
    res.status(201).json(one('SELECT * FROM contrats_clients WHERE id = ?', r.lastInsertRowid));
  }));

  /** Signature : par l'entreprise dans son espace, ou par l'agence pour un contrat signé sur papier. */
  api.post('/contrats-clients/:id/signer', role('agence', 'client'), wrap((req, res) => {
    const k = accessible(req);
    if (k.statut !== 'a_signer') fail(409, 'Ce contrat n\'est plus à signer.');
    const nom = str(req.body.nom, 120); if (nom.length < 3) fail(400, 'Indiquez le nom et la fonction du signataire.');
    if (req.user.profil === 'client' && !req.body.accepte) fail(400, 'Cochez la case d\'acceptation pour signer.');
    tx(() => {
      run('UPDATE contrats_clients SET statut = \'remplace\' WHERE client_id = ? AND statut = \'signe\'', k.client_id);
      run('UPDATE contrats_clients SET statut = \'signe\', signe_le = datetime(\'now\'), signe_nom = ?, signe_mode = ? WHERE id = ?', nom, req.user.profil === 'client' ? 'en_ligne' : 'papier', k.id);
      run('UPDATE clients SET coefficient = ?, delai_paiement = ? WHERE id = ?', k.coefficient, k.delai_paiement, k.client_id);
    });
    res.json(one('SELECT * FROM contrats_clients WHERE id = ?', k.id));
  }));

  api.post('/contrats-clients/:id/annuler', role('agence'), wrap((req, res) => {
    const k = accessible(req);
    if (k.statut !== 'a_signer') fail(409, 'Seul un contrat en attente de signature peut être annulé.');
    run('UPDATE contrats_clients SET statut = \'annule\' WHERE id = ?', k.id);
    res.json({ ok: true });
  }));

  /** Contrat lisible et imprimable. */
  api.get('/contrats-clients/:id/document', wrap((req, res) => {
    const k = accessible(req), c = one('SELECT * FROM clients WHERE id = ?', k.client_id);
    const e = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
    const g = k2 => e(P.get(k2)), d = iso => new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR');
    const pc = k2 => String(P.num(k2, 0)).replace('.', ',');
    const coef = String(k.coefficient).replace('.', ',');
    const etat = { a_signer: 'En attente de signature', signe: 'Signé', remplace: 'Remplacé par un contrat plus récent', annule: 'Annulé' }[k.statut];
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrat ${e(k.numero)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:800px;margin:0 auto;padding:24px;line-height:1.5}h1{color:#112233;font-size:22px;margin:0 0 4px}h2{color:#112233;font-size:15px;margin:22px 0 6px;border-bottom:2px solid #C99948;padding-bottom:3px}
dl{display:grid;grid-template-columns:minmax(160px,auto) 1fr;gap:4px 16px;margin:0}dt{color:#6b7280}dd{margin:0}.etat{display:inline-block;padding:3px 10px;border-radius:12px;background:#EEF1F5;font-size:13px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.sig div{border:1px solid #d1d5db;border-radius:8px;padding:12px;min-height:80px}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #112233;padding-bottom:12px;margin-bottom:16px}
@media print{.noprint{display:none}}</style></head><body>
<header><div><h1>Contrat de prestation de travail temporaire</h1><div>N° ${e(k.numero)} · <span class="etat">${etat}</span></div></div><a href="/" title="Accueil"><img src="/img/logo-horizontal.png" alt="Accueil" style="height:44px"></a></header>
<h2>Entre les parties</h2><dl><dt>Entreprise de travail temporaire</dt><dd><b>${g('raison_sociale')}</b>, ${g('forme_juridique')}${P.get('siret') ? ', SIRET ' + g('siret') : ''}<br>${e([P.get('adresse'), [P.get('code_postal'), P.get('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', '))}<br>Garantie financière : ${g('garantie_financiere') || '—'}</dd>
<dt>Entreprise utilisatrice</dt><dd><b>${e(c.nom)}</b>${c.siret ? ', SIRET ' + e(c.siret) : ''}<br>${e([c.adresse, c.ville].filter(Boolean).join(', '))}${c.contact ? '<br>Représentée par ' + e(c.contact) : ''}</dd></dl>
<h2>Conditions financières</h2><dl><dt>Date d'effet</dt><dd>${d(k.date_effet)}</dd><dt>Coefficient de facturation</dt><dd><b>${coef}</b>, appliqué au salaire horaire brut de l'intérimaire, majorations comprises</dd>
<dt>Taux horaire facturé</dt><dd>Taux horaire brut × ${coef}, hors taxes. Le taux horaire brut est au moins égal au minimum conventionnel du poste (convention ${g('convention')}) et au salaire d'un salarié de l'entreprise utilisatrice de qualification équivalente (article L1251-18 du Code du travail).</dd>
<dt>Majorations</dt><dd>Nuit (22 h – 7 h) : ${pc('maj_nuit_pc')} % · dimanche : ${pc('maj_dimanche_pc')} % · jours fériés : ${pc('maj_ferie_pc')} % · 1er mai : ${pc('maj_1er_mai_pc')} %. Heures supplémentaires majorées selon la convention collective.</dd>
<dt>TVA</dt><dd>${pc('tva_taux')} %</dd><dt>Facturation</dt><dd>Par quinzaine, sur les heures validées par l'entreprise utilisatrice</dd><dt>Délai de paiement</dt><dd>${k.delai_paiement} jours à compter de la date de facture</dd><dt>Pénalités de retard</dt><dd>${g('penalites')}, et indemnité forfaitaire de 40 € pour frais de recouvrement</dd></dl>
${k.conditions ? `<h2>Conditions particulières</h2><p style="white-space:pre-wrap">${e(k.conditions)}</p>` : ''}
<h2>Mises à disposition</h2><p>Chaque mission fait l'objet d'un contrat de mise à disposition précisant le motif de recours, le poste, les horaires et le taux horaire brut (article L1251-42 du Code du travail). Le présent contrat en fixe les conditions financières ; il remplace tout contrat antérieur à compter de sa signature.</p>
<div class="sig"><div><b>Pour ${g('raison_sociale')}</b><br><span style="color:#6b7280">Contrat établi le ${d(k.created_at)}</span></div>
<div><b>Pour ${e(c.nom)}</b><br>${k.signe_le ? `Signé ${k.signe_mode === 'papier' ? 'sur papier' : 'électroniquement'} par <b>${e(k.signe_nom)}</b> le ${d(k.signe_le)}` : '<span style="color:#6b7280">En attente de signature</span>'}</div></div>
<p class="noprint" style="margin-top:24px;color:#6b7280;font-size:13px">Pour imprimer ou enregistrer en PDF : menu Imprimer du navigateur (Ctrl + P).</p></body></html>`);
  }));

  return { contratSigne, coefMin };
};
