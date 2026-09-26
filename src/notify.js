'use strict';
// Envoi des messages : e-mail (SMTP), SMS et WhatsApp (Twilio).
// Sans configuration, les messages sont enregistrés comme « simulés » dans le journal des envois.
const { run } = require('./db');

let mailer = null;
if (process.env.SMTP_HOST) {
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const twilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN } : null;

function canalConfigure(canal) {
  if (canal === 'mail') return !!mailer;
  if (canal === 'sms') return !!(twilio && process.env.TWILIO_SMS_FROM);
  if (canal === 'whatsapp') return !!(twilio && process.env.TWILIO_WHATSAPP_FROM);
  return false;
}

async function twilioSend(from, to, body) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
 * Envoie un message sur un canal. Ne lève jamais d'erreur : le résultat est journalisé.
 * @param {'mail'|'sms'|'whatsapp'} canal
 * @param {{email?:string, telephone?:string}} dest
 */
async function envoyer(canal, dest, sujet, texte) {
  const destinataire = canal === 'mail' ? dest.email : e164(dest.telephone);
  if (!destinataire) {
    run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)',
      canal, '—', texte, 'echec', canal === 'mail' ? 'Aucune adresse e-mail' : 'Aucun numéro de téléphone');
    return;
  }
  if (!canalConfigure(canal)) {
    run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)',
      canal, destinataire, texte, 'simule', 'Canal non configuré');
    return;
  }
  try {
    if (canal === 'mail') {
      await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: destinataire, subject: sujet, text: texte });
    } else if (canal === 'sms') {
      await twilioSend(process.env.TWILIO_SMS_FROM, destinataire, texte);
    } else {
      await twilioSend('whatsapp:' + process.env.TWILIO_WHATSAPP_FROM, 'whatsapp:' + destinataire, texte);
    }
    run('INSERT INTO envois_messages (canal, destinataire, contenu, statut) VALUES (?,?,?,?)', canal, destinataire, texte, 'envoye');
  } catch (e) {
    run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)',
      canal, destinataire, texte, 'echec', String(e.message).slice(0, 300));
  }
}

module.exports = { envoyer, canalConfigure };
