'use strict';
/* Job dating — application des recruteurs : scan des badges, profils anonymes, demande de rendez-vous ou abandon.
   Toutes les règles (anonymat, accès au seul job dating du recruteur) sont appliquées par le serveur. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = {
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/><path d="M13 7h4v2M7 15v2h2"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  gauche: '<path d="m15 18-6-6 6-6"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  masque: '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  retour: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
};
const ic = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const fdate = iso => !iso ? '' : new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmois = iso => !iso ? '' : new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const fheure = s => s ? `${fdate(s)} à ${s.slice(11, 13)} h ${s.slice(14, 16)}` : '';

/* ---------------- API ---------------- */
async function api(method, url, body) {
  const res = await fetch('/api' + url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CHR': '1' }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && url !== '/jd/connexion') { R.moi = null; ecranConnexion(); throw new Error(data?.error || 'Connexion requise.'); }
  if (!res.ok) throw new Error(data?.error || 'Une erreur est survenue.');
  return data;
}
const GET = u => api('GET', u), POST = (u, b = {}) => api('POST', u, b);

const R = { moi: null, profils: [], filtre: 'tous', courant: null, suite: null, flux: null, busy: false };

let toastT;
function toast(msg, erreur) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erreur ? ' erreur' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, erreur ? 5000 : 3000);
}
async function act(fn, el) {
  if (R.busy) return; R.busy = true; if (el) el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { R.busy = false; if (el && el.isConnected) el.disabled = false; }
}

/* ---------------- Démarrage ---------------- */
async function boot() {
  const q = new URLSearchParams(location.search);
  R.suite = q.get('suite') || (location.hash.startsWith('#p=') ? decodeURIComponent(location.hash.slice(3)) : null);
  const acces = q.get('acces');
  if (acces || q.has('suite')) history.replaceState(null, '', '/recruteur');
  if (acces) {
    try { R.moi = await POST('/jd/connexion', { acces }); } catch (e) { ecranConnexion(e.message); return; }
  } else {
    try { R.moi = await GET('/jd/moi'); } catch { R.moi = null; }
  }
  if (!R.moi) return ecranConnexion();
  demarrer();
}
async function demarrer() {
  enTete();
  if (R.suite) {
    const s = R.suite; R.suite = null; history.replaceState(null, '', '/recruteur');
    await ouvrir(s); if (R.courant) return;
  }
  accueil();
}
function enTete() {
  const m = R.moi;
  $('#haut-t').innerHTML = m ? `<b>${esc(m.evenement.nom)}</b><span>${esc(m.employeur.entreprise)}${m.employeur.contact ? ' · ' + esc(m.employeur.contact) : ''}</span>` : '<b>Job dating</b><span>Espace recruteurs</span>';
  $('#btn-deco').hidden = !m;
}

/* ---------------- Connexion ---------------- */
function ecranConnexion(erreur) {
  arreterScan(); fermerFeuille(); enTete(); document.body.classList.remove('avec-actions');
  $('#main').innerHTML = `<div class="carte"><h1>Bienvenue au job dating</h1>
    <p class="doux">Saisissez le code d'accès remis par l'organisme, ou scannez le QR code de votre carte recruteur avec l'appareil photo de votre téléphone.</p>
    <form data-f="connexion" class="carte" style="padding:0;border:0" novalidate>
      <label class="f">Code d'accès<input class="code-input" type="text" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="ABCD-2345" required></label>
      ${erreur ? `<div class="err" role="alert">${esc(erreur)}</div>` : '<div class="err" role="alert" hidden></div>'}
      <button class="btn or plein" type="submit">Accéder aux profils</button></form></div>
    <div class="info">${ic('masque')}<p>Les profils des alternants sont <b>anonymes</b> : ni nom, ni photo, ni coordonnées. Vous jugez sur les compétences et la motivation. Si un profil vous intéresse, l'organisme organise le rendez-vous.</p></div>`;
  const i = $('input[name="code"]'); if (i) i.focus();
}

/* ---------------- Accueil : scanner et profils consultés ---------------- */
const STATUT = p => p.rdv_statut === 'planifie' ? ['planifie', 'Rendez-vous fixé'] : p.rdv_statut === 'annule' ? ['annule', 'Rendez-vous annulé']
  : p.decision === 'rdv' ? ['rdv', 'Rendez-vous demandé'] : p.decision === 'abandon' ? ['abandon', 'Écarté'] : ['decider', 'À décider'];
const FILTRES = [['tous', 'Tous'], ['decider', 'À décider'], ['rdv', 'Rendez-vous'], ['abandon', 'Écartés']];
const garde = (p, f) => f === 'tous' || (f === 'decider' && !p.decision) || (f === 'rdv' && p.decision === 'rdv') || (f === 'abandon' && p.decision === 'abandon');

async function accueil() {
  arreterScan(); fermerFeuille(); R.courant = null; document.body.classList.remove('avec-actions');
  const main = $('#main');
  try { R.profils = await GET('/jd/profils'); } catch (e) { if (!R.moi) return; main.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const clos = R.moi.evenement.statut === 'clos', L = R.profils.filter(p => garde(p, R.filtre));
  const n = f => R.profils.filter(p => garde(p, f)).length;
  main.innerHTML = `${clos ? '<div class="info">' + ic('info') + '<p>Le job dating est terminé : vous pouvez encore demander un rendez-vous pour les profils déjà consultés.</p></div>'
    : `<button class="btn nuit scan-btn" data-a="scanner">${ic('scan')}Scanner un badge</button>
    <form data-f="numero" class="rang" novalidate><input type="number" name="numero" inputmode="numeric" min="1" placeholder="ou le n° du badge" aria-label="Numéro du badge"><button class="btn" type="submit">Ouvrir</button></form>`}
    <section class="carte" style="gap:12px"><h2>Profils consultés (${R.profils.length})</h2>
    <div class="onglets" role="group" aria-label="Filtrer">${FILTRES.map(([k, l]) => `<button class="onglet" data-a="filtre" data-v="${k}" aria-pressed="${R.filtre === k}">${l}${k !== 'tous' ? ` · ${n(k)}` : ''}</button>`).join('')}</div>
    <div class="liste">${L.length ? L.map(ligne).join('') : `<p class="vide">${R.profils.length ? 'Aucun profil dans cette liste.' : 'Scannez le QR code du badge d\'un alternant pour voir son profil.'}</p>`}</div></section>
    <div class="info">${ic('masque')}<p>Le candidat n'est <b>jamais informé</b> quand vous écartez son profil. Seules vos demandes de rendez-vous sont transmises, à l'organisme${R.moi.organisme?.nom ? ` (${esc(R.moi.organisme.nom)})` : ''}, qui vous recontacte.</p></div>`;
}
const ligne = p => { const [c, l] = STATUT(p); return `<button class="ligne" data-a="profil" data-id="${p.id}"><span class="num">${p.numero}</span><span class="t"><b>${esc(p.formation || 'Formation non précisée')}</b>
  <span class="doux petit">${esc([p.postes, p.niveau].filter(Boolean).join(' · ') || '—')}</span><span class="pastille p-${c}">${l}</span></span></button>`; };

/* ---------------- Scanner ---------------- */
async function scanner() {
  const peut = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
  let formats = [];
  if (peut) { try { formats = await BarcodeDetector.getSupportedFormats(); } catch { formats = []; } }
  const el = document.createElement('div'); el.className = 'scanner'; el.id = 'scanner';
  el.innerHTML = `${peut && formats.includes('qr_code') ? '<video playsinline muted autoplay></video><div class="viseur"></div>' : '<div style="flex:1"></div>'}
    <div class="scanner-bas"><p data-msg>${peut && formats.includes('qr_code') ? 'Placez le QR code du badge dans le cadre.' : 'Le scan intégré n\'est pas disponible sur ce navigateur. Scannez le badge avec l\'appareil photo de votre téléphone : le profil s\'ouvrira ici. Vous pouvez aussi saisir le numéro du badge.'}</p>
    <form data-f="numero" class="rang" novalidate><input type="number" name="numero" inputmode="numeric" min="1" placeholder="N° du badge" aria-label="Numéro du badge"><button class="btn or" type="submit">Ouvrir</button></form>
    <button class="btn plein" data-a="fermerscan">${ic('x')}Fermer</button></div>`;
  document.body.append(el);
  if (!(peut && formats.includes('qr_code'))) return;
  try {
    R.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch {
    el.querySelector('[data-msg]').textContent = 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le numéro du badge.';
    return;
  }
  const video = el.querySelector('video'); video.srcObject = R.flux;
  const det = new BarcodeDetector({ formats: ['qr_code'] });
  const boucle = async () => {
    if (!R.flux || !document.getElementById('scanner')) return;
    try {
      if (video.readyState >= 2) {
        const codes = await det.detect(video);
        const c = codes.find(x => /\/jd\/[A-Za-z0-9_-]{10,}/.test(x.rawValue));
        if (c) { if (navigator.vibrate) navigator.vibrate(60); arreterScan(); return ouvrir(c.rawValue); }
        if (codes.length) el.querySelector('[data-msg]').textContent = 'Ce QR code n\'est pas un badge du job dating.';
      }
    } catch { /* image pas encore prête */ }
    setTimeout(boucle, 200);
  };
  boucle();
}
function arreterScan() {
  if (R.flux) { R.flux.getTracks().forEach(t => t.stop()); R.flux = null; }
  document.getElementById('scanner')?.remove();
}

/* ---------------- Profil anonyme ---------------- */
async function ouvrir(ref) {
  await act(async () => {
    const p = await GET('/jd/scan/' + encodeURIComponent(ref));
    arreterScan();
    history.pushState({ profil: p.id }, '', '/recruteur');
    afficherProfil(p);
  });
}
async function voir(id) {
  await act(async () => { const p = await GET('/jd/profils/' + id); history.pushState({ profil: p.id }, '', '/recruteur'); afficherProfil(p); });
}
const champ = (l, v, large) => v ? `<div class="champ${large ? ' large' : ''}"><span>${l}</span><div>${esc(v)}</div></div>` : '';
const puces = (l, v) => v ? `<div class="champ large"><span>${l}</span><div class="puces">${String(v).split(/\s*[,;\n]\s*/).filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div></div>` : '';

function afficherProfil(p) {
  R.courant = p; fermerFeuille(); window.scrollTo(0, 0);
  const [c, l] = STATUT(p);
  const etat = p.rdv_statut === 'planifie' ? `<div class="etat planifie"><b>${ic('cal')} Rendez-vous fixé${p.prenom ? ` avec ${esc(p.prenom)}` : ''}</b><span>${esc(fheure(p.rdv_le))}</span><span>${esc(p.rdv_lieu || '')}</span>${p.rdv_note ? `<span>${esc(p.rdv_note)}</span>` : ''}</div>`
    : p.rdv_statut === 'annule' ? `<div class="etat annule"><b>Rendez-vous annulé par l'organisme</b>${p.rdv_note ? `<span>${esc(p.rdv_note)}</span>` : ''}</div>`
      : p.decision === 'rdv' ? `<div class="etat rdv"><b>Demande de rendez-vous envoyée</b><span class="petit">L'organisme va vous recontacter pour fixer la date.${p.disponibilites ? ` Vos disponibilités : ${esc(p.disponibilites)}.` : ''}</span></div>`
        : p.decision === 'abandon' ? '<div class="etat abandon"><b>Profil écarté</b><span class="petit">Le candidat n\'en est pas informé.</span></div>' : '';
  $('#main').innerHTML = `<button class="btn lien retour" data-a="accueil">${ic('gauche')}Tous les profils</button>
    <section class="carte"><div class="profil-tete"><span class="num">${p.numero}</span><div style="min-width:0"><h1>Candidat·e n° ${p.numero}</h1>
      <span class="pastille p-${c}" style="margin-top:6px">${l}</span></div></div>
      <p class="anonyme">${ic('masque')}Profil anonyme : ni nom, ni photo, ni coordonnées.</p></section>
    ${etat}
    <section class="carte"><h2>Formation en alternance</h2><div class="champs">${champ('Diplôme préparé', p.formation, true)}${champ('Niveau', p.niveau)}${champ('Contrat', p.contrat)}
      ${champ('École / CFA', p.ecole, true)}${champ('Rythme', p.rythme, true)}${champ('Disponible à partir de', fmois(p.debut))}${champ('Durée', p.duree)}</div></section>
    <section class="carte"><h2>Poste recherché</h2><div class="champs">${puces('Postes', p.postes)}${champ('Secteur', p.secteur)}${champ('Mobilité', p.mobilite, true)}</div></section>
    ${p.competences || p.langues || p.qualites ? `<section class="carte"><h2>Compétences et savoir-être</h2><div class="champs">${puces('Compétences', p.competences)}${puces('Qualités', p.qualites)}${champ('Langues', p.langues, true)}</div></section>` : ''}
    ${p.experiences ? `<section class="carte"><h2>Expériences</h2><div class="champs">${champ('', p.experiences, true)}</div></section>` : ''}
    ${p.projet ? `<section class="carte"><h2>Projet et motivation</h2><div class="champs">${champ('', p.projet, true)}</div></section>` : ''}
    ${p.cv ? `<a class="btn plein" href="/api/jd/profils/${p.id}/cv" target="_blank" rel="noopener">${ic('file')}Voir le CV anonymisé</a>` : '<p class="doux petit" style="text-align:center">Pas de CV joint : le profil ci-dessus le résume.</p>'}
    <div class="actions">${boutonsDecision(p)}</div>`;
  document.body.classList.add('avec-actions');
}
function boutonsDecision(p) {
  if (p.rdv_statut === 'planifie') return `<button class="btn plein" data-a="accueil">${ic('gauche')}Retour aux profils</button>`;
  if (p.decision === 'rdv' && p.rdv_statut === 'demande') return `<button class="btn" data-a="decision" data-d="abandon">${ic('x')}Retirer</button><button class="btn" data-a="rdv">${ic('send')}Modifier ma demande</button>`;
  if (p.decision === 'abandon' || p.rdv_statut === 'annule') return `<button class="btn" data-a="decision" data-d="annuler">${ic('retour')}Revenir sur ma décision</button><button class="btn vert" data-a="rdv">${ic('cal')}Demander un rendez-vous</button>`;
  return `<button class="btn" data-a="abandon">${ic('x')}Pas pour nous</button><button class="btn vert" data-a="rdv">${ic('cal')}Demander un rendez-vous</button>`;
}

/* ---------------- Feuilles de confirmation ---------------- */
function feuille(html) { $('#feuille').innerHTML = `<div class="fond-feuille" data-a="fondfeuille"><div class="feuille" role="dialog" aria-modal="true">${html}</div></div>`; const f = $('#feuille input, #feuille textarea'); if (f) f.focus(); }
function fermerFeuille() { $('#feuille').innerHTML = ''; }
function feuilleRdv() {
  const p = R.courant;
  feuille(`<h1>Demander un rendez-vous</h1><p class="doux petit">Candidat·e n° ${p.numero} · ${esc(p.formation)}. L'organisme reçoit votre demande et fixe le rendez-vous avec l'alternant.</p>
    <form data-f="rdv" style="display:flex;flex-direction:column;gap:14px">
    <label class="f">Vos disponibilités (facultatif)<input type="text" name="disponibilites" maxlength="300" value="${esc(p.disponibilites)}" placeholder="Ex. : mardi ou jeudi après-midi"></label>
    <label class="f">Message pour l'organisme (facultatif)<textarea name="message" maxlength="1000" placeholder="Poste proposé, ce qui vous a plu, date de démarrage…">${esc(p.message)}</textarea></label>
    <div class="boutons"><button class="btn" type="button" data-a="fermerfeuille">Annuler</button><button class="btn vert" type="submit">${ic('send')}Envoyer la demande</button></div></form>`);
}
function feuilleAbandon() {
  feuille(`<h1>Écarter ce profil ?</h1><p>Le candidat n° ${R.courant.numero} <b>ne sera pas informé</b> de votre choix. Vous pourrez revenir sur votre décision.</p>
    <div class="boutons"><button class="btn" data-a="fermerfeuille">Annuler</button><button class="btn nuit" data-a="decision" data-d="abandon">Écarter</button></div>`);
}
async function decider(decision, extra = {}) {
  const p = R.courant;
  const r = await POST(`/jd/profils/${p.id}/decision`, { decision, ...extra });
  fermerFeuille();
  toast(decision === 'rdv' ? 'Demande envoyée à l\'organisme' : decision === 'abandon' ? 'Profil écarté' : 'Décision annulée');
  afficherProfil(r);
}

/* ---------------- Événements ---------------- */
const A = {
  scanner: () => scanner(),
  fermerscan: () => arreterScan(),
  accueil: () => accueil(),
  filtre: el => { R.filtre = el.dataset.v; accueil(); },
  profil: el => voir(el.dataset.id),
  rdv: () => feuilleRdv(),
  abandon: () => feuilleAbandon(),
  decision: el => act(() => decider(el.dataset.d === 'annuler' ? null : el.dataset.d), el),
  fermerfeuille: () => fermerFeuille(),
  fondfeuille: (el, e) => { if (e.target === el) fermerFeuille(); },
  deconnexion: el => act(async () => { await POST('/jd/deconnexion'); R.moi = null; R.profils = []; ecranConnexion(); }, el),
};
const F = {
  connexion: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    try { R.moi = await POST('/jd/connexion', { code: fd.get('code') }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    demarrer();
  }, f.querySelector('button[type="submit"]')),
  numero: fd => { const n = String(fd.get('numero') || '').trim(); if (!n) return toast('Saisissez le numéro inscrit sur le badge.', true); ouvrir(n); },
  rdv: (fd, f) => act(() => decider('rdv', { message: fd.get('message'), disponibilites: fd.get('disponibilites') }), f.querySelector('button[type="submit"]')),
};
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && A[el.dataset.a]) A[el.dataset.a](el, e); });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-f]'); if (!f) return; e.preventDefault(); const fn = F[f.dataset.f]; if (fn) fn(new FormData(f), f); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#feuille').innerHTML) fermerFeuille(); else if (document.getElementById('scanner')) arreterScan(); } });
// Code d'accès : tiret ajouté automatiquement (ABCD-2345)
document.addEventListener('input', e => {
  if (e.target.name !== 'code') return;
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
});
// Bouton « retour » du téléphone : du profil vers la liste
addEventListener('popstate', () => { if (!R.moi) return; if (document.getElementById('scanner')) return arreterScan(); if (R.courant) accueil(); });
// Lien d'un badge ouvert alors que l'application est déjà affichée
addEventListener('hashchange', () => { if (R.moi && location.hash.startsWith('#p=')) { const t = decodeURIComponent(location.hash.slice(3)); history.replaceState(null, '', '/recruteur'); ouvrir(t); } });
// L'appareil photo est coupé quand l'application passe en arrière-plan.
document.addEventListener('visibilitychange', () => { if (document.hidden) arreterScan(); });

boot();
