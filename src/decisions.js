'use strict';
// Réponse de l'agence à une candidature : acceptation (demande de rendez-vous sous 48 h) ou refus,
// par e-mail (et SMS si seul un téléphone est connu). Candidatures d'intérimaires et d'établissements (prospects).
const { run, addColumn } = require('./db');
const P = require('./parametres');
const { envoyer } = require('./notify');

for (const t of ['candidats', 'prospects']) {
  addColumn(t, 'decision', 'TEXT');
  addColumn(t, 'decision_le', 'TEXT');
  addColumn(t, 'rdv_propose', 'TEXT');
}

const dh = iso => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Textes proposés (modifiables par l'agence avant l'envoi). */
function modele(type, decision, x, rdv) {
  const nom = P.get('raison_sociale'), tel = P.get('telephone'), joindre = [tel && `au ${tel}`, P.get('email') && `à ${P.get('email')}`].filter(Boolean).join(' ou ');
  const qui = type === 'candidat' ? x.prenom : (x.repondant || '').split(',')[0] || 'Madame, Monsieur';
  const creneau = rdv ? `Nous vous proposons le ${dh(rdv)}. Si ce créneau ne vous convient pas, répondez à ce message avec vos disponibilités.` : 'Merci de nous indiquer vos disponibilités en répondant à ce message.';
  if (type === 'candidat') {
    return decision === 'acceptee'
      ? { sujet: `${nom} : votre candidature est retenue`, titre: 'Votre candidature est retenue', texte: `Bonjour ${qui},\n\nMerci pour votre candidature${x.poste ? ` au poste de ${x.poste}` : ''}. Elle a retenu toute notre attention et nous souhaitons vous rencontrer dans les 48 heures pour un court entretien et votre inscription.\n\n${creneau}\n\nPensez à apporter votre pièce d'identité, votre carte Vitale, un justificatif de domicile et un RIB.${joindre ? `\n\nVous pouvez aussi nous joindre ${joindre}.` : ''}\n\nÀ très bientôt,\nL'équipe ${nom}` }
      : { sujet: `${nom} : votre candidature`, titre: 'Réponse à votre candidature', texte: `Bonjour ${qui},\n\nMerci de l'intérêt que vous portez à ${nom}. Après étude de votre candidature, nous ne sommes pas en mesure d'y donner une suite favorable pour le moment.\n\nNous conservons vos coordonnées et ne manquerons pas de revenir vers vous si un besoin correspondant à votre profil se présente. Vous pouvez demander leur suppression à tout moment.\n\nNous vous souhaitons une belle réussite dans vos recherches.\nL'équipe ${nom}` };
  }
  return decision === 'acceptee'
    ? { sujet: `${nom} : proposition de rendez-vous`, titre: 'Parlons de vos besoins en personnel', texte: `Bonjour ${qui},\n\nMerci pour votre demande concernant ${x.etablissement}. Nous serions ravis de vous présenter nos services et de préparer vos prochains renforts : nous vous proposons un rendez-vous dans les 48 heures, sur place ou par téléphone.\n\n${creneau}${joindre ? `\n\nVous pouvez aussi nous joindre ${joindre}.` : ''}\n\nBien cordialement,\nL'équipe ${nom}` }
    : { sujet: `${nom} : votre demande`, titre: 'Réponse à votre demande', texte: `Bonjour ${qui},\n\nMerci pour votre demande concernant ${x.etablissement}. Nous ne sommes malheureusement pas en mesure d'y répondre favorablement pour le moment (zone ou besoin non couverts).\n\nNous conservons vos coordonnées et reviendrons vers vous dès que notre offre le permettra. Vous pouvez demander leur suppression à tout moment.\n\nBien cordialement,\nL'équipe ${nom}` };
}

/** Enregistre la décision et envoie le message. Retourne les canaux utilisés et leur statut. */
async function decider(table, type, x, b, today) {
  const decision = b.decision === 'refusee' ? 'refusee' : 'acceptee';
  const rdv = b.rdv && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.rdv) ? b.rdv : null;
  const m = modele(type, decision, x, rdv);
  const texte = String(b.texte || m.texte).slice(0, 4000), sujet = String(b.sujet || m.sujet).slice(0, 200);
  const d2 = new Date(today + 'T12:00Z'); d2.setUTCDate(d2.getUTCDate() + 2);
  const statut = decision === 'refusee' ? (type === 'candidat' ? 'refuse' : 'perdu') : (type === 'candidat' ? 'entretien' : 'en_discussion');
  run(`UPDATE ${table} SET statut = ?, decision = ?, decision_le = datetime('now'), rdv_propose = ?, date_relance = ?, updated_at = datetime('now') WHERE id = ?`,
    statut, decision, rdv, decision === 'acceptee' ? (rdv ? rdv.slice(0, 10) : d2.toISOString().slice(0, 10)) : null, x.id);
  const envois = [];
  if (x.email) envois.push(['mail', await envoyer('mail', x, sujet, texte, { titre: m.titre, lien: '' })]);
  else if (x.telephone) envois.push(['sms', await envoyer('sms', x, sujet, `${P.get('raison_sociale')} : ${texte.replace(/\n+/g, ' ')}`.slice(0, 600), { lien: '' })]);
  return { decision, statut, envois: envois.map(([c, r]) => ({ canal: c, statut: r.statut, detail: r.detail || null })) };
}

module.exports = { modele, decider };
