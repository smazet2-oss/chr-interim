'use strict';
// Contrat de mission (travail temporaire, convention HCR IDCC 1979), rempli automatiquement avec les données
// de l'agence, de l'intérimaire, de l'entreprise utilisatrice et de la mission.
// Signature électronique simple par l'intérimaire puis par l'entreprise utilisatrice (« Lu et approuvé »).
// Quand tous les contrats d'une mission sont signés par les deux parties, la mission est validée.
// Les termes sont figés à la création du contrat (instantané JSON) : un changement de paramètre ne modifie pas un contrat émis.
const { one, run } = require('./db');
const P = require('./parametres');
const hcr = require('./hcr');
const { POSTES } = require('./hcr-grille');

/** Tâches, risques et équipements habituels par famille de poste (modifiables mission par mission). */
const FICHES = [
  [/plong/i, 'Plonge batterie et vaisselle, rangement, entretien de la plonge et des locaux, tri des déchets.', 'Sols glissants, produits d\'entretien, eau chaude, objets coupants, port de charges.', 'Chaussures de sécurité antidérapantes, tablier imperméable, gants.'],
  [/cuisin|chef de partie|commis de cuisine/i, 'Préparations froides et chaudes, mise en place, dressage, respect des fiches techniques et des normes HACCP, nettoyage du poste.', 'Brûlures, coupures, sols glissants, chaleur, port de charges.', 'Chaussures de sécurité antidérapantes, veste et tablier de cuisine, calot, gants anti-coupure.'],
  [/chambre|gouvernante|valet/i, 'Nettoyage et remise en état des chambres et parties communes, changement du linge, contrôle qualité, respect des protocoles d\'hygiène.', 'Produits d\'entretien, postures et gestes répétitifs, port de charges.', 'Chaussures antidérapantes, gants de ménage, tenue fournie par l\'établissement.'],
  [/r[ée]ception|veilleur/i, 'Accueil et information de la clientèle, arrivées et départs, facturation et encaissement, sécurité de l\'établissement.', 'Travail sur écran, travail de nuit, relations avec la clientèle.', 'Tenue fournie par l\'établissement.'],
  [/bar/i, 'Préparation et service des boissons, mise en place et entretien du bar, encaissement, respect de la réglementation sur l\'alcool.', 'Coupures (verre), sols glissants, port de charges (fûts, caisses).', 'Chaussures antidérapantes, tablier.'],
  [/petit-d/i, 'Mise en place et réassort du buffet du petit-déjeuner, service en salle, débarrassage, respect des normes HACCP.', 'Sols glissants, brûlures (boissons chaudes), port de plateaux.', 'Chaussures antidérapantes, tablier.'],
  [/./, 'Service en salle, dressage des tables, accueil de la clientèle, prise de commande, débarrassage, respect des normes HACCP.', 'Sols glissants, port de plateaux et de charges, ustensiles coupants, brûlures.', 'Chaussures de sécurité antidérapantes, tablier.'],
];
const fiche = poste => FICHES.find(([re]) => re.test(poste || ''));

/** Nombre de repas dus (convention HCR) : présence pendant le service du midi (11 h – 14 h 30) ou du soir (18 h – 22 h). */
function repas(debut, fin) {
  const [h1, m1] = debut.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
  const a = h1 * 60 + m1; let b = h2 * 60 + m2; if (b <= a) b += 1440;
  const chevauche = (x, y) => Math.max(0, Math.min(b, y) - Math.max(a, x)) + Math.max(0, Math.min(b, y + 1440) - Math.max(a, x + 1440));
  return (chevauche(11 * 60, 14 * 60 + 30) >= 60 ? 1 : 0) + (chevauche(18 * 60, 22 * 60) >= 60 ? 1 : 0);
}

/** Instantané de toutes les données du contrat, au moment de son émission. */
function donnees(missionId, interimId) {
  const m = one('SELECT * FROM missions WHERE id = ?', missionId), c = one('SELECT * FROM clients WHERE id = ?', m.client_id);
  const i = one('SELECT * FROM interimaires WHERE id = ?', interimId), g = k => P.get(k) || '';
  const nomPoste = Object.keys(POSTES).find(p => p.toLowerCase() === m.poste.trim().toLowerCase());
  const niveau = nomPoste ? (P.get(require('./hcr-grille').clePoste(nomPoste)) || POSTES[nomPoste]) : null;
  const f = fiche(m.poste), fin = m.fin <= m.debut ? new Date(new Date(m.date + 'T12:00Z').getTime() + 86400000).toISOString().slice(0, 10) : m.date;
  const maj = hcr.majorations(m.date, m.debut, m.fin);
  return {
    agence: {
      raison_sociale: g('raison_sociale'), forme_juridique: g('forme_juridique'), capital: g('capital'), siret: g('siret'), rcs: g('rcs'),
      adresse: [g('adresse'), [g('code_postal'), g('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', '), ville: g('ville'),
      representant: g('representant_nom'), qualite: g('representant_qualite'), garantie: g('garantie_financiere'),
      retraite: g('caisse_retraite'), prevoyance: g('organisme_prevoyance'), telephone: g('telephone'), email: g('email'),
    },
    interim: { nom: i.nom, prenom: i.prenom, date_naissance: i.date_naissance, lieu_naissance: i.lieu_naissance, nationalite: i.nationalite, nir: i.nir,
      adresse: [i.adresse, [i.code_postal, i.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
    client: { nom: c.nom, siret: c.siret, contact: c.contact, lieu: [c.adresse, c.ville].filter(Boolean).join(', ') },
    mission: {
      poste: m.poste, niveau, motif: m.motif, remplace_nom: m.remplace_nom, remplace_poste: m.remplace_poste,
      taches: m.taches || f[1], risques: m.risques || f[2], epi: m.epi || f[3],
      date: m.date, fin_date: fin, debut: m.debut, fin: m.fin, heures: maj.heures, 
      taux: m.taux_horaire, majorations: maj.lignes.map(l => ({ libelle: l.libelle, heures: l.heures, pc: l.pc })),
      bareme: { nuit: P.num('maj_nuit_pc', 0), dimanche: P.num('maj_dimanche_pc', 0), ferie: P.num('maj_ferie_pc', 0), mai1: P.num('maj_1er_mai_pc', 100) },
      repas: repas(m.debut, m.fin), valeur_repas: P.num('repas_valeur', 4.22),
      ifm_due: !/usage|saisonnier/i.test(m.motif), ifm_pc: P.num('ifm_taux', 10), iccp_pc: P.num('iccp_taux', 10), convention: g('convention'),
    },
  };
}

/** Création des contrats à la fin de la sélection (places pourvues). */
function creer(m, interimIds, annee) {
  for (const iid of interimIds) {
    if (one('SELECT 1 FROM contrats WHERE mission_id = ? AND interim_id = ?', m.id, iid)) continue;
    const n = one('SELECT COUNT(*) n FROM contrats WHERE numero LIKE ?', `C-${annee}-%`).n + 1;
    run('INSERT INTO contrats (numero, mission_id, interim_id, donnees) VALUES (?,?,?,?)', `C-${annee}-${String(n).padStart(5, '0')}`, m.id, iid, JSON.stringify(donnees(m.id, iid)));
    run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', iid, m.id, `Contrat de mission à signer : ${m.poste} chez ${m.client_nom}.`);
  }
  run('INSERT INTO notifications (client_id, mission_id, message) VALUES (?,?,?)', m.client_id, m.id, `Contrat${interimIds.length > 1 ? 's' : ''} de mission à signer : ${m.poste} du ${m.date}.`);
}

const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dfr = (iso, opts) => iso ? new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', opts) : '';
const dh = iso => new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
const n2 = x => Number(x).toFixed(2).replace('.', ',');
const pc = x => String(x).replace('.', ',');

/**
 * Contrat en HTML. vue = 'agence' | 'interim' | 'client' : l'employeur ne voit pas les données personnelles
 * de l'intérimaire (naissance, sécurité sociale, domicile), réservées à l'agence et au salarié.
 */
function html(k, vue) {
  const D = k.donnees ? JSON.parse(k.donnees) : donnees(k.mission_id, k.interim_id), A = D.agence, I = D.interim, C = D.client, M = D.mission;
  const manque = '<mark>[à compléter]</mark>', v = x => x ? e(x) : manque, prive = '<i>communiqué à l\'agence uniquement</i>';
  const coche = b => b ? '☒' : '☐';
  const motif = String(M.motif || '');
  const remp = /remplacement/i.test(motif), usage = /usage|saisonnier/i.test(motif), surcroit = !remp && !usage;
  const soussigne = (quand, nom, qualite, attente) => quand
    ? `<p class="ok">Lu et approuvé — signé électroniquement par <b>${e(nom)}</b>${qualite ? ', ' + e(qualite) : ''}<br>le ${dh(quand)}</p>` : `<p class="wait">${attente}</p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrat ${e(k.numero)}</title>
<style>body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:24px auto;padding:0 20px;color:#111;line-height:1.55;font-size:14.5px}
h1{font-size:21px;text-align:center;margin:0 0 4px;color:#112233}p.sub{text-align:center;color:#555;margin:0 0 4px;font-size:13px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #C99948;padding-bottom:3px;margin-top:24px;color:#112233}
dl{display:grid;grid-template-columns:230px 1fr;gap:3px 14px;margin:8px 0}dt{color:#555}dd{margin:0}mark{background:#fde68a}ul{margin:4px 0;padding-left:20px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:12px}.partie{border:1px solid #ccc;border-radius:6px;padding:10px 12px}.partie h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;color:#7E5F24}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.sig>div{border:1px solid #999;border-radius:6px;padding:10px 12px;min-height:90px}.sig h3{margin:0 0 6px;font-size:12.5px}
.ok{color:#166534;margin:0}.wait{color:#92400e;font-weight:bold;margin:0}.etat{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-family:Arial,sans-serif;background:${k.statut === 'signe' ? '#E4F4EA;color:#17663A' : k.statut === 'annule' ? '#ECEFF3;color:#596474' : '#FDF1DC;color:#8A5A0B'}}
.entete{background:#112233;margin:-24px -20px 20px;padding:16px 24px;border-bottom:5px solid #C99948;-webkit-print-color-adjust:exact;print-color-adjust:exact}.entete img{display:block;height:54px;width:auto;max-width:100%}
.note{font-size:12.5px;color:#444;border-left:3px solid #C99948;padding:4px 10px;background:#faf7f0}
@media print{body{margin:0}.entete{margin:0 0 20px}.noprint{display:none}}
@media (max-width:600px){body{font-size:13.5px;padding:0 14px}.entete{margin:-24px -14px 16px;padding:12px}.entete img{height:26px}dl,.parties,.sig{grid-template-columns:1fr}dt{margin-top:6px}}</style></head><body>
<div class="entete"><a href="/" title="Accueil"><picture><source media="(max-width: 600px)" srcset="/img/logo-compact.png"><img src="/img/logo-horizontal.png" alt="${e(A.raison_sociale)}"></picture></a></div>
<h1>Contrat de travail temporaire (contrat de mission)</h1>
<p class="sub">Articles L. 1251-1 et suivants du Code du travail · Convention collective nationale HCR (IDCC 1979)</p>
<p class="sub">N° ${e(k.numero)} · établi le ${dfr(k.created_at)} · <span class="etat">${k.statut === 'signe' ? 'Signé par toutes les parties' : k.statut === 'annule' ? 'Annulé' : 'En cours de signature'}</span></p>

<h2>Entre les soussignés</h2>
<div class="parties"><div class="partie"><h3>1. L'entreprise de travail temporaire</h3><dl style="grid-template-columns:1fr">
<dd><b>${v(A.raison_sociale)}</b>${A.forme_juridique ? ', ' + e(A.forme_juridique) : ''}${A.capital ? ` au capital de ${e(Number(A.capital).toLocaleString('fr-FR'))} €` : ''}</dd>
<dd>Siège : ${v(A.adresse)}</dd><dd>SIRET : ${v(A.siret)}${A.rcs ? ' · RCS ' + e(A.rcs) : ''}</dd>
<dd>Représentée par ${v(A.representant)}${A.qualite ? ', ' + e(A.qualite) : ''}</dd>
<dd>Garantie financière : ${v(A.garantie)}</dd><dd>Retraite / prévoyance : ${v(A.retraite)} · ${v(A.prevoyance)}</dd></dl>
<p class="sub" style="text-align:left">ci-après « l'Agence », d'une part,</p></div>
<div class="partie"><h3>2. Le salarié intérimaire</h3><dl style="grid-template-columns:1fr">
<dd><b>${e(String(I.nom).toUpperCase())} ${e(I.prenom)}</b></dd>
<dd>Né(e) le ${vue === 'client' ? prive : I.date_naissance ? dfr(I.date_naissance) + ' à ' + v(I.lieu_naissance) : manque}</dd>
<dd>Nationalité : ${v(I.nationalite)}</dd>
<dd>N° de sécurité sociale : ${vue === 'client' ? prive : I.nir ? e(String(I.nir).replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4 $5 $6 $7')) : manque}</dd>
<dd>Domicile : ${vue === 'client' ? prive : v(I.adresse)}</dd></dl>
<p class="sub" style="text-align:left">ci-après « le Salarié », d'autre part.</p></div></div>

<h2>Article 1 – Objet du contrat et motif du recours</h2>
<p>Le Salarié est engagé par l'Agence pour effectuer une mission au sein de l'entreprise utilisatrice ci-après.</p>
<dl><dt>Entreprise utilisatrice</dt><dd><b>${e(C.nom)}</b>${C.siret ? ' · SIRET ' + e(C.siret) : ''}</dd><dt>Lieu de la mission</dt><dd>${v(C.lieu)}</dd>
<dt>Motif légal du recours</dt><dd>${coche(surcroit)} Accroissement temporaire d'activité<br>
${coche(remp)} Remplacement d'un salarié absent${remp ? ` : ${v(M.remplace_nom)}${M.remplace_poste ? ', ' + e(M.remplace_poste) : ''}` : ''}<br>
${coche(usage)} Emploi à caractère saisonnier ou d'usage (dispositions conventionnelles HCR)</dd></dl>

<h2>Article 2 – Poste et qualification</h2>
<dl><dt>Intitulé du poste</dt><dd><b>${e(M.poste)}</b></dd>
<dt>Classification HCR (IDCC 1979)</dt><dd>${M.niveau ? `Niveau ${e(M.niveau.split('-')[0])} – échelon ${e(M.niveau.split('-')[1])}` : manque}</dd>
<dt>Tâches principales</dt><dd>${e(M.taches)}</dd><dt>Risques particuliers</dt><dd>${e(M.risques)}</dd>
<dt>Équipements de protection</dt><dd>${e(M.epi)} Fournis par l'entreprise utilisatrice.</dd></dl>

<h2>Article 3 – Durée de la mission et temps de travail</h2>
<dl><dt>Début de la mission</dt><dd>${dfr(M.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} à ${e(M.debut)}</dd>
<dt>Fin de la mission</dt><dd>${dfr(M.fin_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} à ${e(M.fin)}</dd>
<dt>Terme</dt><dd>Terme précis</dd>
<dt>Aménagement du terme</dt><dd>Mission d'une journée : pas d'aménagement du terme (1 jour pour 5 jours de travail, article L. 1251-30).</dd>
<dt>Durée du travail</dt><dd>${pc(M.heures)} h pour cette mission, selon l'horaire collectif de l'entreprise utilisatrice (39 h hebdomadaires dans la branche HCR).</dd></dl>

<h2>Article 4 – Période d'essai</h2>
<p>${coche(true)} 2 jours (contrat d'une durée inférieure ou égale à 1 mois), dans la limite de la durée de la mission (article L. 1251-14). Durant cette période, le contrat peut être rompu par l'une ou l'autre des parties sans préavis ni indemnité.</p>

<h2>Article 5 – Rémunération et avantages (secteur HCR)</h2>
<dl><dt>Taux horaire brut de base</dt><dd><b>${n2(M.taux)} € / heure</b>, au moins égal au minimum conventionnel HCR, au SMIC et au salaire d'un salarié de qualification équivalente de l'entreprise utilisatrice</dd>
<dt>Majorations horaires</dt><dd>Nuit (22 h – 7 h) : ${pc(M.bareme.nuit)} % · dimanche : ${pc(M.bareme.dimanche)} % · jours fériés : ${pc(M.bareme.ferie)} % · 1er mai : ${pc(M.bareme.mai1)} %${M.majorations.length ? `<br>Pour cette mission : ${M.majorations.map(l => `${e(l.libelle.toLowerCase())} ${pc(l.heures)} h à +${pc(l.pc)} %`).join(', ')}` : ''}</dd>
<dt>Nourriture (HCR)</dt><dd>${M.repas ? `${M.repas} repas par jour travaillé, fourni${M.repas > 1 ? 's' : ''} par l'établissement ou, à défaut, indemnité compensatrice de nourriture de ${n2(M.valeur_repas)} € par repas` : 'Mission hors des heures de repas : pas de repas dû'}</dd>
<dt>Heures supplémentaires</dt><dd>Majorées selon la réglementation légale et la convention collective ${e(M.convention)}</dd>
<dt>Indemnité de fin de mission</dt><dd>${M.ifm_due ? `${pc(M.ifm_pc)} % de la rémunération totale brute, versée au terme du contrat, sous réserve des exclusions légales` : 'Non due pour ce motif de recours (article L. 1251-33)'}</dd>
<dt>Congés payés</dt><dd>Indemnité compensatrice de ${pc(M.iccp_pc)} % de la rémunération totale brute, indemnité de fin de mission comprise, versée au terme de la mission</dd></dl>

<h2>Article 6 – Hygiène, sécurité et règlement intérieur</h2>
<p>Le Salarié s'engage à respecter le règlement intérieur de l'entreprise utilisatrice, les règles de sécurité, d'hygiène alimentaire (normes HACCP) et les conditions de travail. Il atteste avoir été informé des consignes de sécurité propres au poste. Les documents de prise de poste sont disponibles dans son espace intérimaire.</p>

<h2>Article 7 – Visite d'information et de prévention</h2>
<p>Le Salarié effectue la visite d'information et de prévention auprès du service de prévention et de santé au travail habilité, conformément à la réglementation du travail temporaire.</p>

<h2>Article 8 – Retraite complémentaire et prévoyance</h2>
<dl><dt>Caisse de retraite</dt><dd>${v(A.retraite)}</dd><dt>Mutuelle / prévoyance</dt><dd>${v(A.prevoyance)}</dd></dl>

<h2>Article 9 – Dispositions diverses</h2>
<p>Le présent contrat est établi en version électronique, consultable et téléchargeable par chaque partie dans son espace. Il doit être signé au plus tard dans les 2 jours ouvrables suivant le début de la mission (article L. 1251-17). L'embauche du Salarié par l'entreprise utilisatrice à l'issue de la mission n'est pas interdite. La rémunération du Salarié ne peut être inférieure à celle d'un salarié permanent de l'entreprise utilisatrice de qualification équivalente occupant le même poste.</p>

<p>Fait à ${v(A.ville)}, le ${dfr(k.created_at)}.</p>
<h2>Signatures</h2>
<div class="sig">
<div><h3>Pour l'entreprise de travail temporaire</h3><p class="ok">Émis et signé par <b>${v(A.representant)}</b>${A.qualite ? ', ' + e(A.qualite) : ''}<br>le ${dfr(k.created_at)}</p></div>
<div><h3>Le salarié intérimaire</h3>${soussigne(k.signe_le, k.signe_nom, '', 'En attente de la signature du salarié')}</div>
<div><h3>L'entreprise utilisatrice</h3>${soussigne(k.client_signe_le, k.client_signe_nom, '', k.statut === 'annule' ? 'Contrat annulé' : 'En attente de la signature de l\'entreprise utilisatrice')}</div></div>
<p class="note">Signature électronique simple : chaque signataire s'identifie avec son compte personnel, saisit « Lu et approuvé » et son nom ; la date, l'heure et l'adresse de connexion sont enregistrées.</p>
<p class="noprint note">Pour imprimer ou enregistrer en PDF : menu Imprimer du navigateur (Ctrl + P).</p>
</body></html>`;
}

module.exports = { creer, html, donnees, repas };
