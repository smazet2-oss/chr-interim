'use strict';
// Paramètres de l'agence (identité légale, facturation, paie, messagerie), modifiables depuis l'espace agence.
// Les valeurs enregistrées priment sur les variables d'environnement, qui restent une valeur de secours.
// Les champs secrets (mots de passe, clés) sont chiffrés en AES-256-GCM avec une clé propre à l'installation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, one, all, run, DATA_DIR } = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);

/** Clé de chiffrement : APP_SECRET si défini, sinon une clé générée et gardée dans le dossier de données. */
function cleChiffrement() {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  const f = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
}
const KEY = cleChiffrement();
function chiffrer(txt) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function dechiffrer(v) {
  if (!v.startsWith('enc:')) return v;
  try {
    const b = Buffer.from(v.slice(4), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

/**
 * Définition des paramètres. type : text | email | tel | url | number | select | textarea | password (secret).
 * env : variable d'environnement de secours. def : valeur par défaut.
 */
const GROUPES = [
  { id: 'identite', titre: 'Identité légale et contact', aide: 'Figure sur les contrats de mission, les factures et les messages envoyés.', champs: [
    { k: 'raison_sociale', l: 'Raison sociale', env: 'AGENCE_RAISON_SOCIALE', def: 'CHR Intérim', req: true },
    { k: 'forme_juridique', l: 'Forme juridique', type: 'select', options: ['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'Entreprise individuelle', 'Autre'], def: 'SAS' },
    { k: 'capital', l: 'Capital social (€)', type: 'number' },
    { k: 'siret', l: 'SIRET', env: 'AGENCE_SIRET', motif: '^\\d{3} ?\\d{3} ?\\d{3} ?\\d{5}$', aide: '14 chiffres' },
    { k: 'rcs', l: 'Ville d\'immatriculation au RCS' },
    { k: 'ape', l: 'Code APE / NAF', def: '7820Z', aide: '7820Z : activités des agences de travail temporaire' },
    { k: 'tva_intra', l: 'N° de TVA intracommunautaire', motif: '^FR ?[0-9A-Z]{2} ?\\d{9}$' },
    { k: 'adresse', l: 'Adresse', env: 'AGENCE_ADRESSE' },
    { k: 'code_postal', l: 'Code postal', motif: '^\\d{5}$' },
    { k: 'ville', l: 'Ville' },
    { k: 'telephone', l: 'Téléphone', type: 'tel' },
    { k: 'email', l: 'E-mail de contact', type: 'email' },
    { k: 'site', l: 'Site internet', type: 'url' },
    { k: 'garantie_financiere', l: 'Garantie financière (organisme et n°)', env: 'AGENCE_GARANTIE_FINANCIERE', aide: 'Obligatoire pour une entreprise de travail temporaire (article L1251-49 du Code du travail).' },
    { k: 'caisse_retraite', l: 'Caisse de retraite complémentaire', env: 'CAISSE_RETRAITE' },
    { k: 'organisme_prevoyance', l: 'Organisme de prévoyance', env: 'ORGANISME_PREVOYANCE' },
  ] },
  { id: 'facturation', titre: 'Facturation', aide: 'Utilisé pour générer et imprimer les factures clients.', champs: [
    { k: 'facture_prefixe', l: 'Préfixe des numéros de facture', def: 'F', motif: '^[A-Z0-9-]{1,8}$', aide: 'Exemple : F donne F-2026-0001' },
    { k: 'tva_taux', l: 'Taux de TVA (%)', type: 'number', def: '20', min: 0, max: 30 },
    { k: 'delai_paiement_defaut', l: 'Délai de paiement par défaut (jours)', type: 'number', def: '15', min: 0, max: 60, aide: 'Appliqué aux nouveaux clients. Maximum légal : 60 jours.' },
    { k: 'penalites', l: 'Pénalités de retard', def: 'taux d\'intérêt appliqué par la BCE majoré de 10 points', aide: 'Au moins trois fois le taux d\'intérêt légal (article L441-10 du Code de commerce).' },
    { k: 'iban', l: 'IBAN', motif: '^[A-Z]{2}\\d{2}[ A-Z0-9]{10,32}$' },
    { k: 'bic', l: 'BIC', motif: '^[A-Z0-9]{8}([A-Z0-9]{3})?$' },
    { k: 'facture_mentions', l: 'Mentions complémentaires', type: 'textarea', def: 'Pas d\'escompte pour paiement anticipé.' },
  ] },
  { id: 'paie', titre: 'Paie', aide: 'Taux utilisés pour calculer les fiches de paie des intérimaires.', champs: [
    { k: 'ifm_taux', l: 'Indemnité de fin de mission (%)', type: 'number', def: '10', min: 0, max: 20, aide: '10 % minimum, sauf accord ou cas d\'exclusion (article L1251-32).' },
    { k: 'iccp_taux', l: 'Indemnité compensatrice de congés payés (%)', type: 'number', def: '10', min: 10, max: 20, aide: '10 % minimum de la rémunération, fin de mission comprise.' },
    { k: 'convention', l: 'Convention collective', def: 'HCR (IDCC 1979)' },
    { k: 'paie_jour', l: 'Versement du salaire', def: 'Dans les 5 jours suivant la fin de chaque quinzaine' },
  ] },
  { id: 'messagerie', titre: 'Messagerie : e-mail, SMS et WhatsApp', aide: 'Sans ces réglages, les messages sont seulement enregistrés dans le journal des envois. Les mots de passe et clés sont chiffrés.', champs: [
    { k: 'site_url', l: 'Adresse publique du site', type: 'url', env: 'APP_URL', motif: '^https?://[^\\s/]+', aide: 'Exemple : https://chr-interim.onrender.com. Utilisée dans les liens des messages et pour afficher le logo dans WhatsApp.' },
    { k: 'smtp_host', l: 'Serveur SMTP', env: 'SMTP_HOST', aide: 'Exemple : smtp-relay.brevo.com, smtp.office365.com, ssl0.ovh.net' },
    { k: 'smtp_port', l: 'Port SMTP', type: 'number', env: 'SMTP_PORT', def: '587', min: 1, max: 65535 },
    { k: 'smtp_secure', l: 'Connexion chiffrée directe (SSL, port 465)', type: 'select', options: ['non', 'oui'], def: 'non' },
    { k: 'smtp_user', l: 'Identifiant SMTP', env: 'SMTP_USER' },
    { k: 'smtp_pass', l: 'Mot de passe ou clé SMTP', type: 'password', env: 'SMTP_PASS' },
    { k: 'smtp_from', l: 'Adresse d\'expédition', env: 'SMTP_FROM', aide: 'Exemple : CHR Intérim <missions@chr-interim.fr>. L\'adresse doit être autorisée chez votre fournisseur.' },
    { k: 'twilio_sid', l: 'Twilio : Account SID', env: 'TWILIO_ACCOUNT_SID', motif: '^AC[0-9a-fA-F]{32}$', aide: 'Commence par AC, visible sur l\'accueil de la console Twilio.' },
    { k: 'twilio_token', l: 'Twilio : Auth Token', type: 'password', env: 'TWILIO_AUTH_TOKEN' },
    { k: 'twilio_sms_from', l: 'Expéditeur des SMS', env: 'TWILIO_SMS_FROM', def: 'CHR Interim', motif: '^(\\+\\d{8,15}|[A-Za-z][A-Za-z0-9 ]{0,10})$', aide: 'Nom affiché (11 caractères maximum, par exemple « CHR Interim ») ou numéro Twilio au format +33…' },
    { k: 'twilio_whatsapp_from', l: 'Numéro WhatsApp Business', env: 'TWILIO_WHATSAPP_FROM', motif: '^\\+?\\d{8,15}$', aide: 'Numéro validé par Meta dans Twilio, au format +33…' },
    { k: 'whatsapp_logo', l: 'Joindre le logo aux messages WhatsApp', type: 'select', options: ['oui', 'non'], def: 'oui', aide: 'Nécessite l\'adresse publique du site en https.' },
    { k: 'twilio_whatsapp_modele', l: 'WhatsApp : identifiant du modèle approuvé (facultatif)', motif: '^HX[0-9a-fA-F]{32}$', aide: 'Content SID (HX…) d\'un modèle approuvé par Meta avec une variable {{1}} pour le texte. Obligatoire pour écrire en premier à un intérimaire hors fenêtre de 24 h.' },
  ] },
];
const CHAMPS = Object.fromEntries(GROUPES.flatMap(g => g.champs).map(c => [c.k, c]));

/** Valeur effective d'un paramètre : base, puis variable d'environnement, puis valeur par défaut. */
function get(k) {
  const r = one('SELECT valeur FROM parametres WHERE cle = ?', k);
  if (r && r.valeur !== '') return CHAMPS[k]?.type === 'password' ? dechiffrer(r.valeur) : r.valeur;
  const c = CHAMPS[k];
  return (c?.env && process.env[c.env]) || c?.def || '';
}
const num = (k, d) => { const n = Number(String(get(k)).replace(',', '.')); return Number.isFinite(n) ? n : d; };

function vuePublique() {
  const stock = Object.fromEntries(all('SELECT cle, valeur FROM parametres').map(r => [r.cle, r.valeur]));
  return {
    groupes: GROUPES,
    valeurs: Object.fromEntries(Object.values(CHAMPS).map(c => {
      if (c.type === 'password') return [c.k, { defini: !!(stock[c.k] || (c.env && process.env[c.env])) }];
      return [c.k, stock[c.k] ?? ((c.env && process.env[c.env]) || c.def || '')];
    })),
  };
}

/** Enregistre les champs envoyés. Un secret vide est conservé ; `effacer: [clés]` le supprime. */
function enregistrer(body, fail) {
  const valeurs = body.valeurs || {};
  for (const [k, v0] of Object.entries(valeurs)) {
    const c = CHAMPS[k]; if (!c) continue;
    const v = String(v0 ?? '').trim().slice(0, c.type === 'textarea' ? 1000 : 250);
    if (c.type === 'password') { if (v) run('INSERT INTO parametres (cle, valeur) VALUES (?,?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = datetime(\'now\')', k, chiffrer(v)); continue; }
    if (v && c.motif && !new RegExp(c.motif, 'i').test(v)) fail(400, `« ${c.l} » : format invalide${c.aide ? ` (${c.aide})` : ''}.`);
    if (v && c.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, `« ${c.l} » : adresse e-mail invalide.`);
    if (v && c.type === 'number') {
      const n = Number(v.replace(',', '.'));
      if (!Number.isFinite(n) || (c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) fail(400, `« ${c.l} » : valeur invalide${c.min !== undefined ? ` (entre ${c.min} et ${c.max})` : ''}.`);
    }
    if (v && c.type === 'select' && !c.options.includes(v)) fail(400, `« ${c.l} » : choix invalide.`);
    if (c.req && !v) fail(400, `« ${c.l} » est obligatoire.`);
    run('INSERT INTO parametres (cle, valeur) VALUES (?,?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = datetime(\'now\')', k, v);
  }
  for (const k of body.effacer || []) if (CHAMPS[k]?.type === 'password') run('DELETE FROM parametres WHERE cle = ?', k);
}

module.exports = { get, num, vuePublique, enregistrer, GROUPES };
