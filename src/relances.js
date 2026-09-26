'use strict';
// Relances : contrats de mission non signés (intérimaire et/ou employeur) et factures échues.
// Manuelles (bouton « Relancer » de l'agence) ou automatiques selon Paramètres › Relances.
// Chaque relance part par les canaux configurés et est tracée dans la table relances.
const { db, one, all, run } = require('./db');
const P = require('./parametres');
const { envoyer, canalConfigure, siteUrl } = require('./notify');

db.exec(`CREATE TABLE IF NOT EXISTS relances (
  id INTEGER PRIMARY KEY,
  objet TEXT NOT NULL CHECK (objet IN ('contrat', 'facture')),
  objet_id INTEGER NOT NULL,
  destinataire TEXT NOT NULL,
  canaux TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const eur = n => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const dfr = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
/** Canaux utilisables pour une personne : e-mail et SMS, WhatsApp s'il est configuré. */
const canaux = dest => ['mail', 'sms', 'whatsapp'].filter(c => (c === 'mail' ? dest.email : dest.telephone) && (c !== 'whatsapp' || canalConfigure('whatsapp')));

async function relancerContrat(id, auto = false) {
  const k = one(`SELECT k.*, m.poste, m.date, m.debut, m.client_id, c.nom AS client_nom, c.email AS client_email, c.telephone AS client_telephone, c.contact,
      i.prenom, i.email AS i_email, i.telephone AS i_telephone
    FROM contrats k JOIN missions m ON m.id = k.mission_id JOIN clients c ON c.id = m.client_id JOIN interimaires i ON i.id = k.interim_id WHERE k.id = ?`, id);
  if (!k || k.statut !== 'a_signer') return { envoyes: [] };
  const envoyes = [], nom = P.get('raison_sociale'), quand = `${dfr(k.date)} à ${k.debut}`;
  const cibles = [];
  if (!k.signe_le) cibles.push(['intérimaire', { email: k.i_email, telephone: k.i_telephone }, `Bonjour ${k.prenom}, votre contrat de mission ${k.numero} (${k.poste} chez ${k.client_nom}, ${quand}) attend votre signature. Signez-le dans votre espace, rubrique Contrats : la mission n'est confirmée qu'après signature.`]);
  if (!k.client_signe_le) cibles.push(['employeur', { email: k.client_email, telephone: k.client_telephone }, `Bonjour${k.contact ? ' ' + k.contact : ''}, le contrat de mission ${k.numero} (${k.poste}, ${quand}) attend votre signature. Signez-le dans votre espace employeur, rubrique Contrats de mission : la mission est validée dès que les deux parties ont signé.`]);
  for (const [qui, dest, texte] of cibles) {
    const cs = canaux(dest);
    for (const c of cs) await envoyer(c, dest, `${nom} : contrat ${k.numero} à signer`, `${nom} : ${texte}`, { titre: 'Contrat de mission à signer', bouton: 'Signer le contrat' });
    if (qui === 'intérimaire') run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', k.interim_id, k.mission_id, `Relance : contrat ${k.numero} à signer.`);
    else run('INSERT INTO notifications (client_id, mission_id, message) VALUES (?,?,?)', k.client_id, k.mission_id, `Relance : contrat ${k.numero} à signer.`);
    run('INSERT INTO relances (objet, objet_id, destinataire, canaux, auto) VALUES (\'contrat\',?,?,?,?)', k.id, qui, cs.join(',') || 'espace', auto ? 1 : 0);
    envoyes.push(qui);
  }
  run('UPDATE contrats SET relance_le = datetime(\'now\'), nb_relances = nb_relances + 1 WHERE id = ?', k.id);
  return { envoyes };
}

async function relancerFacture(id, auto = false) {
  const f = one('SELECT f.*, c.nom AS client_nom, c.email, c.telephone, c.contact FROM factures f JOIN clients c ON c.id = f.client_id WHERE f.id = ?', id);
  if (!f || f.payee_le) return { envoyes: [] };
  const ttc = Math.round(f.montant_ht * (100 + f.tva_taux)) / 100, nom = P.get('raison_sociale');
  const texte = `${nom} : bonjour${f.contact ? ' ' + f.contact : ''}, sauf erreur de notre part, la facture ${f.numero} de ${eur(ttc)} TTC, échue le ${new Date(f.echeance + 'T12:00').toLocaleDateString('fr-FR')}, reste impayée. Merci de procéder à son règlement${P.get('iban') ? ` (IBAN ${P.get('iban')})` : ''}. Si le paiement est en cours, merci de ne pas tenir compte de ce message.`;
  const dest = { email: f.email, telephone: f.telephone }, cs = canaux(dest).filter(c => c !== 'whatsapp');
  for (const c of cs) await envoyer(c, dest, `${nom} : relance facture ${f.numero}`, texte, { titre: `Facture ${f.numero} en attente de règlement`, bouton: 'Voir mes factures', lien: siteUrl() });
  run('INSERT INTO notifications (client_id, message) VALUES (?,?)', f.client_id, `Relance : facture ${f.numero} de ${eur(ttc)} TTC échue le ${f.echeance}.`);
  run('INSERT INTO relances (objet, objet_id, destinataire, canaux, auto) VALUES (\'facture\',?,\'employeur\',?,?)', f.id, cs.join(',') || 'espace', auto ? 1 : 0);
  run('UPDATE factures SET relance_le = datetime(\'now\'), nb_relances = nb_relances + 1 WHERE id = ?', f.id);
  return { envoyes: ['employeur'] };
}

/** Relances automatiques dues à cet instant. */
async function tourner(today) {
  if (P.get('relances_auto') === 'non') return { contrats: 0, factures: 0 };
  const max = P.num('relances_max', 3), h = P.num('relance_contrat_h', 24), j = P.num('relance_facture_j', 7);
  // Contrats : première relance après le délai, puis à chaque délai ; 4 h seulement si la mission commence dans moins de 24 h.
  const ks = all(`SELECT k.id FROM contrats k JOIN missions m ON m.id = k.mission_id
    WHERE k.statut = 'a_signer' AND k.nb_relances < ? AND m.date >= date(?, '-2 days')
      AND COALESCE(k.relance_le, k.created_at) <= datetime('now', CASE WHEN m.date <= date(?, '+1 day') THEN '-4 hours' ELSE ? END)`,
  max, today, today, `-${h} hours`);
  const fs = all(`SELECT id FROM factures WHERE payee_le IS NULL AND echeance < ? AND nb_relances < ?
      AND (relance_le IS NULL OR relance_le <= datetime('now', ?))`, today, max, `-${j} days`);
  for (const k of ks) await relancerContrat(k.id, true);
  for (const f of fs) await relancerFacture(f.id, true);
  return { contrats: ks.length, factures: fs.length };
}

module.exports = function register(api, h) {
  const { wrap, role, fail, today } = h;
  api.post('/contrats/:id/relancer', role('agence'), wrap(async (req, res) => {
    const k = one('SELECT statut FROM contrats WHERE id = ?', req.params.id); if (!k) fail(404, 'Contrat introuvable.');
    if (k.statut !== 'a_signer') fail(409, 'Ce contrat n\'attend plus de signature.');
    res.json(await relancerContrat(Number(req.params.id)));
  }));
  api.post('/factures/:id/relancer', role('agence'), wrap(async (req, res) => {
    const f = one('SELECT payee_le FROM factures WHERE id = ?', req.params.id); if (!f) fail(404, 'Facture introuvable.');
    if (f.payee_le) fail(409, 'Cette facture est déjà payée.');
    res.json(await relancerFacture(Number(req.params.id)));
  }));
  api.get('/relances', role('agence'), (req, res) => res.json(all(`SELECT r.*,
      CASE r.objet WHEN 'contrat' THEN (SELECT numero FROM contrats WHERE id = r.objet_id) ELSE (SELECT numero FROM factures WHERE id = r.objet_id) END AS numero
    FROM relances r ORDER BY r.id DESC LIMIT 200`)));
  /** Toutes les 30 minutes, dans le serveur en production uniquement. */
  return { tourner: () => tourner(today()), demarrer: () => setInterval(() => tourner(today()).catch(e => console.error('Relances :', e.message)), 30 * 60 * 1000).unref() };
};
module.exports.relancerContrat = relancerContrat;
module.exports.relancerFacture = relancerFacture;
