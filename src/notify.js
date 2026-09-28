'use strict';
// Envoi des messages : e-mail (SMTP), SMS et WhatsApp (Twilio), aux couleurs de l'agence.
// Les réglages viennent de la rubrique Paramètres de l'agence (ou des variables d'environnement).
// Sans réglage, les messages sont enregistrés comme « simulés » dans le journal des envois.
const path = require('node:path');
const { run } = require('./db');
const P = require('./parametres');

const IMG = path.join(__dirname, '..', 'public', 'img');
const LOGO_EMAIL = path.join(IMG, 'bandeau-horizontal.png');
const CID_LOGO = 'logo@chr-interim';
const TWILIO_API = process.env.TWILIO_API_BASE || 'https://api.twilio.com';
const BREVO_API = process.env.BREVO_API_BASE || 'https://api.brevo.com';

/** Adresse publique du site (liens et image WhatsApp). */
const siteUrl = () => String(P.get('site_url') || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

let mailer = null, mailerCle = '';
function getMailer() {
  const cfg = { host: P.get('smtp_host'), port: Number(P.get('smtp_port') || 587), secure: P.get('smtp_secure') === 'oui', user: P.get('smtp_user'), pass: P.get('smtp_pass') };
  // Gmail affiche le mot de passe d'application par groupes de 4 lettres : les espaces copiés sont retirés.
  if (/gmail|google/i.test(String(cfg.host)) && cfg.pass) cfg.pass = cfg.pass.replace(/\s+/g, '');
  if (!cfg.host) return null;
  const cle = JSON.stringify(cfg);
  if (cle !== mailerCle) {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      tls: process.env.SMTP_TLS_INSECURE === '1' ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    });
    mailerCle = cle;
  }
  return mailer;
}
const twilio = () => (P.get('twilio_sid') && P.get('twilio_token') ? { sid: P.get('twilio_sid'), token: P.get('twilio_token') } : null);

/** Envoi par l'API web de Brevo (port 443) plutôt que par SMTP. */
const viaBrevo = () => String(P.get('mail_methode') || '').startsWith('API Brevo');
function expediteur() {
  const nom = P.get('raison_sociale'), brut = P.get('smtp_from') || P.get('email') || '';
  const m = String(brut).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || nom, email: m[2].trim() } : { name: nom, email: String(brut).trim() };
}
async function brevoSend({ to, subject, text, html }) {
  const res = await fetch(`${BREVO_API}/v3/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': P.get('brevo_cle'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: expediteur(), to: [{ email: to }], subject, textContent: text, htmlContent: html, ...(P.get('email') ? { replyTo: { email: P.get('email') } } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = String(data.message || '');
    const msg = /unrecognised IP|unrecognized IP/i.test(m) ? 'Brevo bloque l\'adresse IP du serveur : dans Brevo, menu Sécurité › IP autorisées, désactivez le blocage des adresses IP inconnues'
      : res.status === 401 ? 'clé API Brevo refusée : vérifiez-la ou générez-en une nouvelle'
      : /sender/i.test(m) ? 'adresse d\'expédition non validée dans Brevo : ajoutez-la dans Expéditeurs, domaines et IP › Expéditeurs, puis confirmez l\'e-mail reçu'
      : m || 'erreur inconnue';
    throw new Error(`Brevo ${res.status} : ${msg}`);
  }
  return data.messageId;
}

function canalConfigure(canal) {
  if (canal === 'mail') return viaBrevo() ? !!(P.get('brevo_cle') && expediteur().email) : !!P.get('smtp_host');
  if (canal === 'sms') return !!(twilio() && P.get('twilio_sms_from'));
  if (canal === 'whatsapp') return !!(twilio() && P.get('twilio_whatsapp_from'));
  return false;
}

async function twilioSend(params) {
  const t = twilio();
  const res = await fetch(`${TWILIO_API}/2010-04-01/Accounts/${t.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${t.sid}:${t.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  // Messages d'erreur Twilio les plus fréquents, traduits
  if (!res.ok) {
    const msg = { 20003: 'identifiants Twilio refusés (Account SID ou Auth Token)', 21211: 'numéro du destinataire invalide', 21408: 'envoi vers ce pays non autorisé dans votre compte Twilio', 21608: 'compte d\'essai Twilio : le numéro du destinataire doit d\'abord être vérifié', 21612: 'expéditeur non autorisé vers ce numéro', 63016: 'hors fenêtre de 24 h : un modèle WhatsApp approuvé est nécessaire' }[data.code];
    throw new Error(`Twilio ${res.status}${data.code ? ' (' + data.code + ')' : ''} : ${msg || data.message || 'erreur inconnue'}`);
  }
  return data.sid;
}

/** Numéro français 06 12 34 56 78 → +33612345678 */
function e164(tel) {
  const d = String(tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('0') && d.length === 10) return '+33' + d.slice(1);
  return d;
}

const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/**
 * E-mail HTML aux couleurs de l'agence (mise en page en tableaux, compatible avec les messageries courantes).
 * logoSrc : "cid:…" pour l'envoi, ou une URL pour l'aperçu dans le navigateur.
 */
function gabaritEmail({ titre, texte, lien, bouton }, logoSrc = 'cid:' + CID_LOGO) {
  const g = k => P.get(k);
  const adresse = [g('adresse'), [g('code_postal'), g('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const legal = [g('raison_sociale'), g('forme_juridique'), g('siret') && 'SIRET ' + g('siret')].filter(Boolean).join(' · ');
  const paras = String(texte).split(/\n{2,}|\n/).filter(Boolean).map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escHtml(p)}</p>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(titre)}</title></head>
<body style="margin:0;padding:0;background:#EEF1F5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#112233;padding:0">${logoSrc ? `<img src="${logoSrc}" width="600" alt="${escHtml(g('raison_sociale'))} — Spécialiste des métiers HCR" style="display:block;width:100%;max-width:600px;height:auto;border:0">` : `<div style="padding:22px 28px;color:#FFFFFF;font:600 22px Arial,sans-serif">${escHtml(g('raison_sociale'))}</div>`}</td></tr>
<tr><td style="background:#C99948;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 12px"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#112233">${escHtml(titre)}</h1>${paras}
${lien ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="background:#112233;border-radius:8px;border-bottom:3px solid #C99948"><a href="${escHtml(lien)}" style="display:inline-block;padding:13px 22px;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none">${escHtml(bouton || 'Ouvrir mon espace')}</a></td></tr></table>
<p style="margin:0 0 8px;font-size:12px;color:#6b7280">Si le bouton ne fonctionne pas : <a href="${escHtml(lien)}" style="color:#7E5F24">${escHtml(lien)}</a></p>` : ''}</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.5;color:#6b7280">
<b style="color:#112233">${escHtml(g('raison_sociale'))}</b> · spécialiste des métiers <b style="color:#7E5F24">HCR</b><br>
${adresse ? escHtml(adresse) + '<br>' : ''}${[g('telephone'), g('email')].filter(Boolean).map(escHtml).join(' · ')}${g('telephone') || g('email') ? '<br>' : ''}
<span style="color:#9ca3af">${escHtml(legal)} — Message envoyé automatiquement par la plateforme ${escHtml(g('raison_sociale'))}.</span></td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Envoie un message sur un canal. Ne lève jamais d'erreur : le résultat est journalisé et renvoyé.
 * @param {{titre?:string, lien?:string, bouton?:string, masquer?:string}} opts présentation de l'e-mail, lien vers le site, texte à masquer dans le journal
 * @returns {Promise<{statut:'envoye'|'simule'|'echec', detail?:string}>}
 */
async function envoyer(canal, dest, sujet, texte, opts = {}) {
  const destinataire = canal === 'mail' ? String(dest.email || '').trim() : e164(dest.telephone);
  const lien = opts.lien === undefined ? siteUrl() : opts.lien;
  const texteComplet = lien && !String(texte).includes(lien) ? `${texte}\n${lien}` : texte;
  // Le journal ne conserve jamais les secrets (mot de passe provisoire) : ils sont masqués.
  const texteJournal = opts.masquer ? texteComplet.split(opts.masquer).join('••••••') : texteComplet;
  const log = (statut, detail) => { run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)', canal, destinataire || '—', texteJournal, statut, detail || null); return { statut, detail }; };
  if (!destinataire) return log('echec', canal === 'mail' ? 'Aucune adresse e-mail' : 'Aucun numéro de téléphone');
  if (canal === 'mail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire)) return log('echec', 'Adresse e-mail invalide');
  if (canal !== 'mail' && !/^\+\d{8,15}$/.test(destinataire)) return log('echec', 'Numéro de téléphone invalide');
  if (!canalConfigure(canal)) return log('simule', 'Canal non configuré');
  try {
    if (canal === 'mail') {
      const nom = P.get('raison_sociale');
      if (viaBrevo()) {
        // Logo par son adresse publique (l'API ne gère pas les images intégrées).
        const logo = siteUrl().startsWith('https://') ? siteUrl() + '/img/bandeau-horizontal.png' : '';
        const id = await brevoSend({ to: destinataire, subject: sujet, text: `${texteComplet}\n\n— ${nom}, spécialiste des métiers HCR`,
          html: gabaritEmail({ titre: opts.titre || sujet, texte, lien, bouton: opts.bouton }, logo) });
        return log('envoye', id ? 'Brevo ' + id : 'Brevo');
      }
      const from = P.get('smtp_from') || (P.get('smtp_user') && `${nom} <${P.get('smtp_user')}>`);
      const info = await getMailer().sendMail({
        from, to: destinataire, subject: sujet, replyTo: P.get('email') || undefined,
        text: `${texteComplet}\n\n— ${nom}, spécialiste des métiers HCR`,
        html: gabaritEmail({ titre: opts.titre || sujet, texte, lien, bouton: opts.bouton }),
        attachments: [{ filename: 'chr-interim.png', path: LOGO_EMAIL, cid: CID_LOGO }],
      });
      return log('envoye', info.messageId ? 'ID ' + info.messageId : null);
    }
    if (canal === 'sms') {
      const sid = await twilioSend({ From: P.get('twilio_sms_from'), To: destinataire, Body: texteComplet });
      return log('envoye', 'SID ' + sid);
    }
    const params = { From: 'whatsapp:' + e164(P.get('twilio_whatsapp_from')), To: 'whatsapp:' + destinataire };
    const modele = P.get('twilio_whatsapp_modele');
    if (modele) { params.ContentSid = modele; params.ContentVariables = JSON.stringify({ 1: texteComplet }); }
    else {
      params.Body = texteComplet;
      if (P.get('whatsapp_logo') !== 'non' && siteUrl().startsWith('https://')) params.MediaUrl = siteUrl() + '/img/bandeau-mobile.png';
    }
    const sid = await twilioSend(params);
    return log('envoye', 'SID ' + sid);
  } catch (e) {
    return log('echec', String(canal === 'mail' && !viaBrevo() ? erreurSmtp(e) : e.message).slice(0, 400));
  }
}

/** Erreurs SMTP les plus fréquentes, traduites avec la marche à suivre. */
function erreurSmtp(e) {
  // Les erreurs OpenSSL commencent par un identifiant technique (ex. 40E8…0000:error:…) : il est retiré.
  const m = String(e.message || '').replace(/^[0-9a-f]{8,}:error:[0-9A-F]+:/i, ''), gmail = /gmail|google/i.test(String(P.get('smtp_host')));
  if (e.code === 'EAUTH' || /\b535\b|534|Username and Password not accepted|Invalid login|Application-specific password/i.test(m))
    return gmail ? 'Gmail refuse la connexion : utilisez un mot de passe d\'application (16 lettres, validation en deux étapes activée), pas le mot de passe du compte. ' + m
      : 'Identifiant ou mot de passe SMTP refusé. ' + m;
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(e.code) || /timeout|timed out/i.test(m))
    return 'Serveur SMTP injoignable : vérifiez le serveur, le port (465 avec connexion chiffrée « oui », ou 587 avec « non ») et que l\'hébergeur autorise l\'envoi. ' + m;
  if (e.code === 'EDNS' || /ENOTFOUND/.test(m)) return 'Serveur SMTP introuvable : vérifiez son nom (ex. smtp.gmail.com). ' + m;
  if (/wrong version number|ssl3_get_record|greeting never received/i.test(m)) return 'Réglage de chiffrement incorrect : port 465 → connexion chiffrée « oui » ; port 587 → « non ». ' + m;
  if (/\b(550|553|554)\b/.test(m)) return 'Adresse d\'expédition refusée par le serveur : elle doit être celle du compte SMTP (ou un alias autorisé). ' + m;
  return m;
}

module.exports = { envoyer, canalConfigure, gabaritEmail, siteUrl, erreurSmtp };
