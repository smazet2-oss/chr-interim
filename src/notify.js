'use strict';
// Envoi des messages : e-mail (SMTP), SMS et WhatsApp (Twilio).
// Les réglages viennent de l'onglet Paramètres de l'agence (ou des variables d'environnement).
// Sans réglage, les messages sont enregistrés comme « simulés » dans le journal des envois.
const { run } = require('./db');
const P = require('./parametres');

let mailer = null, mailerCle = '';
function getMailer() {
  const cfg = { host: P.get('smtp_host'), port: Number(P.get('smtp_port') || 587), secure: P.get('smtp_secure') === 'oui', user: P.get('smtp_user'), pass: P.get('smtp_pass') };
  if (!cfg.host) return null;
  const cle = JSON.stringify(cfg);
  if (cle !== mailerCle) {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined });
    mailerCle = cle;
  }
  return mailer;
}
const twilio = () => (P.get('twilio_sid') && P.get('twilio_token') ? { sid: P.get('twilio_sid'), token: P.get('twilio_token') } : null);

function canalConfigure(canal) {
  if (canal === 'mail') return !!P.get('smtp_host');
  if (canal === 'sms') return !!(twilio() && P.get('twilio_sms_from'));
  if (canal === 'whatsapp') return !!(twilio() && P.get('twilio_whatsapp_from'));
  return false;
}

async function twilioSend(from, to, body) {
  const t = twilio();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${t.sid}:${t.token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

/** Numéro français 06 12 34 56 78 → +33612345678 */
function e164(tel) {
  const d = String(tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0') && d.length === 10) return '+33' + d.slice(1);
  return d;
}

/**
 * Envoie un message sur un canal. Ne lève jamais d'erreur : le résultat est journalisé et renvoyé.
 * @returns {Promise<{statut:'envoye'|'simule'|'echec', detail?:string}>}
 */
async function envoyer(canal, dest, sujet, texte) {
  const destinataire = canal === 'mail' ? dest.email : e164(dest.telephone);
  const log = (statut, detail) => { run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)', canal, destinataire || '—', texte, statut, detail || null); return { statut, detail }; };
  if (!destinataire) return log('echec', canal === 'mail' ? 'Aucune adresse e-mail' : 'Aucun numéro de téléphone');
  if (!canalConfigure(canal)) return log('simule', 'Canal non configuré');
  try {
    if (canal === 'mail') {
      const from = P.get('smtp_from') || P.get('smtp_user');
      await getMailer().sendMail({ from, to: destinataire, subject: sujet, text: texte, replyTo: P.get('email') || undefined });
    } else if (canal === 'sms') {
      await twilioSend(P.get('twilio_sms_from'), destinataire, texte);
    } else {
      await twilioSend('whatsapp:' + e164(P.get('twilio_whatsapp_from')), 'whatsapp:' + destinataire, texte);
    }
    return log('envoye');
  } catch (e) {
    return log('echec', String(e.message).slice(0, 300));
  }
}

module.exports = { envoyer, canalConfigure };
