'use strict';
/* Job dating des alternants HCR — espace de l'organisme (profil agence).
   Complète app.js (chargé avant) : rubrique du menu, vue, fenêtres et actions. */

P.qr = '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/><path d="M13 7h4v2M7 15v2h2"/>';
P.print = '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>';
// Rubrique « Job dating » dans le menu de l'agence, après les clients.
NAV.agence.splice(NAV.agence.findIndex(n => n[1] === 'Clients') + 1, 0, ['jobdating', 'Job dating alternants', 'qr']);

const JD_RDV = { demande: ['danger', 'À planifier'], planifie: ['libre', 'Rendez-vous fixé'], annule: ['off', 'Annulé'] };
const jdHeure = s => s ? `${fdate(s.slice(0, 10), 'long')} à ${s.slice(11, 13)} h ${s.slice(14, 16)}` : '';
let JD_OPTIONS = null;
const jdOptions = async () => JD_OPTIONS || (JD_OPTIONS = await GET('/jobdating/options'));
let JD = null; // dernier tableau chargé (événement affiché)

V.agence.jobdating = async () => (S.p.jdev ? jdEvenement(S.p.jdev) : jdListe());

async function jdListe() {
  const L = await GET('/jobdating/evenements'), t = S.cfg?.aujourdhui || '';
  return head('Job dating alternants', 'Chaque alternant reçoit un badge avec un QR code. Les recruteurs le scannent avec l\'application <a class="link" href="/recruteur" target="_blank" rel="noopener">/recruteur</a> et voient son profil et son CV <b>anonymes</b>. Ils demandent un rendez-vous en un clic ou écartent le profil, sans que l\'alternant en soit informé.',
    btn('Nouveau job dating', 'plus', 'data-a="jdev"', 'primary')) +
    `<div class="kpis">${kpi('Job datings', 'qr', L.length)}${kpi('À venir', 'cal', L.filter(e => e.date >= t).length)}${kpi('Alternants inscrits', 'idcard', L.reduce((a, e) => a + e.nb_alternants, 0))}
      ${kpi('Rendez-vous à planifier', 'send', L.reduce((a, e) => a + e.nb_a_traiter, 0), L.some(e => e.nb_a_traiter) ? 'Demandes des recruteurs' : 'À jour', L.some(e => e.nb_a_traiter) ? 'down' : '')}</div>` +
    panel('Événements', '', L.length ? `<div class="scroll"><table><thead><tr><th>Job dating</th><th>Date</th><th>Alternants</th><th>Recruteurs</th><th>Profils scannés</th><th>Rendez-vous</th><th>Statut</th></tr></thead><tbody>
      ${L.map(e => `<tr class="clickable" data-a="jdouvrir" data-id="${e.id}" tabindex="0"><td><b>${esc(e.nom)}</b>${e.lieu ? `<div class="small muted">${esc(e.lieu)}</div>` : ''}</td><td>${fdate(e.date, 'num')}</td>
        <td>${e.nb_alternants}</td><td>${e.nb_employeurs}</td><td>${e.nb_scans}</td><td>${e.nb_a_traiter ? badge('danger', `${e.nb_a_traiter} à planifier`) : ''} ${e.nb_planifies ? badge('libre', `${e.nb_planifies} fixé${e.nb_planifies > 1 ? 's' : ''}`) : ''}${!e.nb_a_traiter && !e.nb_planifies ? '<span class="muted">—</span>' : ''}</td>
        <td>${e.statut === 'clos' ? badge('off', 'Terminé') : e.date < t ? badge('attente', 'Date passée · ouvert') : badge('pris', 'Ouvert')}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Aucun job dating pour l\'instant. Créez le premier, ajoutez les alternants et les recruteurs, puis imprimez les badges.'));
}

async function jdEvenement(id) {
  const d = JD = await GET(`/jobdating/evenements/${id}`), e = d.evenement, t = d.totaux;
  const aTraiter = d.demandes.filter(x => x.rdv_statut === 'demande').length;
  const onglet = S.p.jdtab || (aTraiter ? 'demandes' : 'alternants');
  const clos = e.statut === 'clos';
  const contenu = {
    demandes: () => d.demandes.length ? `<div class="scroll"><table><thead><tr><th>Recruteur</th><th>Alternant</th><th>Demande</th><th>Statut</th><th></th></tr></thead><tbody>
      ${d.demandes.map(x => `<tr><td><b>${esc(x.entreprise)}</b><div class="small muted">${esc([x.contact, x.employeur_telephone, x.employeur_email].filter(Boolean).join(' · '))}</div></td>
        <td><b>n° ${x.numero} · ${esc(x.prenom)} ${esc(x.nom)}</b><div class="small muted">${esc(x.formation)}</div><div class="small muted">${esc([x.alternant_telephone, x.alternant_email].filter(Boolean).join(' · '))}</div></td>
        <td class="small">${fdate(x.decision_le?.slice(0, 10), 'num')}${x.disponibilites ? `<div><b>Disponibilités :</b> ${esc(x.disponibilites)}</div>` : ''}${x.message ? `<div class="muted">« ${esc(x.message)} »</div>` : ''}</td>
        <td>${badge(...JD_RDV[x.rdv_statut])}${x.rdv_statut === 'planifie' ? `<div class="small">${esc(jdHeure(x.rdv_le))}</div><div class="small muted">${esc(x.rdv_lieu)}</div>` : x.rdv_statut === 'annule' && x.rdv_note ? `<div class="small muted">${esc(x.rdv_note)}</div>` : ''}</td>
        <td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${x.rdv_statut === 'annule' ? btn('Rouvrir', '', `data-a="jdrouvrir" data-id="${x.id}"`, 'sm')
    : `${btn(x.rdv_statut === 'planifie' ? 'Modifier' : 'Planifier', 'cal', `data-a="jdplanifier" data-id="${x.id}"`, x.rdv_statut === 'planifie' ? 'sm' : 'sm primary')}${btn('Annuler', 'ban', `data-a="jdannuler" data-id="${x.id}"`, 'sm')}`}</div></td></tr>`).join('')}</tbody></table></div>`
      : empty('Aucune demande de rendez-vous pour l\'instant. Elles arrivent ici (et dans la cloche) dès qu\'un recruteur clique sur « Demander un rendez-vous ».'),
    alternants: () => d.alternants.length ? `<div class="scroll"><table><thead><tr><th>N°</th><th>Alternant (confidentiel)</th><th>Formation</th><th>Postes recherchés</th><th>CV</th><th>Recruteurs</th><th></th></tr></thead><tbody>
      ${d.alternants.map(a => `<tr class="clickable" data-a="jdalt" data-id="${a.id}" tabindex="0"><td><b>${a.numero}</b></td><td><b>${esc(a.prenom)} ${esc(a.nom)}</b><div class="small muted">${esc([a.telephone, a.email].filter(Boolean).join(' · '))}</div></td>
        <td>${esc(a.formation)}<div class="small muted">${esc([a.niveau, a.contrat].filter(Boolean).join(' · '))}</div></td><td class="small">${esc(a.postes || '—')}</td>
        <td>${a.cv ? badge('libre', 'Anonymisé') : '<span class="muted small">Aucun</span>'}</td>
        <td class="small">${a.nb_vus ? `${a.nb_vus} vu${a.nb_vus > 1 ? 's' : ''}` : '<span class="muted">Pas encore scanné</span>'}${a.nb_rdv ? `<div>${badge('libre', `${a.nb_rdv} rendez-vous`)}</div>` : ''}${a.nb_abandons ? `<div class="muted">${a.nb_abandons} écarté${a.nb_abandons > 1 ? 's' : ''}</div>` : ''}</td>
        <td class="r">${btn('Badge', 'qr', `data-a="jdbadge" data-id="${a.id}"`, 'sm')}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Aucun alternant inscrit. Ajoutez-les avec leur formation, leur projet et leur CV anonymisé : chacun reçoit un numéro et un QR code.'),
    recruteurs: () => d.employeurs.length ? `<div class="scroll"><table><thead><tr><th>Entreprise</th><th>Contact</th><th>Code d'accès</th><th>Profils scannés</th><th>Rendez-vous</th><th></th></tr></thead><tbody>
      ${d.employeurs.map(x => `<tr class="clickable" data-a="jdemp" data-id="${x.id}" tabindex="0"><td><b>${esc(x.entreprise)}</b>${x.ville ? `<div class="small muted">${esc(x.ville)}</div>` : ''}</td>
        <td class="small">${esc(x.contact || '—')}<div class="muted">${esc([x.telephone, x.email].filter(Boolean).join(' · '))}</div></td><td><code>${esc(x.code)}</code></td>
        <td>${x.nb_vus}${x.nb_abandons ? ` <span class="small muted">(${x.nb_abandons} écarté${x.nb_abandons > 1 ? 's' : ''})</span>` : ''}</td><td>${x.nb_rdv || '<span class="muted">—</span>'}</td>
        <td class="r">${btn('Accès', 'lock', `data-a="jdacces" data-id="${x.id}"`, 'sm')}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Aucun recruteur inscrit. Ajoutez les entreprises participantes : chacune reçoit un code d\'accès à l\'application.'),
  };
  const ajouter = { alternants: btn('Ajouter un alternant', 'plus', 'data-a="jdalt"', 'sm primary'), recruteurs: btn('Ajouter un recruteur', 'plus', 'data-a="jdemp"', 'sm primary'), demandes: '' }[onglet];
  return `<button class="btn ghost sm" data-a="jdretour" style="margin-bottom:8px">${ic('left')}Tous les job datings</button>` +
    head(esc(e.nom), `${fdate(e.date, 'long')}${e.lieu ? ' · ' + esc(e.lieu) : ''} · ${clos ? 'terminé : les recruteurs ne peuvent plus scanner de nouveaux profils' : 'ouvert aux scans'}${e.description ? `<br>${esc(e.description)}` : ''}`,
      `<a class="btn" href="/api/jobdating/evenements/${e.id}/badges" target="_blank" rel="noopener">${ic('print')}Badges alternants</a><a class="btn" href="/api/jobdating/evenements/${e.id}/cartes-recruteurs" target="_blank" rel="noopener">${ic('print')}Cartes recruteurs</a>
      ${btn('Modifier', 'edit', `data-a="jdev" data-id="${e.id}"`)}${btn(clos ? 'Rouvrir' : 'Clore', clos ? 'check' : 'lock', `data-a="jdstatut" data-id="${e.id}" data-s="${clos ? 'ouvert' : 'clos'}"`)}`) +
    `<div class="kpis">${kpi('Alternants', 'idcard', d.alternants.length)}${kpi('Recruteurs', 'building', d.employeurs.length)}${kpi('Profils scannés', 'qr', t.scans, `${t.abandons} écarté${t.abandons > 1 ? 's' : ''} · ${t.a_decider} à décider`)}
      ${kpi('Rendez-vous', 'cal', d.demandes.filter(x => x.rdv_statut === 'planifie').length + ' fixé(s)', aTraiter ? `${aTraiter} à planifier` : 'Aucun en attente', aTraiter ? 'down' : '')}</div>` +
    panel(`<span class="jd-onglets"></span>`, `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;flex:1"><div class="seg">${[['demandes', `Demandes de rendez-vous${aTraiter ? ` (${aTraiter})` : ''}`], ['alternants', `Alternants (${d.alternants.length})`], ['recruteurs', `Recruteurs (${d.employeurs.length})`]]
      .map(([k, l]) => `<button type="button" aria-pressed="${onglet === k}" data-a="tab" data-k="jdtab" data-v="${k}">${l}</button>`).join('')}</div>${ajouter}</div>`, contenu[onglet]()) +
    `<div class="row" style="justify-content:flex-end;margin-top:12px">${btn('Supprimer ce job dating et ses données', 'trash', `data-a="jdevdel" data-id="${e.id}" data-n="${esc(e.nom)}"`, 'sm danger')}</div>`;
}

/* ---------------- Fenêtres ---------------- */
function jdEvModal(e = {}) {
  openModal(`${modalHead(ic('qr') + (e.id ? 'Modifier le job dating' : 'Nouveau job dating'))}<form data-f="jdev" data-id="${e.id || ''}"><div class="panel-b form">
    <label class="f full">Nom<input type="text" name="nom" required maxlength="150" value="${esc(e.nom || '')}" placeholder="Job dating alternance HCR — printemps"></label>
    <label class="f">Date<input type="date" name="date" required value="${esc(e.date || '')}"></label><label class="f">Lieu<input type="text" name="lieu" maxlength="200" value="${esc(e.lieu || '')}" placeholder="CFA, salle, adresse"></label>
    <label class="f full">Description (facultatif, interne)<textarea name="description" maxlength="2000">${esc(e.description || '')}</textarea></label><div class="err full" hidden></div></div>
    ${modalFoot(e.id ? 'Enregistrer' : 'Créer le job dating', 'type="submit"')}</form>`);
}
async function jdAltModal(a = {}) {
  const o = await jdOptions();
  const f = (k, l, attrs = '', type = 'text') => `<label class="f">${l}<input type="${type}" name="${k}" value="${esc(a[k] || '')}" ${attrs}></label>`;
  const ta = (k, l, ph = '', max = 1500) => `<label class="f full">${l}<textarea name="${k}" maxlength="${max}" placeholder="${esc(ph)}">${esc(a[k] || '')}</textarea></label>`;
  const sel = (k, l, list) => `<label class="f">${l}<select name="${k}"><option value="">—</option>${list.map(x => `<option ${x === a[k] ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
  openModal(`${modalHead(ic('idcard') + (a.id ? `Alternant n° ${a.numero}` : 'Ajouter un alternant'), 'Les recruteurs ne voient jamais l\'identité ni les coordonnées : seulement le numéro du badge et le profil.')}
    <form data-f="jdalt" data-id="${a.id || ''}" novalidate><div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="private" style="gap:10px"><span class="h">${ic('lock')}Identité · visible par l'organisme seulement</span><div class="form">
      ${f('prenom', 'Prénom', 'required maxlength="80"')}${f('nom', 'Nom', 'required maxlength="80"')}${f('telephone', 'Téléphone', 'maxlength="30"', 'tel')}${f('email', 'E-mail', 'maxlength="150"', 'email')}</div></div>
    <h3 class="q-titre">Profil anonyme · montré aux recruteurs</h3><div class="form">
      ${f('formation', 'Diplôme préparé', 'required maxlength="150" placeholder="BTS Management en hôtellerie-restauration"')}${sel('niveau', 'Niveau', o.niveaux)}
      ${sel('contrat', 'Contrat recherché', o.contrats)}${f('ecole', 'École / CFA', 'maxlength="150"')}
      ${f('postes', 'Postes recherchés', 'maxlength="300" placeholder="Commis de cuisine, cuisinier"')}${sel('secteur', 'Secteur', o.secteurs)}
      ${f('rythme', 'Rythme de l\'alternance', 'maxlength="150" placeholder="2 jours au CFA / 3 jours en entreprise"')}${f('debut', 'Début souhaité', '', 'date')}
      ${f('duree', 'Durée du contrat', 'maxlength="60" placeholder="2 ans"')}${f('langues', 'Langues', 'maxlength="200" placeholder="Anglais courant, espagnol"')}
      ${f('mobilite', 'Mobilité', 'maxlength="300" placeholder="Lyon et 20 km, permis B"')}
      ${ta('competences', 'Compétences (séparées par des virgules)', 'HACCP, dressage, service au plateau…')}${ta('qualites', 'Savoir-être (séparés par des virgules)', 'Ponctuel, esprit d\'équipe…', 1000)}
      ${ta('experiences', 'Expériences (sans nom d\'employeur si cela permet d\'identifier la personne)', 'Stage 8 semaines en brasserie (commis de cuisine)…', 3000)}
      ${ta('projet', 'Projet et motivation', 'Pourquoi ce métier, ce qu\'il/elle recherche…', 2000)}</div>
    <div class="private" style="gap:8px"><span class="h">${ic('file')}CV anonymisé</span>
      ${a.cv ? `<div class="row" style="gap:8px;flex-wrap:wrap">${badge('libre', 'CV joint')}<a class="btn sm" href="/api/jobdating/alternants/${a.id}/cv">${ic('download')}Télécharger</a>${btn('Retirer le CV', 'trash', `data-a="jdcvdel" data-id="${a.id}"`, 'sm')}</div>` : ''}
      <label class="f">${a.cv ? 'Remplacer par' : 'Fichier'} (PDF, Word ou image, 5 Mo maximum)<input type="file" name="cv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,image/*"></label>
      <label class="check"><input type="checkbox" name="cv_anonyme" value="1"> Je certifie que ce CV est anonymisé : ni nom, ni photo, ni adresse, ni téléphone, ni e-mail, ni date de naissance.</label>
      <span class="hint">Le CV est montré tel quel aux recruteurs qui scannent le badge. Retirez toute donnée qui permettrait d'identifier l'alternant.</span></div>
    <div class="err" hidden></div></div>
    <div class="panel-f" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div class="row">${a.id ? btn('Badge et QR code', 'qr', `data-a="jdbadge" data-id="${a.id}"`, 'sm') + btn('Supprimer', 'trash', `data-a="jdaltdel" data-id="${a.id}"`, 'sm danger') : ''}</div>
      <div class="row">${btn('Annuler', '', 'data-a="close"')}<button class="btn primary" type="submit">${a.id ? 'Enregistrer' : 'Ajouter et créer le badge'}</button></div></div></form>`);
}
const jdEnvoi = (type, id, email, tel) => `<form data-f="jdenvoi" data-t="${type}" data-id="${id}" class="private" style="gap:8px"><span class="h">${ic('send')}Envoyer ${type === 'alternants' ? 'son badge à l\'alternant' : 'l\'accès au recruteur'}</span>
  <div class="statusline">${['mail', 'sms', 'whatsapp'].map(k => `<label class="check"><input type="checkbox" name="canal" value="${k}" ${(k === 'mail' && email) || (k === 'sms' && !email && tel) ? 'checked' : ''}>${CANAUX[k][1]}</label>`).join('')}</div>
  <span class="hint">${esc([email, tel].filter(Boolean).join(' · ') || 'Aucune coordonnée sur la fiche : complétez-la d\'abord.')}</span>
  <div class="row"><button class="btn sm" type="submit">${ic('send')}Envoyer</button><span class="small" data-resultat></span></div></form>`;
function jdBadgeModal(a) {
  openModal(`${modalHead(ic('qr') + `Badge n° ${a.numero}`, `${esc(a.prenom)} ${esc(a.nom)} · ${esc(a.formation)}`)}<div class="panel-b" style="display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center">
    <img src="/api/jobdating/alternants/${a.id}/qr.svg" alt="QR code du badge n° ${a.numero}" width="220" height="220" style="border:1px solid var(--line);border-radius:8px">
    <p class="small muted">Le QR code ouvre le profil anonyme dans l'application des recruteurs. Ouvert par l'alternant, il affiche simplement son badge à présenter sur son téléphone.</p>
    <div class="row" style="flex-wrap:wrap;justify-content:center"><a class="btn sm" href="/api/jobdating/evenements/${a.evenement_id}/badges?alternant=${a.id}" target="_blank" rel="noopener">${ic('print')}Imprimer ce badge</a>${btn('Copier le lien', 'file', `data-a="copy" data-t="${esc(a.lien)}"`, 'sm')}</div>
    <div style="width:100%;text-align:left">${jdEnvoi('alternants', a.id, a.email, a.telephone)}</div></div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Terminé', 'check', 'data-a="close"', 'primary')}</div>`);
}
function jdEmpModal(x = {}) {
  const f = (k, l, attrs = '', type = 'text') => `<label class="f">${l}<input type="${type}" name="${k}" value="${esc(x[k] || '')}" ${attrs}></label>`;
  openModal(`${modalHead(ic('building') + (x.id ? esc(x.entreprise) : 'Ajouter un recruteur'), 'Chaque recruteur reçoit un code d\'accès personnel à l\'application.')}<form data-f="jdemp" data-id="${x.id || ''}"><div class="panel-b form">
    ${f('entreprise', 'Entreprise', 'required maxlength="150"')}${f('ville', 'Ville', 'maxlength="100"')}${f('contact', 'Recruteur (nom, fonction)', 'maxlength="120"')}
    ${f('telephone', 'Téléphone', 'maxlength="30"', 'tel')}${f('email', 'E-mail', 'maxlength="150"', 'email')}<div class="err full" hidden></div></div>
    <div class="panel-f" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div class="row">${x.id ? btn('Code d\'accès', 'lock', `data-a="jdacces" data-id="${x.id}"`, 'sm') + btn('Supprimer', 'trash', `data-a="jdempdel" data-id="${x.id}"`, 'sm danger') : ''}</div>
      <div class="row">${btn('Annuler', '', 'data-a="close"')}<button class="btn primary" type="submit">${x.id ? 'Enregistrer' : 'Ajouter et créer l\'accès'}</button></div></div></form>`);
}
function jdAccesModal(x) {
  openModal(`${modalHead(ic('lock') + 'Accès recruteur', esc(x.entreprise))}<div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="cred"><div class="line"><div><div class="small muted">Code d'accès (sur <code>/recruteur</code>)</div><code style="font-size:22px;letter-spacing:.1em">${esc(x.code)}</code></div>${btn('Copier', 'file', `data-a="copy" data-t="${esc(x.code)}"`, 'sm')}</div>
    <div class="line"><div style="min-width:0"><div class="small muted">Lien de connexion directe</div><code class="small">${esc(x.lien)}</code></div>${btn('Copier', 'file', `data-a="copy" data-t="${esc(x.lien)}"`, 'sm')}</div></div>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><img src="/api/jobdating/employeurs/${x.id}/qr.svg" alt="QR code de connexion" width="150" height="150" style="border:1px solid var(--line);border-radius:8px">
      <p class="small muted" style="flex:1;min-width:200px">Le recruteur scanne ce QR code avec son téléphone : l'application s'ouvre déjà connectée. Imprimez sa carte ou envoyez-lui l'accès.</p></div>
    <div class="row" style="flex-wrap:wrap"><a class="btn sm" href="/api/jobdating/evenements/${x.evenement_id}/cartes-recruteurs?employeur=${x.id}" target="_blank" rel="noopener">${ic('print')}Imprimer sa carte</a>${btn('Nouveau code', 'lock', `data-a="jdcode" data-id="${x.id}"`, 'sm')}</div>
    ${jdEnvoi('employeurs', x.id, x.email, x.telephone)}</div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Terminé', 'check', 'data-a="close"', 'primary')}</div>`);
}
function jdPlanifierModal(x) {
  const lieu = x.rdv_lieu || '';
  openModal(`${modalHead(ic('cal') + 'Planifier le rendez-vous', `${esc(x.entreprise)} · n° ${x.numero} ${esc(x.prenom)} ${esc(x.nom)}`)}<form data-f="jdplanifier" data-id="${x.id}"><div class="panel-b form">
    ${x.disponibilites || x.message ? `<div class="full small">${x.disponibilites ? `<div><b>Disponibilités du recruteur :</b> ${esc(x.disponibilites)}</div>` : ''}${x.message ? `<div class="muted">« ${esc(x.message)} »</div>` : ''}</div>` : ''}
    <label class="f">Date et heure<input type="datetime-local" name="rdv_le" required value="${esc(x.rdv_le || '')}"></label>
    <label class="f">Lieu<input type="text" name="rdv_lieu" required maxlength="300" value="${esc(lieu)}" placeholder="Adresse de l'établissement, visio, téléphone"></label>
    <label class="f full">Précisions (facultatif, envoyées aux deux)<textarea name="rdv_note" maxlength="1000" placeholder="Se présenter à l'accueil, apporter son CV complet…">${esc(x.rdv_note || '')}</textarea></label>
    <div class="full" style="display:flex;flex-direction:column;gap:8px">
      <label class="check"><input type="checkbox" name="prevenir_employeur" value="1" ${x.employeur_email ? 'checked' : 'disabled'}> Prévenir le recruteur par e-mail${x.employeur_email ? '' : ' (pas d\'e-mail sur sa fiche)'}</label>
      <label class="check"><input type="checkbox" name="prevenir_alternant" value="1" checked> Prévenir l'alternant (le nom de l'entreprise lui est alors communiqué)</label>
      <div class="statusline" style="padding-left:24px">${['mail', 'sms', 'whatsapp'].map(k => `<label class="check"><input type="checkbox" name="canal_alternant" value="${k}" ${k !== 'whatsapp' ? 'checked' : ''}>${CANAUX[k][1]}</label>`).join('')}</div>
      <span class="hint">Le recruteur voit le rendez-vous et le prénom de l'alternant dans son application.</span></div><div class="err full" hidden></div></div>
    ${modalFoot('Fixer le rendez-vous', 'type="submit"')}</form>`);
}

/* ---------------- Actions ---------------- */
const jdTrouve = (liste, id) => (JD?.[liste] || []).find(x => x.id === Number(id));
Object.assign(A, {
  jdouvrir: el => { S.p.jdev = Number(el.dataset.id); S.p.jdtab = null; reload(); },
  jdretour: () => { S.p.jdev = null; S.p.jdtab = null; reload(); },
  jdev: el => jdEvModal(el.dataset.id ? JD?.evenement : {}),
  jdstatut: el => act(async () => { await PUT(`/jobdating/evenements/${el.dataset.id}`, { statut: el.dataset.s }); toast(el.dataset.s === 'clos' ? 'Job dating clos : plus de nouveaux scans' : 'Job dating rouvert'); reload(); }, el),
  jdevdel: el => openModal(`${modalHead(ic('trash') + 'Supprimer le job dating', esc(el.dataset.n))}<form data-f="jdevdel" data-id="${el.dataset.id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p>Les alternants, leurs CV, les recruteurs, leurs accès et les demandes de rendez-vous seront <b>effacés sans retour possible</b>. Faites-le à la fin de la durée de conservation annoncée aux participants.</p>
    <label class="check"><input type="checkbox" name="ok" required> Je confirme la suppression définitive</label></div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Annuler', '', 'data-a="close"')}<button class="btn danger" type="submit">${ic('trash')}Supprimer</button></div></form>`),
  jdalt: el => jdAltModal(el.dataset.id ? jdTrouve('alternants', el.dataset.id) : {}),
  jdbadge: (el, e) => { e?.stopPropagation(); const a = jdTrouve('alternants', el.dataset.id); if (a) jdBadgeModal(a); },
  jdaltdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.append(' : confirmer'); return; } await DEL(`/jobdating/alternants/${el.dataset.id}`); closeModal(); toast('Alternant supprimé, CV compris'); reload(); }, el),
  jdcvdel: el => act(async () => { await DEL(`/jobdating/alternants/${el.dataset.id}/cv`); closeModal(); toast('CV retiré'); reload(); }, el),
  jdemp: el => jdEmpModal(el.dataset.id ? jdTrouve('employeurs', el.dataset.id) : {}),
  jdacces: (el, e) => { e?.stopPropagation(); const x = jdTrouve('employeurs', el.dataset.id); if (x) jdAccesModal(x); },
  jdempdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.append(' : confirmer'); return; } await DEL(`/jobdating/employeurs/${el.dataset.id}`); closeModal(); toast('Recruteur supprimé'); reload(); }, el),
  jdcode: el => act(async () => {
    if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.append(' : l\'ancien ne marchera plus, confirmer'); return; }
    const x = await POST(`/jobdating/employeurs/${el.dataset.id}/code`); await reload(); jdAccesModal(x); toast('Nouveau code créé');
  }, el),
  jdplanifier: el => { const x = jdTrouve('demandes', el.dataset.id); if (x) jdPlanifierModal(x); },
  jdannuler: el => openModal(`${modalHead(ic('ban') + 'Annuler la demande de rendez-vous')}<form data-f="jdannuler" data-id="${el.dataset.id}"><div class="panel-b">
    <label class="f">Motif (affiché au recruteur dans son application)<input type="text" name="motif" maxlength="500" placeholder="L'alternant a déjà trouvé son entreprise…"></label></div>${modalFoot('Annuler la demande', 'type="submit"')}</form>`),
  jdrouvrir: el => act(async () => { await POST(`/jobdating/demandes/${el.dataset.id}/rouvrir`); toast('Demande rouverte'); reload(); }, el),
});
const jdErreur = (f, e) => { const err = f.querySelector('.err'); if (!err) throw e; err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
Object.assign(F, {
  jdev: (fd, f) => act(async () => {
    const b = Object.fromEntries(fd);
    try {
      if (f.dataset.id) await PUT(`/jobdating/evenements/${f.dataset.id}`, b);
      else { const e = await POST('/jobdating/evenements', b); S.p.jdev = e.id; S.p.jdtab = 'alternants'; }
    } catch (e) { return jdErreur(f, e); }
    closeModal(); toast(f.dataset.id ? 'Job dating modifié' : 'Job dating créé : ajoutez les alternants et les recruteurs'); reload();
  }),
  jdevdel: (fd, f) => act(async () => { await DEL(`/jobdating/evenements/${f.dataset.id}`); closeModal(); S.p.jdev = null; toast('Job dating supprimé avec toutes ses données'); reload(); }),
  jdalt: (fd, f) => act(async () => {
    if (!fd.get('cv')?.size) fd.delete('cv');
    let a;
    try { a = f.dataset.id ? await api('PUT', `/jobdating/alternants/${f.dataset.id}`, fd) : await api('POST', `/jobdating/evenements/${S.p.jdev}/alternants`, fd); } catch (e) { return jdErreur(f, e); }
    closeModal(); S.p.jdtab = 'alternants'; await reload();
    if (!f.dataset.id) { const x = jdTrouve('alternants', a.id); if (x) jdBadgeModal(x); toast(`Alternant ajouté : badge n° ${a.numero}`); } else toast('Fiche enregistrée');
  }),
  jdemp: (fd, f) => act(async () => {
    let x;
    try { x = f.dataset.id ? await PUT(`/jobdating/employeurs/${f.dataset.id}`, Object.fromEntries(fd)) : await POST(`/jobdating/evenements/${S.p.jdev}/employeurs`, Object.fromEntries(fd)); } catch (e) { return jdErreur(f, e); }
    closeModal(); S.p.jdtab = 'recruteurs'; await reload();
    if (!f.dataset.id) { jdAccesModal(x); toast('Recruteur ajouté : transmettez-lui son accès'); } else toast('Fiche enregistrée');
  }),
  jdenvoi: (fd, f) => act(async () => {
    const r = await POST(`/jobdating/${f.dataset.t}/${f.dataset.id}/envoyer`, { canaux: fd.getAll('canal') });
    const lib = { envoye: 'envoyé', simule: 'simulé (canal non configuré)', echec: 'échec' };
    f.querySelector('[data-resultat]').textContent = Object.entries(r.resultats).map(([c, x]) => `${CANAUX[c][1]} : ${lib[x.statut]}${x.statut === 'echec' && x.detail ? ` (${x.detail})` : ''}`).join(' · ');
  }, f.querySelector('button[type="submit"]')),
  jdplanifier: (fd, f) => act(async () => {
    const b = { rdv_le: fd.get('rdv_le'), rdv_lieu: fd.get('rdv_lieu'), rdv_note: fd.get('rdv_note'), prevenir_employeur: fd.has('prevenir_employeur'), prevenir_alternant: fd.has('prevenir_alternant'), canaux_alternant: fd.getAll('canal_alternant') };
    try { await POST(`/jobdating/demandes/${f.dataset.id}/planifier`, b); } catch (e) { return jdErreur(f, e); }
    closeModal(); toast('Rendez-vous fixé'); reload();
  }),
  jdannuler: (fd, f) => act(async () => { await POST(`/jobdating/demandes/${f.dataset.id}/annuler`, { motif: fd.get('motif') }); closeModal(); toast('Demande annulée'); reload(); }),
});

/* Compteur du menu : demandes de rendez-vous à planifier. */
const jdRefreshCounts = refreshCounts;
refreshCounts = async function () {
  await jdRefreshCounts();
  if (S.me?.profil !== 'agence') return;
  try {
    const n = (await GET('/jobdating/evenements')).reduce((a, e) => a + e.nb_a_traiter, 0), el = document.querySelector('[data-count="jobdating"]');
    if (el) { el.hidden = !n; el.textContent = n; }
    const dot = $('#menu-btn .dot'); if (dot && n) dot.hidden = false;
  } catch { /* compteur non essentiel */ }
};
