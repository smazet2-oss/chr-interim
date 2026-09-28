'use strict';
/* CHR Intérim — interface (agence, employeur, intérimaire). Toutes les règles sont vérifiées par le serveur. */

/* ---------------- Outils ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => String(n || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const eur = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const num = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const fdate = (iso, style = 'court') => !iso ? '—' : new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR',
  style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' } : style === 'num' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const lundi = iso => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

const P = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6M16 12H8M13 16H8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.5 8 9.5 4.6-1 8-4.5 8-9.5V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};
const ic = (n, attrs = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${attrs}>${P[n] || ''}</svg>`;
const badge = (cls, txt) => `<span class="badge s-${cls}">${txt}</span>`;
const btn = (label, icon, attrs = '', cls = '') => `<button type="button" class="btn ${cls}" ${attrs}>${icon ? ic(icon) : ''}${label}</button>`;
const stars = n => { if (!n) return '<span class="muted small">Pas encore noté</span>'; const f = Math.round(n); return `<span class="stars" title="${num(n)} / 5">${'★'.repeat(f)}<span class="e">${'★'.repeat(5 - f)}</span></span>`; };
const kpi = (t, icon, v, d = '', cls = '') => `<div class="kpi"><div class="t">${t}${ic(icon)}</div><div class="v">${v}</div>${d ? `<div class="d ${cls}">${d}</div>` : ''}</div>`;
const ro = (t = 'Modifiable uniquement par l\'agence') => `<span class="ro">${ic('lock')}${t}</span>`;
const empty = t => `<div class="empty">${t}</div>`;
const CANAUX = { whatsapp: ['msg', 'WhatsApp'], sms: ['phone', 'SMS'], mail: ['mail', 'E-mail'] };
const SECTEURS = ['Restauration', 'Cuisine', 'Bar', 'Hôtellerie'];
/* Postes proposés dans les formulaires (saisie libre toujours possible). */
const POSTES = ['Serveur', 'Chef de rang', 'Maître d\'hôtel', 'Commis de salle', 'Barman', 'Commis de cuisine', 'Cuisinier', 'Chef de partie', 'Plongeur',
  'Extra petit-déjeuner', 'Réceptionniste', 'Veilleur de nuit', 'Femme de chambre', 'Valet de chambre', 'Gouvernante'];
/** Secteur habituel d'un poste, pour suggérer les profils correspondants. */
function secteurDuPoste(p) {
  const x = p.toLowerCase();
  if (/petit-d|gouvernante|chambre|r[ée]ception|veilleur|valet|lingerie/.test(x)) return 'Hôtellerie';
  if (/cuisin|commis de cuisine|chef de partie|plong|p[âa]tiss/.test(x)) return 'Cuisine';
  if (/barman|barmaid|bar\b|sommelier/.test(x)) return 'Bar';
  if (/serveu|rang|salle|ma[îi]tre d/.test(x)) return 'Restauration';
  return null;
}
const listePostes = () => `<datalist id="postes-liste">${POSTES.map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
const opt = (list, v) => list.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');

let toastT;
function toast(msg, err) {
  const t = $('#toast'); t.innerHTML = (err ? ic('alert', 'style="color:var(--danger-dot)"') : ic('check')) + esc(msg);
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 5000 : 3000);
}

/* ---------------- Afficher le mot de passe pendant la saisie ---------------- */
function oeilMotDePasse(racine) {
  racine.querySelectorAll?.('input[type="password"]:not([data-oeil])').forEach(i => {
    i.dataset.oeil = '1';
    const w = document.createElement('span'); w.className = 'mdp'; i.replaceWith(w); w.append(i);
    w.insertAdjacentHTML('beforeend', `<button type="button" class="mdp-oeil" data-a="oeil" aria-label="Afficher le mot de passe" aria-pressed="false" title="Afficher le mot de passe">${ic('eye')}</button>`);
  });
}
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && oeilMotDePasse(n)))).observe(document.documentElement, { childList: true, subtree: true });

/* ---------------- API ---------------- */
async function api(method, url, body) {
  const form = body instanceof FormData;
  const res = await fetch('/api' + url, {
    method, credentials: 'same-origin',
    headers: form ? { 'X-CHR': '1' } : { 'Content-Type': 'application/json', 'X-CHR': '1' },
    body: form ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch { /* réponse vide */ }
  if (res.status === 401 && url !== '/login') { S.me = null; renderAuth(); throw new Error(data?.error || 'Connexion requise.'); }
  if (res.status === 403 && data?.error === 'must_change') { S.me.must_change = true; renderAuth(); throw new Error('Changez d\'abord votre mot de passe.'); }
  if (!res.ok) throw new Error(data?.error || 'Une erreur est survenue.');
  return data;
}
const GET = u => api('GET', u), POST = (u, b = {}) => api('POST', u, b), PUT = (u, b) => api('PUT', u, b), DEL = u => api('DELETE', u);

/* ---------------- État et navigation ---------------- */
const S = { me: null, cfg: null, view: null, p: {}, pwTemp: null, modal: null, busy: false };
const NAV = {
  // Agence : l'essentiel en premier, puis des listes déroulantes ['+', titre, icône, [entrées]] par domaine.
  agence: [['accueil', 'Tableau de bord', 'dash'], ['planning', 'Planning', 'cal'], ['missions', 'Missions', 'briefcase'], ['stats', 'Statistiques', 'chart'],
    ['+', 'Intérimaires', 'users', [['interimaires', 'Fiches intérimaires', 'users'], ['candidats', 'Candidatures intérimaires', 'idcard'], ['contrats', 'Contrats de mission', 'file'],
      ['heures', 'Relevés d\'heures', 'clock'], ['paie', 'Paie', 'wallet'], ['evaluations', 'Évaluations', 'star']]],
    ['+', 'Clients', 'building', [['clients', 'Fiches clients', 'building'], ['prospects', 'Candidatures clients', 'target']]],
    ['+', 'Facturation', 'receipt', [['facturation', 'Factures et débiteurs', 'receipt'], ['relances', 'Relances', 'send'], ['tarifs', 'Coefficients et contrats', 'file']]],
    ['-', 'Administration'], ['droits', 'Droits d\'accès', 'shield'], ['acces', 'Accès utilisateurs', 'lock'], ['journal', 'Journal des envois', 'list'], ['parametres', 'Paramètres', 'gear']],
  // Employeur et intérimaire : par ordre d'importance, l'administratif et le social en dernier. ['-', titre] = intertitre.
  client: [['-', 'Activité'], ['accueil', 'Tableau de bord', 'dash'], ['demandes', 'Mes missions', 'briefcase'], ['jour', 'Planning', 'cal'], ['heures', 'Heures et évaluations', 'clock'],
    ['-', 'Suivi'], ['stats', 'Statistiques', 'chart'], ['interimaires', 'Intérimaires', 'users'],
    ['-', 'Administratif et social'], ['documents', 'Documents', 'folder'], ['contrats', 'Contrats de mission', 'edit'], ['factures', 'Factures', 'receipt'], ['contrat', 'Mon contrat', 'file']],
  interim: [['-', 'Activité'], ['accueil', 'Accueil', 'dash'], ['missions', 'Missions proposées', 'send'], ['dispo', 'Mon planning', 'cal'], ['heures', 'Mes heures', 'clock'],
    ['-', 'Suivi'], ['stats', 'Mes statistiques', 'chart'], ['profil', 'Profil et CV', 'idcard'], ['avis', 'Avis', 'star'],
    ['-', 'Administratif et social'], ['contrats', 'Contrats', 'file'], ['paie', 'Paie', 'wallet'], ['documents', 'Téléverser mes documents', 'upload']],
};
/** Menu à plat (listes déroulantes dépliées) et groupe d'une rubrique. */
/** Menu du compte connecté : sans les rubriques verrouillées (Droits d'accès réservé à l'administrateur). */
function navDe(prof) {
  const off = new Set(S.me?.vues_verrouillees || []); if (!S.me?.super_admin) off.add('droits');
  const L = NAV[prof].map(n => n[0] === '+' ? [n[0], n[1], n[2], n[3].filter(e => !off.has(e[0]))] : n)
    .filter(n => n[0] === '-' || (n[0] === '+' ? n[3].length : !off.has(n[0])));
  return L.filter((n, k) => n[0] !== '-' || (L[k + 1] && L[k + 1][0] !== '-'));
}
/** Une fonction est-elle accessible au compte connecté ? */
const peut = k => !(S.me?.verrous || []).includes(k);
const navPlat = prof => navDe(prof).flatMap(n => n[0] === '+' ? n[3] : [n]);
const groupeDe = (prof, v) => navDe(prof).find(n => n[0] === '+' && n[3].some(x => x[0] === v));
/** Listes déroulantes ouvertes : celle de la rubrique affichée, plus celles ouvertes par l'utilisateur (mémorisé sur cet appareil). */
let NAV_OUVERT = (() => { try { return new Set(JSON.parse(localStorage.getItem('chr-nav') || '[]')); } catch { return new Set(); } })();
const memoNav = () => { try { localStorage.setItem('chr-nav', JSON.stringify([...NAV_OUVERT])); } catch { /* stockage indisponible */ } };
const SPACE = { agence: 'Espace agence', client: 'Espace employeur', interim: 'Espace intérimaire' };
const BANNER = {
  agence: 'Profil agence : contrôle complet sur tous les espaces.',
  client: 'Vous pouvez modifier le planning, les heures et les notes de fin de service, et déposer vos documents. Le reste est géré par l\'agence.',
  interim: 'Vous pouvez modifier vos disponibilités, vos heures, vos notes de fin de service, déposer les documents de votre dossier, ajouter vos expériences et signer vos contrats. Le reste est géré par l\'agence.',
};

function go(view, params) {
  S.view = view; if (params) Object.assign(S.p, params);
  try { history.replaceState(null, '', '#' + view); } catch { /* ignoré */ }
  renderApp();
}

/** Mesure d'audience : une visite par page et par session, avec son origine (lien ?src=facebook, ?src=mail… ou site précédent).
 *  Les paramètres de suivi sont retirés de l'adresse affichée pour qu'un lien recopié ne fausse pas l'origine. */
const VISITES = {};
const SUIVI = ['src', 'utm_source', 'utm_medium', 'utm_campaign', 'fbclid'];
function suivreVisite(page) {
  const q = new URLSearchParams(location.search), src = q.get('src') || q.get('utm_source') || (q.has('fbclid') ? 'facebook' : '');
  if (SUIVI.some(k => q.has(k))) {
    SUIVI.forEach(k => q.delete(k));
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch { /* ignoré */ }
  }
  const cle = 'chr-visite-' + page;
  try { if (sessionStorage.getItem(cle) !== null) return; sessionStorage.setItem(cle, ''); } catch { /* stockage indisponible */ }
  if (VISITES[page] !== undefined) return;
  VISITES[page] = null;
  POST('/public/visite', { page, src, ref: document.referrer }).then(r => {
    VISITES[page] = r.jeton;
    if (r.jeton) try { sessionStorage.setItem(cle, r.jeton); } catch { /* ignoré */ }
  }).catch(() => {});
}
const jetonVisite = page => { try { return VISITES[page] || sessionStorage.getItem('chr-visite-' + page) || ''; } catch { return VISITES[page] || ''; } };

async function boot() {
  if (location.pathname === '/contact') { suivreVisite('contact'); return renderContact('etablissement'); }
  if (location.pathname === '/candidature') { suivreVisite('candidature'); return renderContact('candidat'); }
  try { S.me = await GET('/me'); } catch { S.me = null; }
  // Page de connexion : visite comptée si personne n'est connecté (les utilisateurs quotidiens ne faussent pas les chiffres).
  if (!S.me) suivreVisite('connexion');
  if (S.me && !S.me.must_change) S.cfg = await GET('/config').catch(() => null);
  renderAuth();
}

/* ---------------- Connexion ---------------- */
function renderAuth() {
  closeModal();
  const logged = S.me && !S.me.must_change;
  $('#app').hidden = !logged; $('#auth').hidden = logged;
  if (logged) {
    const v = location.hash.slice(1);
    S.view = navPlat(S.me.profil).some(n => n[0] === v) ? v : 'accueil';
    renderApp(); return;
  }
  const brand = '';
  if (!S.me) {
    $('#auth').innerHTML = `<div class="auth"><a class="auth-banner-lien" href="/" title="Accueil"><picture class="auth-banner"><source media="(max-width: 600px)" srcset="/img/bandeau-mobile.png" width="1080" height="600"><img class="auth-logo" src="/img/bandeau-horizontal.png" alt="CHR Intérim, spécialiste des métiers HCR" width="1200" height="267"></picture></a><div class="auth-card">${brand}
      <div><h1>Connexion</h1><p class="muted small" style="margin-top:4px">L'espace qui s'ouvre (agence, employeur ou intérimaire) dépend du profil attribué par l'agence.</p></div>
      <form data-f="login"><label class="f">Identifiant<input type="text" name="username" autocomplete="username" required autofocus></label>
      <label class="f">Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
      <div class="err" role="alert" hidden></div><button class="btn primary" type="submit">Se connecter</button>
      <p class="small muted">Mot de passe oublié ? Demandez à votre agence de le réinitialiser.</p></form></div>
      <a class="auth-contact" href="/contact">${ic('building')}<span><b>Vous êtes un hôtel, un café ou un restaurant ?</b> Besoin de renforts : parlez-nous de vos besoins</span>${ic('chev')}</a>
      <a class="auth-contact" href="/candidature">${ic('idcard')}<span><b>Vous cherchez des missions en hôtellerie-restauration ?</b> Rejoignez nos intérimaires : déposez votre candidature</span>${ic('chev')}</a></div>`;
    return;
  }
  $('#auth').innerHTML = `<div class="auth"><a class="auth-banner-lien" href="/" title="Accueil"><picture class="auth-banner"><source media="(max-width: 600px)" srcset="/img/bandeau-mobile.png" width="1080" height="600"><img class="auth-logo" src="/img/bandeau-horizontal.png" alt="CHR Intérim, spécialiste des métiers HCR" width="1200" height="267"></picture></a><div class="auth-card">${brand}
    <div><h1>Première connexion</h1><p class="muted small" style="margin-top:4px">Bienvenue ${esc(S.me.nom)}. Remplacez le mot de passe provisoire fourni par l'agence.</p></div>
    <form data-f="firstpw">${S.pwTemp ? '' : '<label class="f">Mot de passe provisoire<input type="password" name="actuel" autocomplete="current-password" required></label>'}
    <label class="f">Nouveau mot de passe<input type="password" name="nouveau" autocomplete="new-password" required data-rules></label>
    <label class="f">Confirmer le mot de passe<input type="password" name="confirm" autocomplete="new-password" required></label>
    <div class="rules" id="rules">${rulesHtml('')}</div><div class="err" role="alert" hidden></div>
    <button class="btn primary" type="submit">Enregistrer et accéder à mon espace</button>
    <button class="btn ghost" type="button" data-a="logout" style="justify-content:center">Se déconnecter</button></form></div></div>`;
}
const rulesHtml = v => [[v.length >= 8, '8 caractères minimum'], [/[A-Z]/.test(v), 'Une majuscule'], [/[0-9]/.test(v), 'Un chiffre']]
  .map(([ok, t]) => `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${t}</span>`).join('');

async function afterLogin() {
  if (S.me.must_change) { renderAuth(); return; }
  S.cfg = await GET('/config').catch(() => null);
  renderAuth();
  if (S.me.profil === 'interim') {
    const ms = await GET('/missions').catch(() => []);
    const pend = ms.filter(m => m.etat === 'a_repondre' || m.etat === 'complet');
    if (pend.length) openModal(notifModal(pend));
  }
}

/* ---------------- Coquille ---------------- */
/* Menu mobile : les rubriques s'ouvrent dans un tiroir sous le logo. */
function setMenu(open) {
  S.menu = open;
  $('#sidebar').classList.toggle('open', open);
  const b = $('#menu-btn'); if (!b) return;
  b.setAttribute('aria-expanded', open);
  b.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
}
/* Sur mobile, le logo défile avec la page et la barre « Menu » reste accrochée en haut. */
function ajusterBandeau() {
  const sb = $('#sidebar'), br = sb && sb.querySelector('.brand');
  if (!br) return;
  sb.style.top = matchMedia('(max-width: 900px)').matches ? -(br.offsetHeight + parseFloat(getComputedStyle(sb).paddingTop)) + 'px' : '';
}
addEventListener('resize', ajusterBandeau);
addEventListener('load', ajusterBandeau);
/* Sur petit écran, chaque tableau devient une pile de fiches : chaque cellule reçoit l'intitulé de sa colonne. */
function etiqueterTableaux(root) {
  root.querySelectorAll('table:not(.plan)').forEach(t => {
    const th = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
    t.classList.add('fiches');
    t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (th[i]) td.dataset.label = th[i]; }));
  });
}
async function renderApp() {
  const me = S.me, prof = me.profil;
  $('#space').textContent = SPACE[prof];
  const lien = ([k, l, i]) => `<button data-a="nav" data-v="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span><span class="count" data-count="${k}" hidden></span></button>`;
  const g0 = groupeDe(prof, S.view); if (g0) NAV_OUVERT.add(g0[1]);
  if (!navPlat(prof).some(n => n[0] === S.view)) S.view = 'accueil';
  $('#nav').innerHTML = navDe(prof).map((n, x) => {
    if (n[0] === '-') return `<div class="nav-sep" role="presentation">${n[1]}</div>`;
    if (n[0] !== '+') return lien(n);
    const ouvert = NAV_OUVERT.has(n[1]), actif = n[3].some(e => e[0] === S.view);
    return `<div class="nav-groupe${actif ? ' actif' : ''}"><button class="nav-titre" data-a="navgroupe" data-g="${esc(n[1])}" aria-expanded="${ouvert}" aria-controls="ng-${x}">${ic(n[2])}<span>${n[1]}</span><span class="count" data-count-groupe hidden></span><span class="nav-chev">${ic('chev')}</span></button>
      <div class="nav-sous" id="ng-${x}" role="group" aria-label="${esc(n[1])}"${ouvert ? '' : ' hidden'}>${n[3].map(lien).join('')}</div></div>`;
  }).join('');
  const sub = prof === 'client' ? me.client?.nom : prof === 'interim' ? me.interim?.poste : 'Agence';
  $('#me').innerHTML = `<div class="avatar">${initials(me.nom)}</div><div style="min-width:0"><b>${esc(me.nom)}</b><span>${esc(sub || '')} · ${esc(me.username)}</span></div><button class="logout" data-a="logout" title="Se déconnecter" aria-label="Se déconnecter">${ic('out')}</button>`;
  $('#banner').className = 'demo' + (prof === 'agence' ? '' : ' agency');
  $('#banner').innerHTML = ic(prof === 'agence' ? 'check' : 'lock') + BANNER[prof];
  document.querySelectorAll('.bell').forEach(b => { b.innerHTML = ic('bell'); });
  $('#mob-titre').textContent = navPlat(prof).find(n => n[0] === S.view)?.[1] || 'Menu';
  setMenu(false);
  ajusterBandeau();
  const main = $('#main');
  main.innerHTML = '<div class="loading">Chargement…</div>';
  const view = S.view;
  try {
    const html = await V[prof][view]();
    if (S.view === view) { main.innerHTML = html; etiqueterTableaux(main); const z = main.querySelector('form [data-sim]'); if (z) majSimulation(z.closest('form')); }
  } catch (e) { if (S.me) main.innerHTML = `<div class="panel">${empty('Impossible de charger cette page : ' + esc(e.message))}</div>`; }
  refreshCounts();
}
async function refreshCounts() {
  const prof = S.me?.profil; if (!prof) return;
  const set = (k, n) => {
    const el = document.querySelector(`[data-count="${k}"]`); if (!el) return;
    el.hidden = !n; el.textContent = n;
    // Total sur le titre de la liste déroulante
    const g = el.closest('.nav-groupe'); if (!g) return;
    const tot = [...g.querySelectorAll('[data-count]')].reduce((a, c) => a + (c.hidden ? 0 : Number(c.textContent) || 0), 0), t = g.querySelector('[data-count-groupe]');
    t.hidden = !tot; t.textContent = tot;
  };
  try {
    if (prof === 'agence') {
      const [ms, hs] = await Promise.all([GET('/missions'), GET('/heures')]);
      set('missions', ms.filter(m => m.statut === 'nouvelle' || (m.statut === 'diffusee' && m.envois.some(e => e.etat === 'accepte'))).length);
      set('heures', hs.filter(h => h.ouvert && !(h.valide_interim && h.valide_client)).length);
      const [cs, ps] = await Promise.all([GET('/candidats'), GET('/prospects')]);
      set('candidats', cs.filter(x => x.statut === 'nouveau').length);
      set('prospects', ps.filter(x => x.statut === 'nouveau').length);
    } else if (prof === 'client') {
      const [ms, hs] = await Promise.all([GET('/missions'), GET('/heures')]);
      set('demandes', ms.reduce((a, m) => a + (m.statut === 'diffusee' ? m.candidats.filter(c => c.etat === 'accepte').length : 0), 0));
      set('heures', hs.filter(h => h.ouvert && (!h.valide_client || !h.note_client)).length);
    } else {
      const [ms, hs, ks, ec, dos] = await Promise.all([GET('/missions'), GET('/heures'), GET('/contrats'), GET('/paie/en-cours'), GET(`/interimaires/${S.me.interim.id}/pieces`)]);
      set('missions', ms.filter(m => m.etat === 'a_repondre').length);
      set('heures', hs.filter(h => h.ouvert && (!h.valide_interim || !h.note_interim)).length);
      set('contrats', ks.filter(k => k.statut === 'a_signer').length);
      set('paie', ec.filter(p => p.bloquees.length).length);
      set('documents', dos.manquantes.length);
    }
    const n = await GET('/notifications');
    document.querySelectorAll('.bell').forEach(b => { b.innerHTML = ic('bell') + (n.length ? '<span class="dot"></span>' : ''); });
    $('#menu-btn .dot').hidden = ![...document.querySelectorAll('[data-count]')].some(c => !c.hidden);
  } catch { /* compteurs non essentiels */ }
}
const head = (t, p, right = '') => `<div class="head"><div><div class="crumbs">${SPACE[S.me.profil]}${ic('chev')}${groupeDe(S.me.profil, S.view) ? groupeDe(S.me.profil, S.view)[1] + ic('chev') : ''}${navPlat(S.me.profil).find(n => n[0] === S.view)?.[1] || ''}</div><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div>${right ? `<div class="actions">${right}</div>` : ''}</div>`;
const panel = (title, right, body, foot = '') => `<section class="panel">${title !== null ? `<div class="panel-h"><h2>${title}</h2>${right || ''}</div>` : ''}${body}${foot ? `<div class="panel-f">${foot}</div>` : ''}</section>`;
const tabs = (key, opts) => `<div class="tabs">${opts.map(([v, l]) => `<button class="tab" data-a="tab" data-k="${key}" data-v="${v}" aria-pressed="${S.p[key] === v}">${l}</button>`).join('')}</div>`;

/* ---------------- Fenêtres ---------------- */
function openModal(html) { $('#modal').innerHTML = `<div class="modal-bg" data-a="modalbg"><div class="modal panel" role="dialog" aria-modal="true">${html}</div></div>`; const f = $('#modal input, #modal select, #modal textarea'); if (f) f.focus(); }
function closeModal() { $('#modal').innerHTML = ''; S.modal = null; S.jour = null; }
const modalHead = (t, sub = '') => `<div class="panel-h"><div><h2>${t}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div></div>`;
const modalFoot = (primary, attrs = '') => `<div class="panel-f" style="justify-content:flex-end">${btn('Annuler', '', 'data-a="close"')}<button class="btn primary" ${attrs}>${primary}</button></div>`;

function credModal(c, titre) {
  const lib = { agence: 'Agence', client: 'Employeur', interim: 'Intérimaire' }[c.profil];
  openModal(`${modalHead(ic('lock') + titre, `${esc(c.nom)} · profil ${lib}`)}<div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="cred"><div class="line"><div><div class="small muted">Identifiant</div><code>${esc(c.username)}</code></div>${btn('Copier', 'file', `data-a="copy" data-t="${esc(c.username)}"`, 'sm')}</div>
    <div class="line"><div><div class="small muted">Mot de passe provisoire</div><code>${esc(c.password)}</code></div>${btn('Copier', 'file', `data-a="copy" data-t="${esc(c.password)}"`, 'sm')}</div></div>
    <p class="small">Notez-le maintenant : il ne sera plus affiché. Transmettez ces informations à l'utilisateur. Il devra choisir son propre mot de passe à la première connexion.</p>
    <div class="perm">${c.profil === 'agence' ? `<span class="y">${ic('check')}Contrôle complet</span>` : `<span class="y">${ic('check')}Planning</span><span class="y">${ic('check')}Heures</span><span class="y">${ic('check')}Notes de fin de service</span>${c.profil === 'client' ? `<span class="y">${ic('check')}Dépôt de documents</span>` : ''}<span class="n">${ic('lock')}Le reste en lecture seule</span>`}</div>
    ${c.id && c.profil !== 'agence' ? `<form data-f="envoiacc" data-id="${c.id}" data-pw="${esc(c.password)}" class="private" style="gap:8px"><span class="h">${ic('send')}Envoyer ces identifiants</span>
      <div class="statusline">${['mail', 'sms', 'whatsapp'].map(k => `<label class="check"><input type="checkbox" name="canal" value="${k}" ${k === 'mail' ? 'checked' : ''}>${CANAUX[k][1]}</label>`).join('')}</div>
      <span class="hint">Envoyés à l'adresse e-mail et au téléphone de la fiche. L'e-mail porte le logo de l'agence. Le mot de passe n'est jamais conservé en clair dans le journal.</span>
      <div class="row"><button class="btn sm" type="submit">${ic('send')}Envoyer</button><span class="small" data-resultat></span></div></form>` : ''}</div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Terminé', 'check', 'data-a="close"', 'primary')}</div>`);
}
function notifModal(list) {
  return `${modalHead(ic('bell') + (list.length > 1 ? 'Nouvelles missions en attente de validation' : 'Nouvelle mission en attente de validation'))}
    <div class="list">${list.map(m => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:min(100%,240px)"><b>${iconeCeSoir({ ...m, statut: '' }, true)}${esc(m.poste)} · ${esc(m.client_nom)}</b><div class="small muted">${fdate(m.date, 'long')} · ${m.debut}–${m.fin} · taux horaire brut ${eur(m.taux_horaire)}/h</div>${simBloc(m.simulation, 'interim', list.length === 1)}</div>${m.etat === 'complet' ? badge('off', 'Complet pour l\'instant') : badge('attente', 'À traiter')}</div>`).join('')}</div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Plus tard', '', 'data-a="close"')}${btn('Voir mes missions', 'chev', 'data-a="close" data-go="missions"', 'primary')}</div>`;
}

/* ---------------- Missions : affichage partagé ---------------- */
function missionStatut(m) {
  if (m.statut === 'nouvelle') return ['attente', 'À valider par l\'agence'];
  if (m.statut === 'annulee') return ['off', 'Annulée'];
  if (m.statut === 'verrouillee') return m.validee_le ? ['libre', 'Validée · contrats signés'] : ['attente', 'Pourvue · contrats en signature'];
  if (m.actifs >= m.nb_postes) return ['pris', `Complète · ${m.retenus}/${m.nb_postes} confirmé${m.nb_postes > 1 ? 's' : ''} par l'employeur`];
  return ['pris', `Diffusée · ${m.actifs}/${m.nb_postes} acceptation${m.nb_postes > 1 ? 's' : ''}`];
}
const REP = { desiste: ['danger', 'S\'est désisté(e)'], null: ['off', 'Envoyée, sans réponse'], accepte: ['attente', 'A accepté · attente employeur'], retenu: ['libre', 'Retenu'], refuse_client: ['danger', 'Refusé par l\'employeur'], decline: ['off', 'A décliné'], non_retenu: ['off', 'Non retenu'] };
const docLinks = docs => docs.map(d => d.id ? `<a class="link" href="/api/documents/${d.id}/fichier">${esc(d.nom)}</a>` : d.contrat_id ? `<a class="link" href="/api/contrats/${d.contrat_id}/document" target="_blank" rel="noopener">${esc(d.nom)}</a>` : esc(d.nom)).join(' · ');

function missionCard(m, mode) {
  const [sc, sl] = missionStatut(m), locked = m.statut === 'verrouillee';
  const rows = mode === 'agence' ? m.envois.map(e => ({ id: e.interim_id, nom: e.nom, poste: e.poste, etat: e.desistement ? 'desiste' : e.etat, canaux: e.canaux, contrat: e.contrat, desistement: e.desistement }))
    : m.candidats.map(c => ({ id: c.interim_id, nom: `${c.prenom} ${c.nom}`, poste: c.poste, etat: c.etat, note: c.note, comp: c.competences, contrat: c.contrat }));
  const nomM = esc(`${m.nb_postes} × ${m.poste} · ${fdate(m.date, 'long')} ${m.debut}–${m.fin}`), futur = m.date >= (S.cfg?.aujourdhui || '');
  const annulBtn = m.statut !== 'annulee' && (mode === 'agence' || (futur && peut('c_annuler'))) ? btn(mode === 'agence' ? 'Annuler' : 'Annuler la mission', 'ban', `data-a="annuler" data-id="${m.id}" data-n="${nomM}"`, 'sm ghost') : '';
  const actions = (mode === 'agence' && !locked && m.statut !== 'annulee'
    ? btn(m.statut === 'nouvelle' ? 'Valider et diffuser' : 'Envoyer à d\'autres', 'send', `data-a="diffuser" data-id="${m.id}"`, m.statut === 'nouvelle' ? 'sm primary' : 'sm') : '') + annulBtn;
  const body = m.statut === 'nouvelle' ? empty(mode === 'agence' ? 'Choisissez les intérimaires et le moyen d\'envoi pour diffuser cette mission.' : 'Votre demande est en cours de validation par l\'agence.')
    : rows.length ? `<div class="list">${rows.map(r => `<div class="li" style="flex-wrap:wrap"><div class="person"><div class="avatar">${initials(r.nom)}</div><div><b>${esc(r.nom)}</b><span>${esc(r.poste)}${r.canaux ? ' · envoyé par ' + r.canaux.map(c => CANAUX[c]?.[1] || 'l\'espace intérimaire').join(', ') : ''}${r.desistement ? ` · motif : ${esc(r.desistement.motif)}` : ''}${r.note !== undefined ? ' · ' + stars(r.note) : ''}</span></div></div>
      <div class="row">${badge(...REP[r.etat ?? 'null'])}${contratMini(r.contrat)}${r.etat === 'accepte' && !locked && (mode === 'agence' || peut('c_decision')) ? btn('Refuser', '', `data-a="decision" data-m="${m.id}" data-i="${r.id}" data-ok="0"`, 'sm') + btn('Accepter', 'check', `data-a="decision" data-m="${m.id}" data-i="${r.id}" data-ok="1"`, 'sm primary') : ''}</div></div>`).join('')}</div>`
      : empty(mode === 'agence' ? 'Aucun intérimaire contacté.' : 'Diffusée. En attente de réponses des intérimaires.');
  return `<section class="panel"><div class="panel-h"><div><h2>${iconeCeSoir(m, true)}${m.nb_postes} × ${esc(m.poste)}${mode === 'agence' ? ` <span class="muted" style="font-weight:400">· ${esc(m.client_nom)}</span>` : ''}</h2>
    <div class="small muted">${fdate(m.date, 'long')} · ${m.debut}–${m.fin} · taux horaire brut ${eur(m.taux_horaire)}/h</div></div><div class="row">${badge(sc, sl)}${actions}${locked ? ro('Mission verrouillée') : ''}</div></div>
    ${m.statut === 'annulee' ? `<div class="panel-b"><div class="extra" style="grid-template-columns:1fr;background:var(--off-bg);border-color:var(--line)"><div class="small"><b>${ic('ban', 'style="width:14px;height:14px;vertical-align:-2px"')} Annulée${m.annulee_par ? ` par ${m.annulee_par === 'client' ? 'l\'employeur' : 'l\'agence'}` : ''}${m.annulee_le ? ` le ${fdate(m.annulee_le.slice(0, 10), 'num')}` : ''}</b>${m.motif_annulation ? ` · ${esc(m.motif_annulation)}` : ''}</div></div></div>` : `<div class="panel-b sim-zone">${simBloc(m.simulation, mode)}</div>`}${body}${locked && m.documents?.length ? `<div class="panel-f"><span class="row">${ic('file')}Documents envoyés : ${docLinks(m.documents)}</span></div>` : ''}</section>`;
}
function missionInterim(m) {
  const E = {
    confirmee: badge('libre', 'Mission confirmée'),
    signature: m.contrat?.interim_signe ? badge('attente', 'Contrat signé · attente de l\'employeur') : btn('Signer mon contrat', 'edit', `data-a="signer" data-id="${m.contrat?.id}" data-n="${esc(m.contrat?.numero || '')}"`, 'sm primary'), non_retenu: badge('off', 'Non retenu · mission pourvue'), pourvue: badge('off', 'Mission pourvue'),
    decline: badge('off', 'Vous avez décliné'), annulee: badge('off', 'Mission annulée'), desiste: badge('off', 'Vous vous êtes désisté(e)'),
    en_attente: `<button class="btn sm" disabled>${ic('clock')}En attente de confirmation</button>`,
    complet: `<button class="btn sm" disabled>${ic('lock')}Complet</button>`,
    a_repondre: peut('i_accepter') ? btn('Refuser', '', `data-a="repondre" data-id="${m.id}" data-ok="0"`, 'sm') + btn('Accepter la mission', 'check', `data-a="repondre" data-id="${m.id}" data-ok="1"`, 'sm primary') : badge('pris', 'Proposée'),
  };
  return `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="min-width:220px;flex:1"><b>${iconeCeSoir({ ...m, statut: '' }, true)}${esc(m.poste)} · ${esc(m.client_nom)}</b>
    <div class="small muted">${fdate(m.date, 'long')} · ${m.debut}–${m.fin} · taux horaire brut ${eur(m.taux_horaire)}/h · ${m.nb_postes} poste${m.nb_postes > 1 ? 's' : ''}</div>
    ${m.etat === 'complet' ? '<div class="hint" style="margin-top:4px">Toutes les places sont prises. Le bouton se réactive si une place se libère.</div>' : ''}
    ${m.etat === 'signature' ? `<div class="hint" style="margin-top:4px">Vous êtes retenu(e). La mission sera confirmée quand vous et l'employeur aurez signé le contrat.</div>` : ''}
    ${['a_repondre', 'en_attente', 'confirmee', 'complet', 'signature'].includes(m.etat) ? simBloc(m.simulation, 'interim') : ''}
    ${['confirmee', 'signature'].includes(m.etat) && m.documents.length ? `<div class="small" style="margin-top:6px">${ic('file', 'style="vertical-align:-3px;color:var(--ink-3)"')} Documents : ${docLinks(m.documents)}</div>` : ''}</div>
    ${m.etat === 'annulee' && m.motif_annulation ? `<div class="small" style="margin-top:4px">Motif de l'annulation : ${esc(m.motif_annulation)}</div>` : ''}
    ${m.etat === 'desiste' && m.motif_desistement ? `<div class="small muted" style="margin-top:4px">Motif : ${esc(m.motif_desistement)}</div>` : ''}</div>
    <div class="row">${E[m.etat] || ''}${['en_attente', 'signature', 'confirmee'].includes(m.etat) && m.date >= (S.cfg?.aujourdhui || '') && peut('i_desister') ? btn('Me désister', 'ban', `data-a="desister" data-id="${m.id}" data-n="${esc(`${m.poste} · ${m.client_nom} · ${fdate(m.date, 'long')} ${m.debut}–${m.fin}`)}"`, 'sm ghost') : ''}</div></div>`;
}


/* ---------------- Simulation : paie (intérimaire), coût (employeur, agence) ---------------- */
const hh = h => num(h) + ' h';
const simLignes = L => `<dl class="sim-dl">${L.filter(Boolean).map(([k, v, cls]) => `<dt class="${cls || ''}">${k}</dt><dd class="${cls || ''}">${v}</dd>`).join('')}</dl>`;
function simDetail(s, profil) {
  if (!s) return '';
  if (profil === 'interim') return simLignes([
    [`Salaire de base (${hh(s.heures)} × taux horaire brut ${eur(s.taux_horaire)}/h)`, eur(s.base ?? s.brut)],
    ...(s.majorations || []).map(l => [`${l.libelle} : ${hh(l.heures)} majorées de ${num(l.pc)} %`, '+ ' + eur(l.montant)]),
    [`Indemnité de fin de mission`, s.ifm_due ? '+ ' + eur(s.ifm) : 'non due (emploi d\'usage ou saisonnier)'],
    ['Indemnité de congés payés', '+ ' + eur(s.iccp)],
    ['Total brut', eur(s.total_brut), 'tot'],
    ['Net estimé avant impôt', '≈ ' + eur(s.net), 'net'],
  ]);
  const maj = s.majorations || [];
  const client = [
    [`${hh(s.heures)} × ${s.nb_postes} pers. × ${eur(s.taux_facture)}/h facturé HT (taux horaire brut × coefficient${profil === 'agence' ? ' ' + num(s.coefficient) : ''})`, eur(s.heures * s.nb_postes * s.taux_facture) + (maj.length ? '' : ' HT')],
    ...maj.map(l => [`${l.libelle} : ${hh(l.heures)} × ${s.nb_postes} pers. majorées de ${num(l.pc)} %`, '+ ' + eur(l.heures * s.nb_postes * s.taux_facture * l.pc / 100)]),
    ...(maj.length ? [['Total HT', eur(s.ht) + ' HT']] : []),
    ['TVA', eur(s.tva)],
    [profil === 'agence' ? 'Facturé au client' : 'Coût total estimé', eur(s.ttc) + ' TTC', 'tot'],
  ];
  if (profil === 'client') return simLignes(client);
  return simLignes([...client,
    [`Paie des intérimaires (${eur(s.total_brut)} brut/pers., congés et fin de mission compris)`, eur(s.total_brut * s.nb_postes)],
    ['Charges patronales estimées', eur(s.charges)],
    ['Coût agence', eur(s.cout_agence)],
    ['Marge estimée', `${eur(s.marge)} HT · ${num(s.marge_pc)} %`, s.marge < 0 ? 'neg tot' : 'net tot'],
  ]);
}
const simResume = (s, profil) => !s ? '' : profil === 'interim' ? `≈ ${eur(s.total_brut)} brut · ≈ ${eur(s.net)} net`
  : profil === 'client' ? `≈ ${eur(s.ht)} HT · ${eur(s.ttc)} TTC` : `${eur(s.ht)} HT facturé · marge ≈ ${eur(s.marge)}`;
const simTitre = profil => profil === 'interim' ? 'Simulation de ma paie' : profil === 'client' ? 'Coût estimé de la mission' : 'Simulation coût et marge';
/** Bloc repliable : le résumé est toujours visible, le détail au clic. */
function simBloc(s, profil, ouvert) {
  if (!s) return '';
  return `<details class="sim"${ouvert ? ' open' : ''}><summary>${ic('receipt')}<span><b>${simTitre(profil)}</b> · ${simResume(s, profil)}</span></summary>${simDetail(s, profil)}
    <p class="hint">Estimation indicative${profil === 'interim' ? ' pour les horaires prévus, hors heures supplémentaires, primes et avantages repas. Le montant exact figure sur votre fiche de paie.' : ' pour les horaires prévus, hors heures supplémentaires. Le montant exact figure sur la facture.'}</p></details>`;
}
/** Simulation mise à jour pendant la saisie d'un formulaire (agence et employeur). */
const simLive = base => `<div class="sim-live full" data-sim="${esc(JSON.stringify(base || {}))}"><div class="sim-vide small muted">${ic('receipt')}Renseignez les horaires pour voir le coût estimé.</div></div>`;
let simTimer = 0;
function majSimulation(form) {
  const zone = form.querySelector('[data-sim]'); if (!zone) return;
  clearTimeout(simTimer);
  simTimer = setTimeout(async () => {
    const b = { ...JSON.parse(zone.dataset.sim || '{}'), ...Object.fromEntries([...new FormData(form)].filter(([k]) => ['client_id', 'date', 'poste', 'debut', 'fin', 'nb_postes', 'taux_horaire', 'motif'].includes(k))) };
    try { const s = await POST('/simulation', b); zone.innerHTML = simBloc(s, S.me.profil, true); }
    catch { zone.innerHTML = `<div class="sim-vide small muted">${ic('receipt')}Simulation indisponible : vérifiez les horaires.</div>`; }
  }, 250);
}

/* ---------------- Dossier de l'intérimaire (partagé agence / intérimaire) ---------------- */
const moisAn = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
function periode(x) {
  if (x.source === 'mission' || x.debut === x.fin) return fdate(x.debut, 'num');
  return `${moisAn(x.debut)} – ${x.fin ? moisAn(x.fin) : 'aujourd\'hui'}`;
}
function experiencesPanel(iid, L) {
  const agence = S.me.profil === 'agence';
  return panel('Expériences', btn('Ajouter', 'plus', `data-a="xpadd" data-id="${iid}"`, 'sm primary'),
    L.length ? `<div class="list">${L.map(x => `<div class="li" style="align-items:flex-start"><div><div class="small muted">${periode(x)}${x.source === 'mission' ? ' · ajoutée automatiquement' : ''}</div><b>${esc(x.poste)}</b> · ${esc(x.employeur)}${x.description ? `<div class="small">${esc(x.description)}</div>` : ''}</div>
      <div class="row">${x.source === 'mission' ? badge('libre', 'Mission CHR Intérim') : ''}${agence || x.source !== 'mission' ? btn('', 'trash', `data-a="xpdel" data-id="${x.id}" aria-label="Retirer cette ligne"`, 'sm ghost') : ''}</div></div>`).join('')}</div>`
      : empty('Aucune expérience. Ajoutez les postes occupés avant l\'agence ; chaque mission validée s\'ajoutera ensuite toute seule.'));
}
async function piecesTypes() { if (!S.types) S.types = await GET('/pieces/types'); return S.types; }
function piecesPanel(iid, d, types) {
  const agence = S.me.profil === 'agence';
  const ST = { a_verifier: ['attente', 'À vérifier par l\'agence'], valide: ['libre', 'Validé'], refuse: ['danger', 'Refusé'] };
  const rows = types.pieces.map(p => {
    const req = d.requises.includes(p.type), manq = d.manquantes.includes(p.type);
    const files = d.pieces.filter(x => x.type === p.type);
    const niveau = req ? badge(manq ? 'danger' : 'libre', manq ? (p.obligatoire ? 'Obligatoire · manquant' : 'Exigé dans votre cas · manquant') : 'Fourni et validé')
      : p.condition ? badge('off', 'Selon la situation') : badge('off', 'Facultatif');
    return `<div class="li" style="align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:220px"><b>${esc(p.label)}</b><div class="small muted">${esc(p.detail)}</div>
      ${files.map(f => `<div class="row small" style="margin-top:6px">${ic('file', 'style="color:var(--ink-3)"')}<a class="link" href="/api/pieces/${f.id}/fichier">${esc(f.nom)}</a>${badge(...ST[f.statut])}${f.expire_le ? `<span class="muted">expire le ${fdate(f.expire_le, 'num')}</span>` : ''}${f.commentaire ? `<span class="err-inline">${esc(f.commentaire)}</span>` : ''}
        ${agence && f.statut !== 'valide' ? btn('Valider', 'check', `data-a="pstat" data-id="${f.id}" data-s="valide"`, 'sm primary') : ''}${agence && f.statut !== 'refuse' ? btn('Refuser', '', `data-a="prefus" data-id="${f.id}"`, 'sm') : ''}
        ${agence || f.statut !== 'valide' ? btn('', 'trash', `data-a="pdel" data-id="${f.id}" aria-label="Retirer ce document"`, 'sm ghost') : ''}</div>`).join('')}</div>
      <div class="row">${niveau}${btn('Téléverser', 'upload', `data-a="pup" data-iid="${iid}" data-type="${p.type}" data-exp="${p.expiration ? 1 : 0}" data-label="${esc(p.label)}"`, 'sm')}</div></div>`;
  }).join('');
  return panel('Dossier administratif', d.complet ? badge('libre', 'Dossier complet') : badge('attente', `${d.manquantes.length} pièce${d.manquantes.length > 1 ? 's' : ''} manquante${d.manquantes.length > 1 ? 's' : ''}`), `<div class="list">${rows}</div>`,
    'Formats acceptés : PDF ou photo (JPG, PNG, HEIC), 10 Mo maximum. Les documents sont visibles uniquement par vous et l\'agence.');
}
/* ----- Contrats de mission : signature de l'intérimaire et de l'employeur ----- */
const sigEtat = (ok, qui) => `<span class="sig-etat ${ok ? 'ok' : ''}">${ic(ok ? 'check' : 'clock')}${qui}</span>`;
/** Bouton de signature selon le lecteur, bouton de relance pour l'agence. */
function actionsContrat(k) {
  if (k.statut !== 'a_signer') return '';
  const p = S.me.profil, signe = p === 'interim' ? (k.signe_le || k.interim_signe) : (k.client_signe_le || k.client_signe);
  if (p === 'agence') return btn('Relancer', 'send', `data-a="krelance" data-id="${k.id}"`, 'sm');
  return signe || !peut(p === 'interim' ? 'i_contrats' : 'c_contrats') ? '' : btn(p === 'interim' ? 'Signer mon contrat' : 'Signer le contrat', 'edit', `data-a="signer" data-id="${k.id}" data-n="${esc(k.numero)}"`, 'sm primary');
}
function contratsPanel(ks) {
  const p = S.me.profil;
  const ST = { a_signer: ['attente', 'En cours de signature'], signe: ['libre', 'Signé par les deux parties'], annule: ['off', 'Annulé'] };
  return ks.length ? `<div class="list">${ks.map(k => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:230px"><b>${esc(k.poste)} · ${p === 'interim' ? esc(k.client_nom) : `${esc(k.prenom)} ${esc(k.interim_nom)}${p === 'agence' ? ' · ' + esc(k.client_nom) : ''}`}</b>
      <div class="small muted"><span class="mono">${esc(k.numero)}</span> · ${fdate(k.date, 'long')} · ${k.debut}–${k.fin}</div>
      ${k.statut !== 'annule' ? `<div class="sig-ligne">${sigEtat(k.signe_le, 'Intérimaire' + (k.signe_le ? ' · ' + fdate(k.signe_le, 'num') : ''))}${sigEtat(k.client_signe_le, 'Employeur' + (k.client_signe_le ? ' · ' + fdate(k.client_signe_le, 'num') : ''))}${p === 'agence' && k.nb_relances ? `<span class="small muted">${k.nb_relances} relance${k.nb_relances > 1 ? 's' : ''}</span>` : ''}</div>` : ''}</div>
    <div class="row">${badge(...ST[k.statut])}<a class="btn sm" href="/api/contrats/${k.id}/document" target="_blank" rel="noopener">${ic('file')}${k.statut === 'signe' ? 'Contrat signé' : 'Lire'}</a>${actionsContrat(k)}</div></div>`).join('')}</div>`
    : empty('Aucun contrat pour le moment. Un contrat est créé dès que les places d\'une mission sont pourvues.');
}
/** Petit état de contrat dans les listes de candidats retenus. */
function contratMini(k) {
  if (!k) return '';
  if (k.statut === 'signe') return badge('libre', 'Contrat signé');
  return `<span class="sig-ligne">${sigEtat(k.interim_signe, 'Intérimaire')}${sigEtat(k.client_signe, 'Employeur')}</span>${actionsContrat(k)}`;
}
const BULL_ST = b => b.statut === 'paye' ? badge('libre', 'Payé le ' + fdate(b.paye_le, 'num')) : badge('attente', 'En attente de paiement');
const alerteHeures = bl => bl.length ? `<div class="extra" style="grid-template-columns:1fr;background:var(--danger-bg);border-color:var(--danger-dot);color:var(--danger-fg)"><div class="row small"><b>${ic('alert')}${bl.length} relevé${bl.length > 1 ? 's' : ''} d'heures non validé${bl.length > 1 ? 's' : ''} : paiement bloqué</b></div>
  ${bl.map(x => `<div class="small">${fdate(x.date)} · ${esc(x.client_nom)} · il manque : ${esc(x.manque)}</div>`).join('')}</div>` : '';

function gestionProfil(type, r) {
  const nom = type === 'clients' ? r.nom : `${r.prenom} ${r.nom}`;
  return (r.suspendu ? btn('Réactiver', 'check', `data-a="reactiver" data-t="${type}" data-id="${r.id}"`, 'sm primary') : btn('Suspendre', 'lock', `data-a="suspendre" data-t="${type}" data-id="${r.id}" data-n="${esc(nom)}"`, 'sm'))
    + (peut('a_suppression') ? btn('Supprimer', 'trash', `data-a="supprimer" data-t="${type}" data-id="${r.id}" data-n="${esc(nom)}"`, 'sm danger') : '');
}
const suspenduInfo = r => r.suspendu ? `<div class="extra" style="grid-template-columns:1fr;background:var(--off-bg);border-color:var(--line-strong);color:var(--ink-2)"><div class="small"><b>${ic('lock', 'style="vertical-align:-3px"')} Profil suspendu depuis le ${fdate(r.suspendu_le, 'num')}</b>${r.motif_suspension ? ` · ${esc(r.motif_suspension)}` : ''}<br>Connexion impossible${r.prenom ? ', aucune mission proposée' : ', aucune nouvelle mission'} tant que le profil n'est pas réactivé.</div></div>` : '';

/* ---------------- Calendrier standard (mois, semaines en lignes, missions dans les cases) ---------------- */
const HEURE_SOIR = '16:00';
/** Mission du soir même : aujourd'hui, à partir de 16 h, non annulée. Importance haute. */
const estCeSoir = m => m.date === S.cfg?.aujourdhui && m.debut >= HEURE_SOIR && m.statut !== 'annulee';
const iconeCeSoir = (m, avecTexte) => estCeSoir(m) ? `<span class="urgent" title="Importance haute : mission ce soir">${ic('alert')}${avecTexte ? 'Ce soir' : ''}</span>` : '';
function semaineIso(iso) {
  const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const j1 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - j1) / 864e5 - 3 + ((j1.getDay() + 6) % 7)) / 7);
}
/**
 * Calendrier du mois. jour(iso) renvoie { cls, evenements:[{texte, cls, urgent}], action:'jour'|'dispo', attrs }.
 * La semaine en cours est précédée d'une flèche.
 */
function calendrierStandard(mois, jour) {
  const [y, m] = mois.split('-').map(Number), t = S.cfg?.aujourdhui || '';
  const premier = new Date(y, m - 1, 1, 12), debut = new Date(premier); debut.setDate(1 - ((premier.getDay() + 6) % 7));
  const fin = new Date(y, m, 0, 12), lundiCourant = lundi(t);
  let h = `<div class="calstd" role="grid"><div class="cs-tete"><span class="cs-sem">Sem.</span>${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(x => `<span>${x}</span>`).join('')}</div>`;
  for (const d = new Date(debut); d <= fin || d.getDay() !== 1; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() === 1) {
      const courante = iso === lundiCourant;
      h += `<div class="cs-ligne ${courante ? 'courante' : ''}" role="row"><span class="cs-sem" title="Semaine ${semaineIso(iso)}${courante ? ' (en cours)' : ''}">${courante ? '<b class="fleche" aria-label="Semaine en cours">▶</b>' : ''}${semaineIso(iso)}</span>`;
    }
    const hors = iso.slice(0, 7) !== mois, c = jour(iso) || {}, ev = c.evenements || [];
    const urgent = ev.some(e => e.urgent);
    h += `<div class="cs-jour ${c.cls || ''} ${hors ? 'hors' : ''} ${iso === t ? 'aujourdhui' : ''} ${iso < t ? 'passe' : ''}" role="button" tabindex="0" data-a="${c.action || 'jour'}" data-d="${iso}" ${c.attrs || ''}
      aria-label="${fdate(iso, 'long')}${ev.length ? ', ' + ev.length + ' mission' + (ev.length > 1 ? 's' : '') : ''}${urgent ? ', importance haute' : ''}">
      <span class="cs-num">${Number(iso.slice(8))}${urgent ? `<span class="urgent">${ic('alert')}</span>` : ''}</span>
      ${c.etiquette ? `<span class="cs-etiq">${esc(c.etiquette)}</span>` : ''}
      ${ev.slice(0, 3).map(e => `<span class="ev s-${e.cls}${e.urgent ? ' ev-urgent' : ''}">${e.urgent ? ic('alert') : ''}<span>${esc(e.texte)}</span></span>`).join('')}${ev.length > 3 ? `<span class="ev-plus">+${ev.length - 3}</span>` : ''}</div>`;
    if (d.getDay() === 0) h += '</div>';
  }
  return h + '</div>';
}
const legendeCal = (...items) => `<div class="legend">${items.join('')}<span class="badge s-danger urgent-leg">${ic('alert')}Ce soir : importance haute</span><span class="small muted">▶ semaine en cours</span></div>`;
function couleurMission(e) {
  if (e.statut === 'nouvelle') return 'danger';
  if (e.statut === 'verrouillee') return 'libre';
  return e.en_attente ? 'attente' : 'pris';
}

/* ---------------- Calendrier du mois et détail d'une journée ---------------- */
const moisDe = (iso, delta = 0) => { const d = new Date(iso.slice(0, 7) + '-01T12:00'); d.setMonth(d.getMonth() + delta); return d.toISOString().slice(0, 7); };
/** Grille d'un mois ; cellule(iso, jour) renvoie { cls, lignes[], clic } */
function grilleMois(mois, cellule) {
  const [y, m] = mois.split('-').map(Number), nb = new Date(y, m, 0).getDate(), pad = (new Date(y, m - 1, 1).getDay() + 6) % 7, t = S.cfg?.aujourdhui;
  let h = `<div class="cal">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(x => `<div class="dow">${x}</div>`).join('')}${'<div class="day blank"></div>'.repeat(pad)}`;
  for (let k = 1; k <= nb; k++) {
    const iso = `${mois}-${String(k).padStart(2, '0')}`, c = cellule(iso, k);
    const inner = `<span class="d">${k}</span>${c.lignes.map(l => `<span class="lbl l-long">${esc(l)}</span>`).join('')}${c.court ? `<span class="lbl l-court">${esc(c.court)}</span>` : ''}`;
    h += `<button type="button" class="day ${c.cls || ''} ${iso === t ? 'today' : ''} ${iso < t ? 'passe' : ''}" data-a="jour" data-d="${iso}" aria-label="${fdate(iso, 'long')}${c.lignes.length ? ' : ' + esc(c.lignes.join(', ')) : ''}">${inner}</button>`;
  }
  return h + '</div>';
}
const navMois = (cle, mois) => `<div class="row">${btn('', 'left', `data-a="navmois" data-k="${cle}" data-d="-1" aria-label="Mois précédent"`, 'sm')}<b style="min-width:130px;text-align:center;text-transform:capitalize">${new Date(mois + '-01T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>${btn('', 'chev', `data-a="navmois" data-k="${cle}" data-d="1" aria-label="Mois suivant"`, 'sm')}</div>`;

const ETAT_CONTRAT = { a_signer: ['attente', 'Contrat à signer'], signe: ['libre', 'Contrat signé'], annule: ['off', 'Contrat annulé'] };
function etatHeures(h, date) {
  if (!h) return '';
  if (date > (S.cfg?.aujourdhui || '')) return badge('off', `${num(h.heures_prevues)} h prévues`);
  const moi = S.me.profil;
  if (!h.valide_interim) return badge('attente', moi === 'interim' ? 'Heures à confirmer' : 'Heures à confirmer par l\'intérimaire');
  if (h.extra_statut === 'attente') return badge('attente', moi === 'client' ? 'Heures en plus à accepter' : 'Heures en plus en attente de l\'employeur');
  if (!h.valide_client) return badge('attente', moi === 'client' ? 'Heures à valider' : 'Heures à valider par l\'employeur');
  return badge('libre', `Heures validées (${num(h.heures_prevues + (h.extra_statut === 'accepte' ? h.extra : 0))} h)`);
}
const suiviIntervenant = (x, date) => [x.contrat ? badge(...ETAT_CONTRAT[x.contrat]) : '', etatHeures(x.heures, date)].join('');
const ligne = (x, droite = '', extra = '') => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div class="person"><div class="avatar">${initials(x.prenom + ' ' + x.nom)}</div><div><b>${esc(x.prenom)} ${esc(x.nom)}</b><span>${esc(x.poste || '')}${x.telephone ? ` · <a class="link" href="tel:${esc(String(x.telephone).replace(/\s/g, ''))}">${esc(x.telephone)}</a>` : ''}${extra}</span></div></div><div class="row">${droite}</div></div>`;
function groupe(titre, cls, L, rendu) {
  if (!L.length) return '';
  return `<div class="jour-groupe"><div class="jour-titre">${badge(cls, `${titre} · ${L.length}`)}</div><div class="list">${L.map(rendu).join('')}</div></div>`;
}

async function openJour(date) {
  const d = await GET('/jour/' + date);
  S.jour = date;
  const prof = d.profil;
  let corps = '';
  if (prof === 'agence') {
    corps = d.missions.map(m => {
      const I = m.intervenants, par = e => I.filter(x => x.etat === e);
      const canaux = x => x.canaux.map(c => CANAUX[c]?.[1]).join(', ');
      return `<section class="jour-mission"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>${iconeCeSoir(m, true)}${m.nb_postes} × ${esc(m.poste)} · ${esc(m.client_nom)}</h3><div class="small muted">${m.debut}–${m.fin} · taux horaire brut ${eur(m.taux_horaire)}/h · ${esc(m.motif || '')}</div></div>${badge(...missionStatut({ ...m, actifs: I.filter(x => ['accepte', 'retenu'].includes(x.etat)).length, retenus: par('retenu').length }))}</div>
        ${simBloc(m.simulation, 'agence')}<dl class="kv" style="margin-top:8px"><dt>Lieu</dt><dd>${esc([m.client_adresse, m.client_ville].filter(Boolean).join(', ') || '—')}</dd><dt>Interlocuteur</dt><dd>${esc([m.client_contact, m.client_telephone].filter(Boolean).join(' · ') || '—')}</dd>${m.commentaire ? `<dt>Précisions</dt><dd>${esc(m.commentaire)}</dd>` : ''}<dt>Postes pourvus</dt><dd>${par('retenu').length} / ${m.nb_postes}</dd></dl>
        ${m.statut === 'nouvelle' ? `<div class="row" style="margin-top:8px">${btn('Valider et diffuser', 'send', `data-a="diffuser" data-id="${m.id}"`, 'sm primary')}</div>` : ''}
        ${groupe('Validés', 'libre', par('retenu'), x => ligne(x, suiviIntervenant(x, m.date), ` · ${canaux(x)}`))}
        ${groupe('En attente de l\'employeur', 'attente', par('accepte'), x => ligne(x, m.statut === 'diffusee' ? btn('Refuser', '', `data-a="decision" data-m="${m.id}" data-i="${x.interim_id}" data-ok="0"`, 'sm') + btn('Accepter', 'check', `data-a="decision" data-m="${m.id}" data-i="${x.interim_id}" data-ok="1"`, 'sm primary') : ''))}
        ${groupe('Refusés par l\'employeur', 'danger', par('refuse_client'), x => ligne(x))}
        ${groupe('Non retenus', 'off', par('non_retenu'), x => ligne(x))}
        ${groupe('Sans réponse', 'off', par(null), x => ligne(x, '', ` · envoyé par ${canaux(x)}`))}
        ${groupe('Ont décliné', 'off', par('decline'), x => ligne(x))}
        ${!I.length && m.statut !== 'nouvelle' ? empty('Aucun intérimaire contacté.') : ''}</section>`;
    }).join('') + `<section class="jour-mission"><h3>Intérimaires ce jour-là</h3>
      ${groupe('Disponibles', 'libre', d.disponibles, x => ligne(x))}${groupe('Indisponibles', 'off', d.indisponibles, x => ligne(x))}
      ${!d.disponibles.length && !d.indisponibles.length ? '<p class="small muted">Aucune disponibilité renseignée pour cette date.</p>' : ''}</section>`;
  } else if (prof === 'client') {
    corps = d.missions.map(m => {
      const C = m.candidats, par = (...e) => C.filter(x => e.includes(x.etat));
      return `<section class="jour-mission"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>${iconeCeSoir(m, true)}${m.nb_postes} × ${esc(m.poste)}</h3><div class="small muted">${m.debut}–${m.fin}${m.commentaire ? ' · ' + esc(m.commentaire) : ''}</div></div>${badge(...missionStatut({ ...m, actifs: par('accepte', 'retenu').length, retenus: par('retenu').length }))}</div>
        <div class="small" style="margin:6px 0">Postes pourvus : <b>${par('retenu').length} / ${m.nb_postes}</b></div>${simBloc(m.simulation, 'client')}
        ${m.statut === 'nouvelle' ? empty('Demande en cours de validation par l\'agence.') : ''}
        ${groupe('Validés', 'libre', par('retenu'), x => ligne(x, stars(x.note) + suiviIntervenant(x, m.date)))}
        ${groupe('En attente de votre décision', 'attente', par('accepte'), x => ligne(x, stars(x.note) + (m.statut === 'diffusee' ? btn('Refuser', '', `data-a="decision" data-m="${m.id}" data-i="${x.interim_id}" data-ok="0"`, 'sm') + btn('Accepter', 'check', `data-a="decision" data-m="${m.id}" data-i="${x.interim_id}" data-ok="1"`, 'sm primary') : '')))}
        ${groupe('Refusés', 'danger', par('refuse_client'), x => ligne(x))}
        ${groupe('Non retenus', 'off', par('non_retenu'), x => ligne(x))}
        ${m.statut === 'diffusee' && !C.length ? empty('Diffusée. En attente de réponses des intérimaires.') : ''}</section>`;
    }).join('');
  } else {
    const ET = { confirmee: ['libre', 'Mission confirmée'], signature: ['attente', 'Contrat à signer'], desiste: ['off', 'Désisté(e)'], en_attente: ['attente', 'En attente de confirmation'], a_repondre: ['pris', 'À traiter'], complet: ['off', 'Complet'], non_retenu: ['off', 'Non retenu'], pourvue: ['off', 'Mission pourvue'], decline: ['off', 'Vous avez décliné'], annulee: ['off', 'Annulée'] };
    corps = d.missions.map(m => `<section class="jour-mission"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3>${iconeCeSoir({ ...m, statut: m.etat === 'annulee' ? 'annulee' : '' }, true)}${esc(m.poste)} · ${esc(m.client_nom)}</h3><div class="small muted">${m.debut}–${m.fin} · taux horaire brut ${eur(m.taux_horaire)}/h</div></div>${badge(...ET[m.etat])}</div>
      ${['a_repondre', 'en_attente', 'confirmee', 'complet', 'signature'].includes(m.etat) ? simBloc(m.simulation, 'interim', true) : ''}<dl class="kv" style="margin-top:8px"><dt>Lieu</dt><dd>${esc(m.lieu || '—')}</dd><dt>Nombre de postes</dt><dd>${m.nb_postes}</dd>${m.commentaire ? `<dt>Précisions</dt><dd>${esc(m.commentaire)}</dd>` : ''}
      ${m.contact ? `<dt>Sur place</dt><dd>${esc(m.contact.nom || '—')}${m.contact.telephone ? ` · <a class="link" href="tel:${esc(m.contact.telephone.replace(/\s/g, ''))}">${esc(m.contact.telephone)}</a>` : ''}</dd>` : ''}
      ${m.collegues?.length ? `<dt>Avec vous</dt><dd>${esc(m.collegues.join(', '))}</dd>` : ''}
      ${m.contrat ? `<dt>Contrat</dt><dd class="row">${badge(...ETAT_CONTRAT[m.contrat])}${m.contrat_id ? `<a class="link" href="/api/contrats/${m.contrat_id}/document" target="_blank" rel="noopener">Lire</a>` : ''}${m.contrat === 'a_signer' ? btn('Signer', 'edit', `data-a="signer" data-id="${m.contrat_id}" data-n=""`, 'sm primary') : ''}</dd>` : ''}
      ${m.heures ? `<dt>Heures</dt><dd>${etatHeures(m.heures, m.date)}</dd>` : ''}
      ${m.documents?.length ? `<dt>Documents</dt><dd>${docLinks(m.documents)}</dd>` : ''}</dl>
      ${m.etat === 'a_repondre' ? `<div class="row" style="margin-top:8px">${btn('Refuser', '', `data-a="repondre" data-id="${m.id}" data-ok="0"`, 'sm')}${btn('Accepter la mission', 'check', `data-a="repondre" data-id="${m.id}" data-ok="1"`, 'sm primary')}</div>` : ''}</section>`).join('')
      + `<p class="small muted" style="padding:0 16px 12px">Votre disponibilité ce jour-là : <b>${d.disponibilite === 'disponible' ? 'disponible' : d.disponibilite === 'indisponible' ? 'indisponible' : 'non renseignée'}</b>.</p>`;
  }
  const vide = !d.missions.length;
  openModal(`<div data-jour="${date}">${modalHead(ic('cal') + fdate(date, 'long').replace(/^./, c => c.toUpperCase()), vide ? 'Aucune mission' : `${d.missions.length} mission${d.missions.length > 1 ? 's' : ''}`)}
    <div class="jour-corps">${vide && prof !== 'agence' ? empty(prof === 'client' ? 'Aucune mission ce jour-là.' : 'Aucune mission ce jour-là.') : corps}</div>
    <div class="panel-f" style="justify-content:flex-end">${prof === 'client' && date >= (S.cfg?.aujourdhui || '') ? btn('Demander du personnel ce jour-là', 'plus', `data-a="demjour" data-d="${date}"`, 'sm') : ''}${btn('Fermer', '', 'data-a="close"', 'primary')}</div></div>`);
  document.querySelector('#modal .modal').classList.add('large');
}
const rafraichirJour = async () => { if (S.jour) await openJour(S.jour); };

/* ---------------- Vues ---------------- */
const V = { agence: {}, client: {}, interim: {} };

/* ===== Agence ===== */
V.agence.accueil = async () => {
  const [ms, hs, fs, ks, ps, cs, al] = await Promise.all([GET('/missions'), GET('/heures'), GET('/factures'), GET('/contrats'), GET('/prospects'), GET('/candidats'), GET('/notifications')]);
  const cNouv = cs.filter(x => x.statut === 'nouveau'), cRel = cs.filter(x => x.date_relance && x.date_relance <= (S.cfg?.aujourdhui || '') && !['inscrit', 'refuse'].includes(x.statut));
  const kSig = ks.filter(k => k.statut === 'a_signer'), pRel = ps.filter(x => x.date_relance && x.date_relance <= (S.cfg?.aujourdhui || '') && !['client', 'perdu'].includes(x.statut));
  const pNouv = ps.filter(x => x.statut === 'nouveau' && x.source === 'site');
  const nouvelles = ms.filter(m => m.statut === 'nouvelle'), decisions = ms.filter(m => m.statut === 'diffusee' && m.envois.some(e => e.etat === 'accepte'));
  const hAttente = hs.filter(h => h.ouvert && !(h.valide_interim && h.valide_client));
  const du = fs.filter(f => !f.payee_le), retard = du.filter(f => f.en_retard);
  const enCours = ms.filter(m => ['nouvelle', 'diffusee'].includes(m.statut));
  const ceSoir = ms.filter(m => estCeSoir(m) && m.statut !== 'verrouillee');
  const tasks = [
    // Alertes : désistements, annulations par les employeurs, indisponibilités imprévues
    ...al.map(x => ['e', /^Désistement/.test(x.message) ? 'ban' : 'alert', x.message.split(' : ')[0], x.message.split(' : ').slice(1).join(' : ') + ` · ${fdate(x.created_at.slice(0, 10), 'num')}`, 'missions']),
    ...ceSoir.map(m => ['e', 'alert', `Ce soir, importance haute : ${m.nb_postes} × ${m.poste} non pourvu`, `${m.client_nom} · ${m.debut}–${m.fin}`, 'missions']),
    ...nouvelles.map(m => ['w', 'send', `Mission à diffuser : ${m.nb_postes} × ${m.poste}`, `${m.client_nom} · ${fdate(m.date)}`, 'missions']),
    ...decisions.map(m => ['n', 'users', `Candidats en attente de l'employeur : ${m.poste}`, `${m.client_nom} · ${fdate(m.date)}`, 'missions']),
    ...retard.map(f => ['e', 'alert', `Facture ${f.numero} en retard`, `${f.client_nom} · ${eur(f.montant_ttc)} TTC${f.nb_relances ? ` · ${f.nb_relances} relance(s)` : ''}`, 'facturation']),
    ...(kSig.length ? [['w', 'edit', `${kSig.length} contrat${kSig.length > 1 ? 's' : ''} de mission en attente de signature`, 'Relancez l\'intérimaire ou l\'employeur si besoin', 'contrats']] : []),

    ...pRel.map(x => ['w', 'target', `Prospect à relancer : ${x.etablissement}`, `Relance prévue le ${fdate(x.date_relance, 'num')}`, 'prospects']),

    ...cRel.map(x => ['w', 'idcard', `Candidat à rappeler : ${x.prenom} ${x.nom}`, `Rappel prévu le ${fdate(x.date_relance, 'num')}`, 'candidats']),
    ...(hAttente.length ? [['w', 'clock', `${hAttente.length} relevé${hAttente.length > 1 ? 's' : ''} d'heures à finaliser`, 'Confirmation intérimaire ou validation employeur manquante', 'heures']] : []),
  ];
  return head('Bonjour ' + esc(S.me.nom.split(' ')[0]), 'Activité de l\'agence.', btn('Nouvelle mission', 'plus', 'data-a="newmission"', 'primary')) +
    `<div class="kpis">${kpi('Missions à diffuser', 'send', nouvelles.length, 'Demandes à valider')}${kpi('Missions en cours', 'briefcase', ms.filter(m => m.statut === 'diffusee').length, 'Diffusées, non verrouillées')}
    ${kpi('Heures à finaliser', 'clock', hAttente.length, 'Missions terminées')}${kpi('Encours clients TTC', 'receipt', eur(du.reduce((a, f) => a + f.montant_ttc, 0)), retard.length ? `${retard.length} en retard` : 'Aucun retard', retard.length ? 'down' : '')}</div>
    <div class="grid-main">${panel('Missions en cours', btn('Toutes les missions', 'chev', 'data-a="nav" data-v="missions"', 'sm'), enCours.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Client</th><th>Poste</th><th>Statut</th><th></th></tr></thead><tbody>
      ${enCours.map(m => `<tr><td>${fdate(m.date)}${iconeCeSoir(m)}</td><td>${esc(m.client_nom)}</td><td>${m.nb_postes} × ${esc(m.poste)}</td><td>${badge(...missionStatut(m))}</td><td class="r">${m.statut === 'nouvelle' ? btn('Diffuser', 'send', `data-a="diffuser" data-id="${m.id}"`, 'sm primary') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune mission en cours.'))}
    ${panel('Candidatures à analyser', cNouv.length + pNouv.length ? badge('danger', cNouv.length + pNouv.length) : '', cNouv.length + pNouv.length ? `<div class="list">${[
      ...cNouv.map(x => `<div class="li" style="flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>${esc(x.prenom)} ${esc(x.nom)}</b> ${badge('pris', 'Intérimaire')}<div class="small muted">${esc(x.poste || 'Poste non précisé')}${x.ville ? ' · ' + esc(x.ville) : ''} · reçue le ${fdate(x.created_at.slice(0, 10), 'num')}</div></div><div class="row">${btn('Voir', '', `data-a="candidat" data-id="${x.id}"`, 'sm ghost')}${boutonsDecision('candidat', x)}</div></div>`),
      ...pNouv.map(x => `<div class="li" style="flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>${esc(x.etablissement)}</b> ${badge('attente', 'Client')}<div class="small muted">${esc(x.repondant || '')}${x.type_etab ? ' · ' + esc(x.type_etab) : ''} · reçue le ${fdate(x.created_at.slice(0, 10), 'num')}</div></div><div class="row">${btn('Voir', '', `data-a="prospect" data-id="${x.id}"`, 'sm ghost')}${boutonsDecision('prospect', x)}</div></div>`)].join('')}</div>` : empty('Aucune candidature en attente.'))}
    ${panel('À traiter', tasks.length ? badge('danger', tasks.length) : '', tasks.length ? tasks.map(([c, i, t, d, v]) => `<div class="task"><div class="ic ${c}">${ic(i)}</div><div><b>${esc(t)}</b><div class="small muted">${esc(d)}</div></div><button class="btn sm ghost" data-a="nav" data-v="${v}" aria-label="Ouvrir">${ic('chev')}</button></div>`).join('') : empty('Rien à traiter.'))}</div>`;
};

V.agence.missions = async () => {
  const ms = await GET('/missions');
  S.p.mf = S.p.mf || 'actives';
  const f = { actives: m => ['nouvelle', 'diffusee'].includes(m.statut), verrouillees: m => m.statut === 'verrouillee', toutes: () => true }[S.p.mf];
  const L = ms.filter(f).sort((a, b) => (a.statut === 'nouvelle' ? 0 : 1) - (b.statut === 'nouvelle' ? 0 : 1) || a.date.localeCompare(b.date));
  return head('Missions', 'Validez chaque nouvelle mission, choisissez les intérimaires et le moyen d\'envoi. L\'employeur confirme ensuite ceux qui ont accepté ; l\'agence peut aussi décider à sa place.', btn('Nouvelle mission', 'plus', 'data-a="newmission"', 'primary')) +
    `<div class="panel" style="padding:10px 14px">${tabs('mf', [['actives', 'En cours'], ['verrouillees', 'Validées'], ['toutes', 'Toutes']])}</div>` +
    (L.map(m => missionCard(m, 'agence')).join('') || panel(null, '', empty('Aucune mission.')));
};

V.agence.interimaires = async () => {
  const L = await GET('/interimaires');
  const s = L.find(i => i.id === S.p.isel) || L[0];
  const [xp, dos, ks, types, av] = s ? await Promise.all([GET(`/interimaires/${s.id}/experiences`), GET(`/interimaires/${s.id}/pieces`), GET('/contrats?interim_id=' + s.id), piecesTypes(), GET('/avis?interim_id=' + s.id)]) : [];
  return head('Intérimaires', 'Fiches candidats, dossier administratif, contrats et accès à l\'espace intérimaire.', btn('Nouvel intérimaire', 'plus', 'data-a="interimform"', 'primary')) +
    (!L.length ? panel(null, '', empty('Aucun intérimaire. Créez la première fiche.')) :
      `<div class="grid-main side">
      ${panel(`${L.length} fiche${L.length > 1 ? 's' : ''}`, '', `<div class="list">${L.map(i => `<div class="li clickable ${i.id === s.id ? 'sel' : ''}" data-a="isel" data-id="${i.id}" tabindex="0" role="button"><div class="person"><div class="avatar">${initials(i.prenom + ' ' + i.nom)}</div><div><b>${esc(i.prenom)} ${esc(i.nom)}</b><span>${esc(i.poste)} · ${i.suspendu ? 'suspendu' : i.dossier_complet ? 'dossier complet' : 'dossier incomplet'}</span></div></div><div style="text-align:right">${stars(i.note)}${alerteNote(i.note)}<div class="small muted">${i.nb_missions} mission${i.nb_missions > 1 ? 's' : ''}</div></div></div>`).join('')}</div>`)}
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0"><section class="panel"><div class="panel-h"><div class="person"><div class="avatar lg">${initials(s.prenom + ' ' + s.nom)}</div><div><h2>${esc(s.prenom)} ${esc(s.nom)}</h2><span>${esc(s.poste)} · ${esc(s.secteur)}</span></div></div><div class="row">${s.suspendu ? badge('off', 'Suspendu') : ''}${btn('Modifier', 'edit', `data-a="interimform" data-id="${s.id}"`, 'sm')}${gestionProfil('interimaires', s)}</div></div>
      <div class="panel-b" style="display:flex;flex-direction:column;gap:16px">${suspenduInfo(s)}<dl class="kv"><dt>Téléphone</dt><dd>${esc(s.telephone || '—')}</dd><dt>E-mail</dt><dd>${esc(s.email || '—')}</dd><dt>Ville</dt><dd>${esc(s.ville || '—')}</dd>
      <dt>Naissance</dt><dd>${s.date_naissance ? fdate(s.date_naissance, 'num') : '—'}${s.lieu_naissance ? ' à ' + esc(s.lieu_naissance) : ''}</dd><dt>Nationalité</dt><dd>${esc(s.nationalite)}</dd>
      <dt>Sécurité sociale</dt><dd class="mono">${esc(s.nir || '—')}</dd><dt>Domicile</dt><dd>${esc([s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—')}</dd>
      <dt>Taux horaire brut</dt><dd>${eur(s.taux_horaire)}</dd><dt>Compétences</dt><dd>${esc(s.competences || '—')}</dd>
      <dt>Dossier administratif</dt><dd>${s.dossier_complet ? badge('libre', 'Complet') : badge('attente', 'Incomplet')}</dd><dt>Note moyenne</dt><dd>${stars(s.note)}</dd></dl>
      ${accessBox('interim', s.id, s.acces)}</div></section>
      ${avisPanel(av, 'interim')}${piecesPanel(s.id, dos, types)}${experiencesPanel(s.id, xp)}${panel('Contrats de mission', '', contratsPanel(ks))}</div></div>`);
};
V.agence.clients = async () => {
  const L = await GET('/clients');
  const s = L.find(c => c.id === S.p.csel) || L[0];
  const [docs, cc, av] = s ? await Promise.all([GET('/documents?client_id=' + s.id), GET('/contrats-clients?client_id=' + s.id), GET('/avis?client_id=' + s.id)]) : [[], null, null];
  return head('Clients', 'Fiches entreprises, conditions, documents et accès à l\'espace employeur.', btn('Nouveau client', 'plus', 'data-a="clientform"', 'primary')) +
    (!L.length ? panel(null, '', empty('Aucun client. Créez la première fiche.')) :
      panel(`${L.length} client${L.length > 1 ? 's' : ''}`, '', `<div class="scroll"><table><thead><tr><th>Client</th><th>Secteur</th><th class="r">Missions</th><th class="r">Pourvues</th><th>Note des intérimaires</th><th>Accès</th></tr></thead><tbody>
      ${L.map(c => `<tr class="clickable ${c.id === s.id ? 'sel' : ''}" data-a="csel" data-id="${c.id}" tabindex="0"><td><b>${esc(c.nom)}</b> ${c.suspendu ? badge('off', 'Suspendu') : ''}<div class="small muted">${esc(c.ville || '')}</div></td><td>${esc(c.secteur)}</td><td class="r num">${c.nb_missions}</td><td class="r num">${c.nb_pourvues}</td><td>${stars(c.note)}${alerteNote(c.note)}</td><td>${c.acces ? `<span class="mono">${esc(c.acces)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`) +
      `<div class="grid2"><section class="panel"><div class="panel-h"><h2>${esc(s.nom)}</h2><div class="row">${btn('Modifier', 'edit', `data-a="clientform" data-id="${s.id}"`, 'sm')}${gestionProfil('clients', s)}</div></div><div class="panel-b" style="display:flex;flex-direction:column;gap:16px">${suspenduInfo(s)}
      <dl class="kv"><dt>SIRET</dt><dd>${esc(s.siret || '—')}</dd><dt>Adresse</dt><dd>${esc([s.adresse, s.ville].filter(Boolean).join(', ') || '—')}</dd><dt>Interlocuteur</dt><dd>${esc(s.contact || '—')}</dd><dt>E-mail</dt><dd>${esc(s.email || '—')}</dd><dt>Téléphone</dt><dd>${esc(s.telephone || '—')}</dd>
      <dt>Coefficient</dt><dd><b>${num(s.coefficient)}</b> <span class="small muted">${origineCoef(cc)}</span></dd><dt>Paiement</dt><dd>${s.delai_paiement} jours</dd><dt>Convention</dt><dd>${esc(s.convention)}</dd></dl>${accessBox('client', s.id, s.acces)}</div></section>
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">${avisPanel(av, 'client')}${contratsClientPanel(s, cc, 'agence')}${panel('Documents de prise de poste', '', docsTable(docs, true) + uploadForm(s.id))}</div></div>`);
};
/* ----- Contrat commercial de l'entreprise : coefficient et délai de paiement ----- */
const CC_ETAT = { a_signer: ['attente', 'En attente de signature'], signe: ['libre', 'Signé · en vigueur'], remplace: ['off', 'Remplacé'], annule: ['off', 'Annulé'] };
function origineCoef(cc) {
  const k = cc?.contrats.find(x => x.statut === 'signe');
  return k ? `contrat ${esc(k.numero)} signé le ${fdate(k.signe_le, 'num')}` : `par défaut, aucun contrat signé (minimum ${num(cc?.coefficient_minimum ?? 1.45)})`;
}
function contratsClientPanel(c, cc, profil) {
  const L = cc?.contrats || [], agence = profil === 'agence';
  const ligne = k => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:200px"><b>${esc(k.numero)}</b> · coefficient <b>${num(k.coefficient)}</b> · paiement à ${k.delai_paiement} jours
      <div class="small muted">Établi le ${fdate(k.created_at, 'num')} · effet au ${fdate(k.date_effet, 'num')}${k.signe_le ? ` · signé ${k.signe_mode === 'papier' ? 'sur papier' : 'en ligne'} par ${esc(k.signe_nom)} le ${fdate(k.signe_le, 'num')}` : ''}</div>
      ${k.conditions ? `<div class="small" style="margin-top:4px">${esc(k.conditions)}</div>` : ''}</div>
    <div class="row">${badge(...CC_ETAT[k.statut])}<a class="btn sm" href="/api/contrats-clients/${k.id}/document" target="_blank" rel="noopener">${ic('file')}Voir</a>
      ${k.statut === 'a_signer' ? (agence ? btn('Signé sur papier', 'check', `data-a="ccsign" data-id="${k.id}"`, 'sm') + btn('Annuler', '', `data-a="ccannul" data-id="${k.id}"`, 'sm ghost') : btn('Signer le contrat', 'edit', `data-a="ccsign" data-id="${k.id}"`, 'sm primary')) : ''}</div></div>`;
  return panel('Contrat commercial', agence ? btn('Nouveau contrat', 'plus', `data-a="ccnew" data-id="${c.id}" data-coef="${c.coefficient}" data-delai="${c.delai_paiement}"`, 'sm primary') : '',
    `<div class="panel-b small muted" style="padding-bottom:0">${agence ? `Sans contrat signé, le coefficient par défaut (${num(cc?.coefficient_minimum ?? 1.45)}) s'applique. Dès la signature, le coefficient et le délai du contrat s'appliquent automatiquement aux simulations et aux factures.` : 'Le coefficient et le délai de paiement du contrat signé s\'appliquent à vos missions et factures.'}</div>
    ${L.length ? `<div class="list">${L.map(ligne).join('')}</div>` : empty('Aucun contrat enregistré.')}`);
}
function ccModal(el) {
  const min = S.cfg?.coefficient_minimum || 1.45, t = S.cfg?.aujourdhui || '';
  openModal(`${modalHead(ic('file') + 'Nouveau contrat commercial', 'À faire signer par l\'entreprise dans son espace, ou à marquer « signé sur papier ».')}<form data-f="ccnew" data-id="${el.dataset.id}"><div class="panel-b form">
    <label class="f">Coefficient de facturation<input type="number" name="coefficient" step="0.01" min="${min}" max="5" value="${Math.max(min, Number(el.dataset.coef) || min)}" required data-coef-saisie><span class="hint">Minimum ${num(min)}, redéfinissable à la hausse.</span></label>
    <label class="f">Délai de paiement (jours)<input type="number" name="delai_paiement" min="0" max="60" value="${el.dataset.delai || 15}" required></label>
    <label class="f">Date d'effet<input type="date" name="date_effet" value="${t}" required></label>
    <div class="f"><span>Marge brute estimée sur une heure</span><b data-marge-coef></b><span class="hint">Mission classique, avec les taux de Paramètres › Paie.</span></div>
    <label class="f full">Conditions particulières (facultatif)<textarea name="conditions" maxlength="2000" placeholder="Minimum d'heures facturées, frais de déplacement, tenue…"></textarea></label>
    <div class="err full" hidden></div></div>${modalFoot('Enregistrer le contrat', 'type="submit"')}</form>`);
  margeCoef();
}
/** Marge brute d'une heure selon le coefficient : 1 − coût agence ÷ facturé. */
function margeCoef() {
  const i = $('[data-coef-saisie]'), o = $('[data-marge-coef]'); if (!i || !o) return;
  const k = S.cfg?.facteur_cout || 1.452, c = Number(String(i.value).replace(',', '.')) || 0, m = c ? (1 - k / c) * 100 : 0;
  o.textContent = `${num(Math.round(m * 10) / 10)} %`; o.style.color = m < 0 ? 'var(--danger-fg)' : 'var(--libre-fg)';
}
function ccSignModal(id) {
  const agence = S.me.profil === 'agence';
  openModal(`${modalHead(ic('edit') + (agence ? 'Contrat signé sur papier' : 'Signer le contrat'))}<form data-f="ccsign" data-id="${id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p class="small">${agence ? 'Indiquez qui a signé pour l\'entreprise. Le coefficient et le délai du contrat s\'appliqueront immédiatement.' : `<a class="link" href="/api/contrats-clients/${id}/document" target="_blank" rel="noopener">Lire le contrat</a> avant de signer. Le coefficient et le délai de paiement s'appliqueront à vos prochaines factures.`}</p>
    <label class="f">Nom et fonction du signataire<input type="text" name="nom" required minlength="3" maxlength="120" placeholder="Jean Dupont, gérant"></label>
    ${agence ? '' : '<label class="check"><input type="checkbox" name="accepte" value="1" required> J\'ai lu et j\'accepte le contrat, je suis habilité à signer pour l\'entreprise.</label>'}
    <div class="err" hidden></div></div>${modalFoot(ic('check') + 'Signer', 'type="submit"')}</form>`);
}

function accessBox(type, id, acces) {
  return `<div class="access"><div><div class="small muted">Accès à l'espace ${type === 'client' ? 'employeur' : 'intérimaire'}</div>${acces ? `<span class="mono">${esc(acces)}</span>` : '<b>Aucun accès créé</b>'}</div>
    ${acces ? btn('Gérer dans Accès utilisateurs', 'chev', 'data-a="nav" data-v="acces"', 'sm') : btn('Créer l\'identifiant et le mot de passe', 'lock', `data-a="mkacc" data-type="${type}" data-id="${id}"`, 'sm primary')}</div>`;
}
function docsTable(docs, canDelete) {
  return docs.length ? `<div class="scroll"><table><thead><tr><th>Document</th><th>Catégorie</th><th>Déposé le</th><th></th></tr></thead><tbody>${docs.map(d => `<tr><td><a class="link" href="/api/documents/${d.id}/fichier">${esc(d.nom)}</a></td><td>${esc(d.categorie)}</td><td>${fdate(d.created_at, 'num')}</td><td class="r">${canDelete ? btn('Supprimer', 'trash', `data-a="deldoc" data-id="${d.id}"`, 'sm ghost') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucun document.');
}
function uploadForm(clientId) {
  return `<form data-f="upload" class="panel-b inline-form" style="border-top:1px solid var(--line)">${clientId ? `<input type="hidden" name="client_id" value="${clientId}">` : ''}
    <label class="f">Catégorie<select name="categorie">${opt(['Prise de poste', 'Règlement intérieur', 'Charte qualité'])}</select></label>
    <label class="f">Fichier (PDF, image ou Word, 10 Mo max.)<input type="file" name="fichier" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"></label>
    <button class="btn primary" type="submit">${ic('upload')}Déposer</button></form>`;
}

V.agence.heures = async () => {
  const hs = await GET('/heures');
  return head('Heures', 'Relevés créés automatiquement à la validation des missions. L\'agence peut confirmer, valider ou corriger à la place de chacun.') +
    panel(null, '', hs.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Intérimaire</th><th>Client</th><th class="r">Prévues</th><th class="r">Extra</th><th>Intérimaire</th><th>Employeur</th><th></th></tr></thead><tbody>
    ${hs.map(h => `<tr><td>${fdate(h.date)}</td><td><b>${esc(h.prenom)} ${esc(h.interim_nom)}</b><div class="small muted">${esc(h.poste)} · ${h.debut}–${h.fin}</div></td><td>${esc(h.client_nom)}</td><td class="r num">${num(h.heures_prevues)} h</td>
    <td class="r">${h.extra ? `+${num(h.extra)} h ${badge(...{ attente: ['attente', 'à accepter'], accepte: ['libre', 'accepté'], refuse: ['off', 'refusé'] }[h.extra_statut] || ['off', ''])}<div class="small muted">${esc(h.justification || '')}</div>` : '—'}</td>
    <td>${h.valide_interim ? badge('libre', 'Confirmé') : h.ouvert ? badge('attente', 'À confirmer') : badge('off', 'Mission à venir')}</td><td>${h.valide_client ? badge('libre', 'Validé') : h.ouvert ? badge('attente', 'À valider') : badge('off', '—')}</td>
    <td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${h.ouvert && !h.valide_interim ? btn('Confirmer', 'check', `data-a="hconf" data-id="${h.id}"`, 'sm') : ''}${h.ouvert && !h.valide_client ? (h.extra_statut === 'attente' ? btn('Refuser l\'extra', '', `data-a="hval" data-id="${h.id}" data-x="0"`, 'sm') + btn('Accepter', 'check', `data-a="hval" data-id="${h.id}" data-x="1"`, 'sm primary') : btn('Valider', 'check', `data-a="hval" data-id="${h.id}"`, 'sm primary')) : ''}${btn('', 'edit', `data-a="hedit" data-id="${h.id}" data-v="${h.heures_prevues}" aria-label="Corriger les heures"`, 'sm ghost')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Aucun relevé pour le moment. Ils apparaissent quand une mission est validée.'));
};
V.agence.evaluations = async () => {
  const L = await GET('/evaluations');
  return head('Évaluations', 'Notes de fin de service données par les employeurs et par les intérimaires.') +
    panel(null, '', L.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Sens</th><th>Intérimaire</th><th>Client</th><th>Note</th><th>Commentaire</th><th>Axe d'amélioration</th></tr></thead><tbody>
    ${L.map(e => `<tr><td>${fdate(e.date)}</td><td>${e.sens === 'client_vers_interim' ? 'Employeur → intérimaire' : 'Intérimaire → employeur'}</td><td>${esc(e.prenom)} ${esc(e.interim_nom)}</td><td>${esc(e.client_nom)}</td><td>${stars(e.note)}</td><td>${esc(e.commentaire || '—')}</td><td>${e.axe ? badge('attente', esc(e.axe)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune évaluation.'));
};
function quinzaine() {
  const t = S.cfg?.aujourdhui || new Date().toISOString().slice(0, 10), m = t.slice(0, 8);
  if (Number(t.slice(8, 10)) <= 15) return [m + '01', m + '15'];
  const fin = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0).getDate();
  return [m + '16', m + String(fin).padStart(2, '0')];
}
V.agence.contrats = async () => {
  const [ks, R] = await Promise.all([GET('/contrats'), GET('/relances')]);
  const a = ks.filter(k => k.statut === 'a_signer');
  return head('Contrats de mission', 'Établis automatiquement dès qu\'une mission est pourvue, signés en ligne par l\'intérimaire puis l\'employeur. La mission est validée quand tous ses contrats sont signés. Les relances automatiques se règlent dans Paramètres › Relances.') +
    panel(`En cours de signature (${a.length})`, '', contratsPanel(a)) + panel('Tous les contrats', '', contratsPanel(ks)) +
    panel('Historique des relances', '', R.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Objet</th><th>Destinataire</th><th>Canaux</th><th>Type</th></tr></thead><tbody>${R.map(r => `<tr><td>${fdate(r.created_at, 'num')}</td><td>${r.objet === 'contrat' ? 'Contrat' : 'Facture'} <span class="mono">${esc(r.numero || '')}</span></td><td>${esc(r.destinataire)}</td><td>${r.canaux.split(',').map(c => CANAUX[c]?.[1] || esc(c)).join(', ')}</td><td>${r.auto ? badge('off', 'Automatique') : badge('pris', 'Manuelle')}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune relance envoyée.'));
};
V.agence.relances = async () => {
  const [fs, ks, R] = await Promise.all([GET('/factures'), GET('/contrats'), GET('/relances')]);
  const retard = fs.filter(f => f.en_retard), aSig = ks.filter(k => k.statut === 'a_signer');
  return head('Relances', 'Factures échues et contrats de mission en attente de signature. Les relances automatiques se règlent dans Paramètres › Relances.', btn('Réglages', 'gear', 'data-a="nav" data-v="parametres"', 'sm')) +
    `<div class="kpis">${kpi('Factures en retard', 'alert', retard.length, eur(retard.reduce((a, f) => a + f.montant_ttc, 0)) + ' TTC', retard.length ? 'down' : '')}${kpi('Contrats à signer', 'edit', aSig.length)}${kpi('Relances envoyées', 'send', R.length, 'Depuis le début')}</div>` +
    panel('Factures en retard', '', retard.length ? `<div class="scroll"><table><thead><tr><th>N°</th><th>Client</th><th class="r">TTC</th><th>Échéance</th><th>Relances</th><th></th></tr></thead><tbody>
      ${retard.map(x => `<tr><td class="mono">${x.numero}</td><td>${esc(x.client_nom)}</td><td class="r num"><b>${eur(x.montant_ttc)}</b></td><td>${badge('danger', fdate(x.echeance, 'num'))}</td><td>${x.nb_relances ? `${x.nb_relances} · dernière le ${fdate(x.relance_le, 'num')}` : '<span class="muted">Aucune</span>'}</td>
      <td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><a class="btn sm ghost" href="/api/factures/${x.id}/document" target="_blank" rel="noopener">${ic('file')}Voir</a>${btn('Relancer', 'send', `data-a="frelance" data-id="${x.id}"`, 'sm primary')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune facture en retard.')) +
    panel('Contrats de mission à signer', btn('Tous les contrats', 'chev', 'data-a="nav" data-v="contrats"', 'sm'), contratsPanel(aSig)) +
    panel('Historique des relances', '', R.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Objet</th><th>Destinataire</th><th>Canaux</th><th>Type</th></tr></thead><tbody>${R.map(r => `<tr><td>${fdate(r.created_at, 'num')}</td><td>${r.objet === 'contrat' ? 'Contrat' : 'Facture'} <span class="mono">${esc(r.numero || '')}</span></td><td>${esc(r.destinataire)}</td><td>${r.canaux.split(',').map(c => CANAUX[c]?.[1] || esc(c)).join(', ')}</td><td>${r.auto ? badge('off', 'Automatique') : badge('pris', 'Manuelle')}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune relance envoyée.'));
};
V.agence.tarifs = async () => {
  const L = await GET('/clients'), min = S.cfg?.coefficient_minimum || 1.45, k = S.cfg?.facteur_cout || 1.452;
  const marge = c => Math.round((1 - k / c) * 1000) / 10;
  return head('Coefficients et contrats', `Coefficient de facturation de chaque entreprise : ${num(min)} par défaut, celui du contrat commercial dès sa signature. Marge brute estimée sur une heure de mission classique.`) +
    panel(null, '', L.length ? `<div class="scroll"><table><thead><tr><th>Client</th><th class="r">Coefficient</th><th>Origine</th><th class="r">Marge estimée</th><th class="r">Paiement</th><th class="r">Encours TTC</th><th></th></tr></thead><tbody>
    ${L.map(c => `<tr class="clickable" data-a="ouvrirclient" data-id="${c.id}" tabindex="0"><td><b>${esc(c.nom)}</b>${c.suspendu ? ' ' + badge('off', 'Suspendu') : ''}</td><td class="r num"><b>${num(c.coefficient)}</b></td>
      <td>${c.contrat_numero ? badge('libre', `Contrat ${esc(c.contrat_numero)} signé`) : c.coefficient === min ? badge('off', 'Par défaut') : badge('attente', 'Fiche client, sans contrat')}${c.contrats_a_signer ? ' ' + badge('attente', 'Contrat à signer') : ''}</td>
      <td class="r num ${marge(c.coefficient) < 0 ? 'down' : ''}">${num(marge(c.coefficient))} %</td><td class="r">${c.delai_paiement} j</td><td class="r num">${eur(c.encours_ttc)}</td>
      <td class="r">${btn('Nouveau contrat', 'plus', `data-a="ccnew" data-id="${c.id}" data-coef="${c.coefficient}" data-delai="${c.delai_paiement}"`, 'sm')}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucun client.'));
};
V.agence.facturation = async () => {
  const fs = await GET('/factures');
  const [d, f] = quinzaine();
  return head('Facturation et débiteurs', 'Les factures sont calculées à partir des heures validées par les deux parties : heures × taux horaire brut × coefficient du client.') +
    panel('Générer les factures', '', `<form data-f="facturer" class="panel-b inline-form"><label class="f">Du<input type="date" name="debut" value="${d}" required></label><label class="f">Au<input type="date" name="fin" value="${f}" required></label><button class="btn primary" type="submit">${ic('receipt')}Générer</button></form>`) +
    panel('Factures', '', fs.length ? `<div class="scroll"><table><thead><tr><th>N°</th><th>Client</th><th>Période</th><th class="r">HT</th><th class="r">TTC</th><th>Échéance</th><th>Statut</th><th></th></tr></thead><tbody>
    ${fs.map(x => `<tr><td class="mono">${x.numero}</td><td>${esc(x.client_nom)}</td><td>${fdate(x.debut, 'num')} – ${fdate(x.fin, 'num')}</td><td class="r num">${eur(x.montant_ht)}</td><td class="r num"><b>${eur(x.montant_ttc)}</b></td><td>${fdate(x.echeance, 'num')}</td>
    <td>${x.payee_le ? badge('libre', 'Payée le ' + fdate(x.payee_le, 'num')) : x.en_retard ? badge('danger', 'En retard') : badge('attente', 'À échéance')}${!x.payee_le && x.nb_relances ? `<div class="small muted">${x.nb_relances} relance${x.nb_relances > 1 ? 's' : ''}, dernière le ${fdate(x.relance_le, 'num')}</div>` : ''}</td><td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><a class="btn sm ghost" href="/api/factures/${x.id}/document" target="_blank" rel="noopener">${ic('file')}Voir</a>${!x.payee_le && x.en_retard ? btn('Relancer', 'send', `data-a="frelance" data-id="${x.id}"`, 'sm') : ''}${x.payee_le ? '' : btn('Marquer payée', 'check', `data-a="payee" data-id="${x.id}"`, 'sm')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune facture.'));
};
V.agence.paie = async () => {
  const [d0, f0] = quinzaine(); S.p.pd = S.p.pd || d0; S.p.pf = S.p.pf || f0;
  const [L, B] = await Promise.all([GET(`/paie?debut=${S.p.pd}&fin=${S.p.pf}`), GET('/bulletins')]);
  const tot = L.reduce((a, r) => a + r.total, 0);
  return head('Paie des intérimaires', 'Calcul à partir des heures validées par les deux parties. IFM et ICCP de 10 % chacune ; calcul indicatif à contrôler par votre gestionnaire de paie. Les fiches de paie générées apparaissent dans l\'espace de chaque intérimaire.') +
    panel('Période', '', `<form data-f="paie" class="panel-b inline-form"><label class="f">Du<input type="date" name="debut" value="${S.p.pd}" required></label><label class="f">Au<input type="date" name="fin" value="${S.p.pf}" required></label><button class="btn primary" type="submit">Calculer</button></form>`) +
    panel(`Total brut : ${eur(tot)}`, '', L.length ? `<div class="scroll"><table><thead><tr><th>Intérimaire</th><th class="r">Heures</th><th class="r">Brut</th><th class="r">IFM</th><th class="r">ICCP</th><th class="r">Total brut</th></tr></thead><tbody>
    ${L.map(r => `<tr><td><b>${esc(r.prenom)} ${esc(r.nom)}</b></td><td class="r num">${num(r.heures)}</td><td class="r num">${eur(r.brut)}</td><td class="r num">${eur(r.ifm)}</td><td class="r num">${eur(r.iccp)}</td><td class="r num"><b>${eur(r.total)}</b></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune heure validée sur cette période.'),
    btn('Générer les fiches de paie de la période', 'wallet', `data-a="bgen" data-d="${S.p.pd}" data-f="${S.p.pf}"`, 'sm primary')) +
    panel('Fiches de paie', '', B.length ? `<div class="scroll"><table><thead><tr><th>Intérimaire</th><th>Période</th><th class="r">Heures</th><th class="r">Total brut</th><th>Statut</th><th>PDF de la fiche</th><th></th></tr></thead><tbody>
    ${B.map(b => `<tr><td><b>${esc(b.prenom)} ${esc(b.nom)}</b>${b.bloquees.length ? `<div class="small err-inline">${ic('alert', 'style="width:12px;height:12px;vertical-align:-2px"')} ${b.bloquees.length} relevé(s) non validé(s) sur la période</div>` : ''}</td><td>${fdate(b.debut, 'num')} – ${fdate(b.fin, 'num')}</td><td class="r num">${num(b.heures)}</td><td class="r num"><b>${eur(b.total)}</b></td><td>${BULL_ST(b)}</td>
    <td>${b.a_fichier ? `<a class="link" href="/api/bulletins/${b.id}/fichier">Télécharger</a>` : ''}<form data-f="bpdf" data-id="${b.id}" class="inline-form" style="margin-top:4px"><input type="file" name="fichier" accept=".pdf" required aria-label="PDF de la fiche de paie"><button class="btn sm" type="submit">${ic('upload')}${b.a_fichier ? 'Remplacer' : 'Déposer'}</button></form></td>
    <td class="r">${b.statut === 'paye' ? '' : btn('Marquer payée', 'check', `data-a="bpay" data-id="${b.id}"`, 'sm')}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune fiche de paie. Générez-les à la fin de chaque quinzaine.'),
    'Déposez le PDF produit par votre logiciel de paie : l\'intérimaire le retrouve dans son espace.');
};
V.agence.acces = async () => {
  const L = await GET('/acces');
  const P2 = { agence: ['pris', 'Agence'], client: ['libre', 'Employeur'], interim: ['attente', 'Intérimaire'] };
  return head('Accès utilisateurs', 'Le profil de chaque compte, attribué par l\'agence, détermine l\'espace ouvert à la connexion. Les accès employeur et intérimaire se créent depuis leur fiche.') +
    panel('Ajouter un collaborateur de l\'agence', '', `<form data-f="accagence" class="panel-b inline-form"><label class="f">Nom complet<input type="text" name="nom" required placeholder="Prénom Nom"></label><button class="btn primary" type="submit">${ic('lock')}Créer l'accès agence</button></form>`) +
    panel('Comptes', '', `<div class="scroll"><table><thead><tr><th>Identifiant</th><th>Titulaire</th><th>Profil</th><th>Statut</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
    ${L.map(u => `<tr><td class="mono">${esc(u.username)}</td><td><b>${esc(u.nom)}</b><div class="small muted">${esc(u.client_nom || u.interim_poste || '')}</div></td><td>${badge(...P2[u.profil])}</td>
    <td>${!u.actif ? badge('off', 'Désactivé') : u.must_change ? badge('attente', 'Première connexion en attente') : badge('libre', 'Actif')}</td><td>${u.last_login ? fdate(u.last_login, 'num') : '—'}</td>
    <td class="r">${u.id === S.me.id ? '<span class="small muted">Vous</span>' : `<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${btn('Réinitialiser', 'lock', `data-a="reset" data-id="${u.id}"`, 'sm')}${btn(u.actif ? 'Désactiver' : 'Réactiver', '', `data-a="toggle" data-id="${u.id}"`, 'sm')}</div>`}</td></tr>`).join('')}</tbody></table></div>`);
};
V.agence.journal = async () => {
  const L = await GET('/journal'), c = S.cfg?.canaux || {};
  const conf = Object.entries(CANAUX).map(([k, [i, l]]) => `<span class="row">${ic(i)}${l} : ${c[k] ? badge('libre', 'configuré') : badge('attente', 'non configuré (simulé)')}</span>`).join('');
  const st = { envoye: ['libre', 'Envoyé'], simule: ['attente', 'Simulé'], echec: ['danger', 'Échec'] };
  return head('Journal des envois', 'Tous les messages WhatsApp, SMS et e-mail envoyés par la plateforme. Un canal non configuré est simulé : le message est enregistré ici sans être envoyé.') +
    panel('Canaux', '', `<div class="panel-b statusline" style="gap:18px">${conf}</div>`) +
    panel('200 derniers messages', '', L.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Canal</th><th>Destinataire</th><th>Message</th><th>Statut</th></tr></thead><tbody>
    ${L.map(x => `<tr><td class="num">${esc(x.created_at)}</td><td>${CANAUX[x.canal]?.[1] || x.canal}</td><td class="mono">${esc(x.destinataire)}</td><td style="min-width:260px">${esc(x.contenu)}</td><td>${badge(...st[x.statut])}${x.detail ? `<div class="small muted">${esc(x.detail)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucun message envoyé.'));
};

V.agence.parametres = async () => {
  const d = await GET('/parametres');
  const v = d.valeurs;
  const essentiels = [['siret', 'SIRET'], ['adresse', 'adresse'], ['garantie_financiere', 'garantie financière'], ['caisse_retraite', 'caisse de retraite'], ['organisme_prevoyance', 'organisme de prévoyance'], ['iban', 'IBAN']].filter(([k]) => !v[k]);
  const champ = c => {
    const id = 'p-' + c.k, val = v[c.k];
    const aide = c.aide ? `<span class="hint">${esc(c.aide)}</span>` : '';
    if (c.type === 'password') return `<label class="f" for="${id}">${esc(c.l)}<input type="password" id="${id}" name="${c.k}" autocomplete="new-password" placeholder="${val.defini ? 'Enregistré · laisser vide pour le conserver' : ''}">${val.defini ? `<span class="check small"><input type="checkbox" name="effacer" value="${c.k}"> Effacer la valeur enregistrée</span>` : ''}${aide}</label>`;
    if (c.type === 'select') return `<label class="f" for="${id}">${esc(c.l)}<select id="${id}" name="${c.k}">${c.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${aide}</label>`;
    if (c.type === 'textarea') return `<label class="f full" for="${id}">${esc(c.l)}<textarea id="${id}" name="${c.k}" maxlength="1000">${esc(val)}</textarea>${aide}</label>`;
    return `<label class="f" for="${id}">${esc(c.l)}<input type="${c.type === 'number' ? 'text' : c.type || 'text'}" ${c.type === 'number' ? 'inputmode="decimal"' : ''} id="${id}" name="${c.k}" value="${esc(val)}" ${c.req ? 'required' : ''} autocomplete="off">${aide}</label>`;
  };
  const canaux = Object.entries(CANAUX).map(([k, [i, l]]) => `<span class="row small">${ic(i)}${l} ${d.canaux[k] ? badge('libre', 'configuré') : badge('attente', 'simulé')}</span>`).join('');
  return head('Paramètres de l\'agence', 'Informations légales et réglages utilisés pour les contrats, les factures, la paie et l\'envoi des messages.') +
    (essentiels.length ? `<section class="panel" style="border-color:var(--attente-dot)"><div class="task" style="border:0"><div class="ic w">${ic('alert')}</div><div><b>${essentiels.length} information${essentiels.length > 1 ? 's' : ''} manquante${essentiels.length > 1 ? 's' : ''} sur les contrats et factures</b><div class="small muted">${essentiels.map(e => e[1]).join(', ')}</div></div></div></section>` : '') +
    d.groupes.map(g => `<section class="panel"><div class="panel-h"><div><h2>${esc(g.titre)}</h2><div class="small muted">${esc(g.aide)}</div></div>${g.id === 'messagerie' ? `<div class="statusline">${canaux}</div>` : ''}</div>
      ${g.id === 'messagerie' ? `<div class="panel-b prerempli"><span class="small muted">Préremplir l'e-mail :</span>${btn('Gmail (chr-interims@gmail.com)', 'mail', 'data-a="smtppreset" data-p="gmail"', 'sm')}${btn('Brevo', 'mail', 'data-a="smtppreset" data-p="brevo"', 'sm')}${btn('Outlook / Microsoft 365', 'mail', 'data-a="smtppreset" data-p="outlook"', 'sm')}</div>` : ''}
      <form data-f="param" class="panel-b form">${g.champs.map(champ).join('')}<div class="full row"><button class="btn primary" type="submit">${ic('check')}Enregistrer</button></div></form>
      ${g.id === 'messagerie' ? `<form data-f="paramtest" class="panel-b inline-form" style="border-top:1px solid var(--line)"><label class="f" style="flex:0 1 160px">Canal<select name="canal">${['mail', 'sms', 'whatsapp'].map(k => `<option value="${k}">${CANAUX[k][1]}</option>`).join('')}</select></label>
        <label class="f">Destinataire (e-mail ou numéro de téléphone)<input type="text" name="destinataire" required placeholder="vous@exemple.fr ou 06 12 34 56 78"></label><button class="btn" type="submit">${ic('send')}Envoyer un message de test</button></form>
        <div class="panel-b guide" style="border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between"><h3>Mise en service pas à pas</h3><a class="btn sm" href="/api/parametres/apercu-email" target="_blank" rel="noopener">${ic('mail')}Aperçu de l'e-mail avec votre logo</a></div>
        <details><summary><b>1. Adresse du site</b> · indispensable pour les liens et le logo WhatsApp</summary><ol><li>Dans Render, copiez l'adresse du service (en haut de sa page), par exemple <span class="mono">https://chr-interim.onrender.com</span>.</li><li>Collez-la dans « Adresse publique du site » ci-dessus, puis Enregistrer.</li></ol></details>
        <details><summary><b>2. E-mail</b> · avec Brevo (gratuit jusqu'à 300 e-mails par jour) ou votre messagerie</summary><ol><li>Créez un compte sur <a class="link" href="https://www.brevo.com" target="_blank" rel="noopener">brevo.com</a>, puis ajoutez et validez votre domaine (Expéditeurs, domaines et IP dédiées) : Brevo vous donne des enregistrements DNS à copier chez votre hébergeur de nom de domaine.</li><li>Menu « SMTP et API », onglet SMTP : notez le serveur <span class="mono">smtp-relay.brevo.com</span>, le port 587, l'identifiant, et générez une clé SMTP.</li><li>Renseignez ces valeurs ci-dessus, avec l'adresse d'expédition de votre domaine, par exemple <span class="mono">CHR Intérim &lt;missions@votre-domaine.fr&gt;</span>.</li><li>Avec Microsoft 365, Google Workspace ou OVH, utilisez plutôt leurs réglages SMTP (souvent un « mot de passe d'application »).</li></ol></details>
        <details><summary><b>2 bis. E-mail avec Gmail</b> · pour envoyer depuis chr-interims@gmail.com</summary><ol><li>Dans le compte Google chr-interims@gmail.com : Sécurité › activez la validation en deux étapes, puis créez un <b>mot de passe d'application</b> (16 caractères).</li><li>Renseignez ci-dessus : serveur <span class="mono">smtp.gmail.com</span>, port <span class="mono">465</span>, connexion chiffrée « oui », identifiant <span class="mono">chr-interims@gmail.com</span>, mot de passe : le mot de passe d'application, adresse d'expédition <span class="mono">CHR Intérim &lt;chr-interims@gmail.com&gt;</span>.</li><li>Gmail limite l'envoi à environ 500 e-mails par jour.</li></ol></details>
        <details><summary><b>3. SMS</b> · avec Twilio, expéditeur « CHR Interim »</summary><ol><li>Créez un compte sur <a class="link" href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener">twilio.com</a> et ajoutez du crédit (compte payant : un compte d'essai n'envoie qu'aux numéros vérifiés).</li><li>Sur l'accueil de la console, copiez l'<b>Account SID</b> (commence par AC) et l'<b>Auth Token</b>.</li><li>Dans Messaging › Settings › Geo permissions, autorisez la France.</li><li>Laissez « CHR Interim » comme expéditeur : le nom s'affiche à la place d'un numéro. Selon les règles de l'opérateur, Twilio peut demander d'enregistrer ce nom ; sinon, achetez un numéro Twilio et saisissez-le au format +33…</li></ol></details>
        <details><summary><b>4. WhatsApp</b> · avec Twilio et un numéro validé par Meta</summary><ol><li>Dans Twilio : Messaging › Senders › WhatsApp senders, enregistrez votre numéro et reliez-le à votre compte Meta Business (vérification de l'entreprise demandée par Meta, avec le nom et le logo CHR Intérim).</li><li>Une fois le numéro approuvé, saisissez-le dans « Numéro WhatsApp Business ».</li><li>Pour écrire en premier à un intérimaire, WhatsApp impose un modèle de message approuvé : dans Content Template Builder, créez un modèle avec une variable {{1}}, faites-le approuver, puis collez son identifiant HX… ci-dessus.</li><li>Le logo est joint automatiquement à chaque message si « Joindre le logo » est sur oui et que l'adresse du site commence par https.</li></ol></details>
        <details><summary><b>5. Vérifier</b></summary><ol><li>Enregistrez, puis utilisez « Envoyer un message de test » pour chaque canal.</li><li>Le résultat détaillé de chaque envoi (envoyé, simulé, échec avec la raison) apparaît dans la rubrique « Journal des envois ».</li></ol></details></div>` : ''}</section>`).join('');
};

/* ===== Employeur ===== */
V.client.accueil = async () => {
  const [ms, hs, fs, jour] = await Promise.all([GET('/missions'), GET('/heures'), GET('/factures'), GET('/planning/jour')]);
  const cand = ms.filter(m => m.statut === 'diffusee' && m.candidats.some(c => c.etat === 'accepte'));
  const aSigner = ms.flatMap(m => m.candidats.filter(c => c.contrat && c.contrat.statut === 'a_signer' && !c.contrat.client_signe));
  const hA = hs.filter(h => h.ouvert && !h.valide_client), du = fs.filter(f => !f.payee_le);
  return head('Bonjour ' + esc(S.me.nom.split(' ')[0]), esc(S.me.client?.nom || ''), peut('c_demandes') ? btn('Nouvelle demande', 'plus', 'data-a="nav" data-v="demandes"', 'primary') : '') +
    (aSigner.length ? `<section class="panel" style="border-color:var(--attente-dot)"><div class="task" style="border:0"><div class="ic w">${ic('edit')}</div><div><b>${aSigner.length} contrat${aSigner.length > 1 ? 's' : ''} de mission à signer</b><div class="small muted">La mission est validée quand l'intérimaire et vous avez signé.</div></div>${btn('Signer', 'chev', 'data-a="nav" data-v="contrats"', 'sm primary')}</div></section>` : '') +
    `<div class="kpis">${kpi('Intérimaires aujourd\'hui', 'users', jour.length)}${kpi('Candidats à confirmer', 'check', cand.reduce((a, m) => a + m.candidats.filter(c => c.etat === 'accepte').length, 0))}${kpi('Heures à valider', 'clock', hA.length)}${kpi('Factures à régler', 'receipt', eur(du.reduce((a, f) => a + f.montant_ttc, 0)))}</div>
    <div class="grid2">${panel('Aujourd\'hui', btn('Planning du jour', 'chev', 'data-a="nav" data-v="jour"', 'sm'), jour.length ? jour.map(j => `<div class="shift"><div class="time"><b>${j.debut}</b>${j.fin}</div><div class="person"><div class="avatar">${initials(j.prenom + ' ' + j.nom)}</div><div><b>${esc(j.prenom)} ${esc(j.nom)}</b><span>${esc(j.poste)}</span></div></div><div></div></div>`).join('') : empty('Personne n\'est prévu aujourd\'hui.'))}
    ${panel('Candidats en attente de votre décision', btn('Mes missions', 'chev', 'data-a="nav" data-v="demandes"', 'sm'), cand.length ? `<div class="list">${cand.map(m => `<div class="li"><div><b>${m.nb_postes} × ${esc(m.poste)}</b><div class="small muted">${fdate(m.date)} · ${m.candidats.filter(c => c.etat === 'accepte').length} candidat(s)</div></div>${btn('Décider', 'chev', 'data-a="nav" data-v="demandes"', 'sm primary')}</div>`).join('')}</div>` : empty('Aucun candidat en attente.'))}</div>`;
};
V.client.demandes = async () => {
  const ms = await GET('/missions'), t = S.cfg?.aujourdhui || '';
  const actives = ms.filter(m => m.statut !== 'annulee' && m.date >= t), passees = ms.filter(m => m.date < t || m.statut === 'annulee');
  return head('Mes missions', 'Envoyez vos besoins. L\'agence les valide et les diffuse, puis vous acceptez ou refusez les intérimaires qui ont accepté la mission.') +
    `<div class="grid-main"><div style="display:flex;flex-direction:column;gap:18px;min-width:0">${actives.map(m => missionCard(m, 'client')).join('') || panel(null, '', empty('Aucune demande en cours.'))}
    ${passees.length ? panel('Historique', '', `<div class="list">${passees.slice(-10).reverse().map(m => `<div class="li"><div><b>${m.nb_postes} × ${esc(m.poste)}</b><div class="small muted">${fdate(m.date)}</div></div>${badge(...missionStatut(m))}</div>`).join('')}</div>`) : ''}</div>
    ${!peut('c_demandes') ? panel('Nouvelle demande', '', `<div class="panel-b small muted">${ic('lock', 'style="width:14px;height:14px;vertical-align:-2px"')} Les demandes de mission passent par l'agence : contactez-la.</div>`) : panel('Nouvelle demande', '', `<form data-f="demande" class="panel-b form"><label class="f">Date<input type="date" name="date" min="${t}" required value="${S.p.dem_date || addDays(t || new Date().toISOString().slice(0, 10), 7)}"></label>
      <label class="f">Poste<input type="text" name="poste" required list="postes-liste" placeholder="Serveur"></label>${listePostes()}
      <label class="f">Début<input type="time" name="debut" value="18:00" required></label><label class="f">Fin<input type="time" name="fin" value="23:30" required></label>
      <label class="f">Nombre de personnes<input type="number" name="nb_postes" value="1" min="1" max="30" required></label><label class="f full">Précisions pour l'agence<textarea name="commentaire" placeholder="Tenue, lieu de rendez-vous…"></textarea></label>
      ${simLive()}<div class="full"><button class="btn primary" type="submit">${ic('send')}Envoyer la demande</button></div></form>`)}</div>`;
};
function rateForm(id, withAxe) {
  return `<form data-f="evaluer" data-id="${id}" class="inline-form" style="margin-top:10px;width:100%"><div><div class="small muted">Note de fin de service</div><div class="rate" data-rate>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-a="star" data-n="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}</div><input type="hidden" name="note"></div>
    <label class="f" style="flex:2 1 200px">Commentaire<input type="text" name="commentaire" maxlength="1000"></label>${withAxe ? '<label class="f">Axe d\'amélioration<input type="text" name="axe" maxlength="200"></label>' : ''}<button class="btn primary" type="submit">Enregistrer la note</button></form>`;
}
V.client.heures = async () => {
  const hs = await GET('/heures');
  return head('Heures et évaluations', 'Validez les heures de chaque intérimaire après la mission, acceptez ou refusez les heures supplémentaires déclarées, puis notez le service.') +
    panel(null, '', hs.length ? hs.map(h => `<div class="shift"><div class="time"><b>${h.debut}</b>${h.fin}</div><div><div class="person"><div class="avatar">${initials(h.prenom + ' ' + h.interim_nom)}</div><div><b>${esc(h.prenom)} ${esc(h.interim_nom)}</b><span>${fdate(h.date)} · ${esc(h.poste)} · ${num(h.heures_prevues)} h prévues${h.extra ? ` · +${num(h.extra)} h déclarées` : ''}</span></div></div>
    ${h.extra_statut === 'attente' ? `<div class="extra" style="grid-template-columns:1fr"><div class="small"><b>Justification :</b> ${esc(h.justification)}</div></div>` : ''}
    ${h.valide_client && !h.note_client ? rateForm(h.id, true) : h.note_client ? `<div class="row small" style="margin-top:6px">Votre note : ${stars(h.note_client)}</div>` : ''}</div>
    <div class="row">${!h.ouvert ? badge('off', 'Mission à venir') : h.valide_client ? badge('libre', 'Heures validées') : h.extra_statut === 'attente' ? btn('Refuser l\'extra', '', `data-a="hval" data-id="${h.id}" data-x="0"`, 'sm') + btn('Accepter et valider', 'check', `data-a="hval" data-id="${h.id}" data-x="1"`, 'sm primary') : btn('Valider les heures', 'check', `data-a="hval" data-id="${h.id}"`, 'sm primary')}</div></div>`).join('') : empty('Aucune mission terminée pour le moment.'));
};
V.client.interimaires = async () => {
  const L = await GET('/interimaires');
  const K = { deja: ['libre', 'Déjà venu chez vous', 'k-deja'], voir: ['attente', 'Candidat à voir', 'k-voir'], nouveau: ['pris', 'Nouvel inscrit', 'k-nouveau'] };
  return head('Intérimaires', 'Intérimaires déjà venus chez vous, candidats à vos missions et nouveaux inscrits de votre secteur. Vos notes privées ne sont visibles que par vous.') +
    (L.length ? `<div class="grid3">${L.map(i => `<article class="card ${K[i.categorie][2]}"><div class="row" style="justify-content:space-between;align-items:flex-start"><div class="person"><div class="avatar">${initials(i.prenom + ' ' + i.nom)}</div><div><b>${esc(i.prenom)} ${esc(i.nom)}</b><span>${esc(i.poste)}</span></div></div>${badge(K[i.categorie][0], K[i.categorie][1])}</div>
    <div class="small">${esc(i.competences || '')}</div><div class="row" style="justify-content:space-between">${stars(i.note)}<span class="small muted">${i.nb_chez_vous} mission${i.nb_chez_vous > 1 ? 's' : ''} chez vous</span></div>
    <form data-f="noteprivee" data-id="${i.id}" style="display:flex;flex-direction:column;gap:6px"><label class="private"><span class="h">${ic('lock')}Note privée</span><textarea name="texte" rows="2" maxlength="2000" placeholder="Visible uniquement par vous">${esc(i.note_privee)}</textarea></label><button class="btn sm" type="submit">Enregistrer la note</button></form></article>`).join('')}</div>` : panel(null, '', empty('Aucun intérimaire pour le moment.')));
};
V.client.factures = async () => {
  const fs = await GET('/factures');
  return head('Factures', 'Calculées à partir des heures que vous avez validées.', ro('Consultation uniquement')) +
    panel(null, '', fs.length ? `<div class="scroll"><table><thead><tr><th>N°</th><th>Période</th><th>Échéance</th><th class="r">TTC</th><th>Statut</th><th></th></tr></thead><tbody>${fs.map(x => `<tr><td class="mono">${x.numero}</td><td>${fdate(x.debut, 'num')} – ${fdate(x.fin, 'num')}</td><td>${fdate(x.echeance, 'num')}</td><td class="r num"><b>${eur(x.montant_ttc)}</b></td><td>${x.payee_le ? badge('libre', 'Payée') : x.en_retard ? badge('danger', 'En retard') : badge('attente', 'À régler')}</td><td class="r"><a class="btn sm ghost" href="/api/factures/${x.id}/document" target="_blank" rel="noopener">${ic('file')}Voir</a></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune facture.'));
};
V.client.contrat = async () => {
  const [[c], cc] = await Promise.all([GET('/clients'), GET('/contrats-clients')]);
  const aSigner = cc.contrats.find(k => k.statut === 'a_signer');
  return head('Mon contrat', 'Conditions convenues avec l\'agence.') +
    (aSigner ? `<section class="panel" style="border-color:var(--attente-dot)"><div class="task" style="border:0"><div class="ic w">${ic('edit')}</div><div><b>Contrat à signer : coefficient ${num(aSigner.coefficient)}, paiement à ${aSigner.delai_paiement} jours</b><div class="small muted">Il remplacera les conditions actuelles dès votre signature.</div></div>${btn('Signer', 'chev', `data-a="ccsign" data-id="${aSigner.id}"`, 'sm primary')}</div></section>` : '') +
    contratsClientPanel(c, cc, 'client') +
    panel('Conditions', '', `<div class="panel-b"><dl class="kv"><dt>Raison sociale</dt><dd>${esc(c.nom)}</dd><dt>SIRET</dt><dd>${esc(c.siret || '—')}</dd><dt>Secteur</dt><dd>${esc(c.secteur)}</dd><dt>Convention collective</dt><dd>${esc(c.convention)}</dd><dt>Coefficient de facturation</dt><dd><b>${num(c.coefficient)}</b> <span class="small muted">${origineCoef(cc)}</span></dd><dt>Délai de paiement</dt><dd>${c.delai_paiement} jours</dd><dt>Facturation</dt><dd>Par quinzaine, sur heures validées</dd></dl></div>`);
};
V.client.contrats = async () => {
  const ks = await GET('/contrats'), a = ks.filter(k => k.statut === 'a_signer' && !k.client_signe_le);
  return head('Contrats de mission', 'Un contrat est établi pour chaque intérimaire retenu. Signez-le en ligne : la mission est validée quand l\'intérimaire et vous avez signé. Les contrats signés restent consultables ici.') +
    (a.length ? panel(`À signer (${a.length})`, '', contratsPanel(a)) : '') + panel('Tous les contrats', '', contratsPanel(ks));
};
V.client.documents = async () => {
  const docs = await GET('/documents');
  return head('Documents de prise de poste', 'Règlement intérieur, charte qualité, consignes… Les intérimaires confirmés sur vos missions les reçoivent automatiquement.') +
    panel('Documents en ligne', '', docsTable(docs, true) + uploadForm(null));
};

/* ===== Intérimaire ===== */
V.interim.accueil = async () => {
  const [ms, hs] = await Promise.all([GET('/missions'), GET('/heures')]);
  const t = S.cfg?.aujourdhui || '', pend = ms.filter(m => m.etat === 'a_repondre');
  const next = ms.filter(m => m.etat === 'confirmee' && m.date >= t)[0];
  const aSigner = ms.filter(m => m.etat === 'signature' && !m.contrat?.interim_signe);
  const aConf = hs.filter(h => h.ouvert && !h.valide_interim);
  return head('Bonjour ' + esc(S.me.nom.split(' ')[0]), esc(S.me.interim?.poste || ''), peut('i_indispo') ? btn('Je suis indisponible', 'ban', 'data-a="indispo"', 'btn-indispo') : '') +
    (pend.length ? `<section class="panel" style="border-color:var(--attente-dot)"><div class="task" style="border:0"><div class="ic w">${ic('bell')}</div><div><b>${pend.length} nouvelle${pend.length > 1 ? 's' : ''} mission${pend.length > 1 ? 's' : ''} en attente de votre réponse</b><div class="small muted">Les places sont attribuées aux premiers qui acceptent.</div></div>${btn('Voir', 'chev', 'data-a="nav" data-v="missions"', 'sm primary')}</div></section>` : '') +
    (aSigner.length ? `<section class="panel" style="border-color:var(--attente-dot)"><div class="task" style="border:0"><div class="ic w">${ic('edit')}</div><div><b>${aSigner.length} contrat${aSigner.length > 1 ? 's' : ''} de mission à signer</b><div class="small muted">Votre mission n'est confirmée qu'une fois le contrat signé par vous et l'employeur.</div></div>${btn('Signer', 'chev', 'data-a="nav" data-v="contrats"', 'sm primary')}</div></section>` : '') +
    (next ? `<section class="panel"><div class="hero"><div class="when"><span>${fdate(next.date).split(' ')[0]}</span><b>${Number(next.date.slice(8))}</b><span>${new Date(next.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' })}</span></div><div style="flex:1;min-width:200px"><div class="small muted">Prochaine mission</div><h2 style="font-size:17px">${esc(next.poste)} · ${esc(next.client_nom)}</h2><div class="row small muted">${ic('clock')}${next.debut} – ${next.fin}</div></div>${badge('libre', 'Confirmée')}</div></section>` : '') +
    `<div class="grid2">${panel('Missions proposées', btn('Tout voir', 'chev', 'data-a="nav" data-v="missions"', 'sm'), ms.length ? `<div class="list">${ms.filter(m => m.date >= t).slice(0, 4).map(missionInterim).join('') || empty('Aucune mission à venir.')}</div>` : empty('Aucune proposition pour le moment.'))}
    ${panel('Heures à confirmer', btn('Mes heures', 'chev', 'data-a="nav" data-v="heures"', 'sm'), aConf.length ? `<div class="list">${aConf.map(h => `<div class="li"><div><b>${esc(h.client_nom)}</b><div class="small muted">${fdate(h.date)} · ${h.debut}–${h.fin}</div></div>${btn('Confirmer', 'chev', 'data-a="nav" data-v="heures"', 'sm primary')}</div>`).join('')}</div>` : empty('Tout est à jour.'))}</div>`;
};
V.interim.missions = async () => {
  const ms = await GET('/missions'), t = S.cfg?.aujourdhui || '';
  const a = ms.filter(m => m.date >= t), p = ms.filter(m => m.date < t);
  return head('Missions proposées', 'Acceptez ou refusez les missions envoyées par l\'agence. Après votre acceptation, l\'employeur confirme votre venue ; vous recevez alors les documents.') +
    panel('À venir', '', a.length ? `<div class="list">${a.map(missionInterim).join('')}</div>` : empty('Aucune mission proposée pour le moment.')) +
    (p.length ? panel('Passées', '', `<div class="list">${p.slice(-10).reverse().map(missionInterim).join('')}</div>`) : '');
};
V.interim.heures = async () => {
  const hs = await GET('/heures');
  return head('Mes heures', 'Vos horaires sont ceux prévus par l\'employeur. Si vous avez fait des heures en plus, déclarez-les avec une justification : elles sont payées après accord de l\'employeur.') +
    panel(null, '', hs.length ? hs.map(h => `<div class="shift"><div class="time"><b>${h.debut}</b>${h.fin}</div><div><b>${esc(h.client_nom)}</b><div class="small muted">${fdate(h.date)} · ${esc(h.poste)} · ${num(h.heures_prevues)} h prévues${h.extra ? ` · +${num(h.extra)} h déclarées` : ''}</div>
    ${h.ouvert && !h.valide_interim && peut('i_heures') ? `<form data-f="confirmer" data-id="${h.id}" style="margin-top:8px;display:flex;flex-direction:column;gap:10px"><label class="check"><input type="checkbox" name="avec_extra" data-a="toggleextra"> J'ai fait des heures en plus</label>
      <div class="extra" hidden><label class="f">Heures supplémentaires<input type="number" name="extra" step="0.25" min="0.25" max="8" value="1"></label><label class="f full">Justification<textarea name="justification" maxlength="500"></textarea></label></div>
      <div class="note-etab"><div class="small" style="font-weight:600">Notez l'établissement <span class="req">*</span> <span class="muted" style="font-weight:400">· votre avis aide l'agence à évaluer sa fiabilité</span></div>
        <div class="rate" data-rate>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-a="star" data-n="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}</div><input type="hidden" name="note">
        <div class="small muted">Un point à signaler ? (facultatif)</div><div class="choix">${(S.cfg?.points_etab || []).map(x => `<label><input type="checkbox" name="points" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>
        <label class="f">Commentaire (facultatif)<input type="text" name="commentaire" maxlength="1000"></label></div>
      <div class="err" hidden></div><div><button class="btn primary sm" type="submit">${ic('check')}Confirmer mes heures et envoyer ma note</button></div></form>` : ''}
    ${h.valide_interim && !h.note_interim ? rateForm(h.id, false) : h.note_interim ? `<div class="row small" style="margin-top:6px">Votre note pour l'établissement : ${stars(h.note_interim)}</div>` : ''}</div>
    <div class="row">${!h.ouvert ? badge('off', 'Mission à venir') : !h.valide_interim ? badge('attente', 'À confirmer') : h.extra_statut === 'attente' ? badge('attente', 'Extra en attente de l\'employeur') : h.valide_client ? badge('libre', 'Validé') : badge('pris', 'Confirmé, attente employeur')}</div></div>`).join('') : empty('Aucune mission confirmée pour le moment.'));
};
V.interim.profil = async () => {
  const [[i], xp] = await Promise.all([GET('/interimaires'), GET(`/interimaires/${S.me.interim.id}/experiences`)]);
  return head('Profil et CV', 'Ajoutez vos expériences passées. Chaque mission validée avec l\'agence s\'ajoute toute seule à votre CV.') +
    `<div class="grid2">${panel(`${esc(i.prenom)} ${esc(i.nom)}`, ro(), `<div class="panel-b"><dl class="kv"><dt>Poste</dt><dd>${esc(i.poste)}</dd><dt>Secteur</dt><dd>${esc(i.secteur)}</dd><dt>Ville</dt><dd>${esc(i.ville || '—')}</dd><dt>Téléphone</dt><dd>${esc(i.telephone || '—')}</dd><dt>E-mail</dt><dd>${esc(i.email || '—')}</dd><dt>Taux horaire brut</dt><dd>${eur(i.taux_horaire)}</dd><dt>Note moyenne</dt><dd>${stars(i.note)}</dd><dt>Compétences</dt><dd>${esc(i.competences || '—')}</dd><dt>Dossier</dt><dd>${i.dossier_complet ? badge('libre', 'Complet') : badge('attente', 'Incomplet')}</dd></dl></div>`)}
    ${experiencesPanel(S.me.interim.id, xp)}</div>`;
};
V.interim.contrats = async () => {
  const ks = await GET('/contrats');
  return head('Contrats', 'Un contrat de mission est créé dès que vous êtes retenu(e). Lisez-le puis signez-le en ligne : la mission est confirmée quand l\'employeur a signé aussi. Vos contrats signés restent disponibles ici.') +
    panel(null, '', contratsPanel(ks));
};
V.interim.paie = async () => {
  const [B, EC] = await Promise.all([GET('/bulletins'), GET('/paie/en-cours')]);
  return head('Paie', 'Vos fiches de paie par quinzaine. Une alerte signale les heures non validées, qui bloquent le paiement.') +
    panel('En attente de paiement', '', EC.length ? `<div class="list">${EC.map(p => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:220px"><b>Quinzaine du ${fdate(p.debut, 'num')} au ${fdate(p.fin, 'num')}</b>
      <div class="small muted">${num(p.heures)} h validées · environ ${eur(p.total)} brut (congés et fin de mission compris)</div>${alerteHeures(p.bloquees)}</div>
      <div class="row">${p.bloquees.length ? badge('danger', 'Heures non validées') : badge('attente', 'Fiche en préparation')}${p.bloquees.some(x => x.manque === 'Confirmation de vos heures') ? btn('Confirmer mes heures', 'chev', 'data-a="nav" data-v="heures"', 'sm primary') : ''}</div></div>`).join('')}</div>` : empty('Rien en attente : toutes vos heures sont sur une fiche de paie.')) +
    panel('Mes fiches de paie', '', B.length ? `<div class="list">${B.map(b => `<div class="li" style="flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:220px"><b>Du ${fdate(b.debut, 'num')} au ${fdate(b.fin, 'num')}</b>
      <div class="small muted">${num(b.heures)} h · brut ${eur(b.brut)} · fin de mission ${eur(b.ifm)} · congés payés ${eur(b.iccp)} · <b>total brut ${eur(b.total)}</b></div>${alerteHeures(b.bloquees)}</div>
      <div class="row">${b.bloquees.length ? `<span title="Heures non validées sur cette période">${ic('alert', 'style="color:var(--danger-dot)"')}</span>` : ''}${BULL_ST(b)}${b.a_fichier ? `<a class="btn sm" href="/api/bulletins/${b.id}/fichier">${ic('download')}Fiche PDF</a>` : '<span class="small muted">PDF à venir</span>'}</div></div>`).join('')}</div>` : empty('Aucune fiche de paie pour le moment.'));
};
V.interim.documents = async () => {
  const [d, types] = await Promise.all([GET(`/interimaires/${S.me.interim.id}/pieces`), piecesTypes()]);
  return head('Téléverser mes documents', 'Déposez ici les pièces obligatoires pour signer un contrat de mission. L\'agence les vérifie ; un document refusé indique la raison.') + piecesPanel(S.me.interim.id, d, types);
};
V.interim.avis = async () => {
  const L = await GET('/evaluations');
  const recus = L.filter(e => e.sens === 'client_vers_interim'), donnes = L.filter(e => e.sens === 'interim_vers_client');
  const moy = recus.length ? recus.reduce((a, e) => a + e.note, 0) / recus.length : 0;
  return head('Avis', 'Les avis des employeurs vous parviennent de façon anonyme. Vos notes sur les établissements sont transmises à l\'agence.') +
    `<div class="grid2">${panel('Avis reçus', recus.length ? `<span>${stars(moy)} <b class="num">${num(moy)}</b> / 5</span>` : '', recus.length ? `<div class="list">${recus.map(e => `<div class="li" style="align-items:flex-start"><div><div class="small muted">Employeur anonyme · ${esc(e.client_secteur)} · ${fdate(e.date, 'num')}</div><div>${esc(e.commentaire || '')}</div>${e.axe ? `<div style="margin-top:6px">${badge('attente', 'Axe de progrès : ' + esc(e.axe))}</div>` : ''}</div>${stars(e.note)}</div>`).join('')}</div>` : empty('Aucun avis pour le moment.'))}
    ${panel('Mes notes sur les établissements', '', donnes.length ? `<div class="list">${donnes.map(e => `<div class="li"><div><b>${esc(e.client_nom)}</b><div class="small muted">${fdate(e.date, 'num')} · ${esc(e.commentaire || '')}</div></div>${stars(e.note)}</div>`).join('')}</div>` : empty('Notez un établissement depuis « Mes heures », après une mission.'))}</div>`;
};


/* ---------------- Prospects : questionnaire établissement (page publique et visites terrain) ---------------- */
/** Formulaire construit à partir du questionnaire servi par l'API. */
function questionnaireHtml(Q) {
  const champ = c => {
    const skip = c.skip ? ' data-skip' : '', id = 'q-' + c.k;
    if (c.type === 'radio' || c.type === 'checks') {
      const t = c.type === 'radio' ? 'radio' : 'checkbox', opts = [...c.options, ...(c.autre ? ['Autre'] : [])];
      return `<fieldset class="q full"${skip}><legend>${esc(c.l)}${c.type === 'checks' ? ' <span class="small muted">(plusieurs choix possibles)</span>' : ''}</legend>
        <div class="choix">${opts.map(o => `<label><input type="${t}" name="${c.k}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>
        ${c.autre ? `<input type="text" name="${c.k}_autre" maxlength="200" placeholder="Précisez" hidden>` : ''}</fieldset>`;
    }
    if (c.type === 'bool') return `<label class="check q-bool full"${skip}><input type="checkbox" name="${c.k}" value="oui"><span>${esc(c.l)}</span></label>`;
    if (c.type === 'select') return `<label class="f full"${skip} for="${id}">${esc(c.l)}<select id="${id}" name="${c.k}"><option value="">—</option>${[...Q.flatMap(x => x.champs).find(x => x.k === c.from).options, 'Autre'].map(o => `<option>${esc(o)}</option>`).join('')}</select></label>`;
    if (c.type === 'textarea') return `<label class="f full"${skip} for="${id}">${esc(c.l)}<textarea id="${id}" name="${c.k}" maxlength="2000"></textarea></label>`;
    return `<label class="f"${skip} for="${id}"><span>${esc(c.l)}${c.req ? ' <span class="req">*</span>' : ''}</span><input id="${id}" type="${c.type === 'number' ? 'number' : c.type}" name="${c.k}" ${c.type === 'number' ? 'min="0" step="0.01" inputmode="decimal"' : ''} ${c.req ? 'required' : ''} ${c.k === 'email' ? 'autocomplete="email"' : c.k === 'telephone' ? 'autocomplete="tel"' : ''}></label>`;
  };
  return Q.map(sec => `<section class="q-sec"${sec.skip ? ' data-skip' : ''}><h2>${esc(sec.titre)}</h2><div class="form">${sec.champs.map(champ).join('')}</div></section>`).join('');
}
/** Réponses du formulaire : cases à cocher multiples en tableaux. */
function lireQuestionnaire(fd) {
  const o = {};
  for (const [k, v] of fd) { if (v === '') continue; if (k in o) o[k] = [].concat(o[k], v); else o[k] = v; }
  for (const k of ['postes', 'canaux', 'problemes', 'services']) if (o[k] && !Array.isArray(o[k])) o[k] = [o[k]];
  if (o.consentement) o.consentement = true;
  return o;
}
let AGENCE_PUB = null;
/** Page publique de contact, deux onglets : établissement (besoin de renforts) ou intérimaire (candidature). */
async function renderContact(onglet) {
  $('#app').hidden = true; $('#auth').hidden = false;
  const cand = onglet === 'candidat';
  document.title = (cand ? 'Candidature intérimaire' : 'Besoin de renforts ?') + ' · CHR Intérim';
  try { history.replaceState(null, '', cand ? '/candidature' : '/contact'); } catch { /* ignoré */ }
  let d, q; try { [d, q] = await Promise.all([GET('/public/questionnaire'), cand ? GET('/public/candidature') : null]); } catch { d = null; }
  if (!d) { $('#auth').innerHTML = '<div class="auth"><div class="auth-card"><p>Page momentanément indisponible. Réessayez dans un instant.</p></div></div>'; return; }
  AGENCE_PUB = { ...d.agence, cand };
  const a = d.agence, joindre = [a.telephone && `<a class="link" href="tel:${esc(a.telephone.replace(/\s/g, ''))}">${esc(a.telephone)}</a>`, a.email && `<a class="link" href="mailto:${esc(a.email)}">${esc(a.email)}</a>`].filter(Boolean).join(' · ');
  const onglets = `<div class="contact-tabs" role="tablist"><button type="button" role="tab" aria-selected="${!cand}" data-a="contactonglet" data-o="etablissement">${ic('building')}Je suis un établissement</button><button type="button" role="tab" aria-selected="${cand}" data-a="contactonglet" data-o="candidat">${ic('idcard')}Je cherche des missions</button></div>`;
  const intro = cand
    ? `<h1>Rejoignez nos intérimaires</h1><p class="muted" style="margin-top:6px">Serveur, cuisinier, plongeur, barman, réceptionniste, femme de chambre… Trouvez des missions dans les hôtels, cafés et restaurants près de chez vous, au taux horaire de la convention HCR. <b>5 minutes</b> : seuls votre nom, votre téléphone et votre ville sont obligatoires.</p>`
    : `<h1>Besoin de renforts ?</h1><p class="muted" style="margin-top:6px">Hôtels, cafés, restaurants, traiteurs : parlez-nous de votre établissement et de vos besoins en extras. Nous vous recontactons rapidement avec des profils qualifiés. <b>5 minutes</b>, seul le nom de l'établissement, le vôtre et un moyen de vous joindre sont obligatoires.</p>`;
  const consent = cand
    ? `J'accepte que mes informations et mon CV soient conservés par ${esc(a.nom)} pour me proposer des missions. Je peux à tout moment demander leur modification ou leur suppression${a.email ? ` à ${esc(a.email)}` : ''}.`
    : `J'accepte que mes coordonnées et mes réponses soient conservées par ${esc(a.nom)} pour être recontacté(e) au sujet de mes besoins et de ses offres. Je peux à tout moment demander leur modification ou leur suppression${a.email ? ` à ${esc(a.email)}` : ''}.`;
  $('#auth').innerHTML = `<div class="auth contact"><a class="auth-banner-lien" href="/" title="Accueil"><picture class="auth-banner"><source media="(max-width: 600px)" srcset="/img/bandeau-mobile.png" width="1080" height="600"><img class="auth-logo" src="/img/bandeau-horizontal.png" alt="${esc(a.nom)}, spécialiste des métiers HCR" width="1200" height="267"></picture></a>
    <div class="auth-card contact-card">${onglets}
      <div>${intro}${joindre ? `<p class="small" style="margin-top:8px">${cand ? 'Une question ? Appelez-nous' : 'Une urgence ? Appelez-nous'} : ${joindre}</p>` : ''}</div>
      <form data-f="${cand ? 'candidature' : 'contact'}" novalidate>${questionnaireHtml(cand ? q.questionnaire : d.questionnaire)}
        ${cand ? `<section class="q-sec"><h2>Votre CV</h2><label class="f">CV (facultatif : PDF, Word ou photo, 5 Mo maximum)<input type="file" name="cv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label></section>` : ''}
        <input type="text" name="site_web" tabindex="-1" autocomplete="off" class="piege" aria-hidden="true">
        <label class="check consent"><input type="checkbox" name="consentement" value="1" required> ${consent}</label>
        <div class="err" role="alert" hidden></div>
        <button class="btn primary" type="submit" style="justify-content:center">${ic('send')}${cand ? 'Envoyer ma candidature' : 'Envoyer ma demande'}</button></form>
      <p class="small muted" style="text-align:center">Vous avez déjà un compte ? <a class="link" href="/">Accéder à votre espace</a></p></div></div>`;
}
function contactMerci() {
  const a = AGENCE_PUB || {};
  if (a.cand) return `<div style="text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center"><div class="merci-ic">${ic('check')}</div><h1>Merci, votre candidature est envoyée</h1>
    <p class="muted">Notre équipe l'étudie et vous rappelle pour un court entretien. Préparez votre pièce d'identité, votre carte Vitale et un RIB : ils vous seront demandés pour votre inscription.</p>
    <a class="btn" href="/">Retour à l'accueil</a></div>`;
  return `<div style="text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center"><div class="merci-ic">${ic('check')}</div><h1>Merci, votre demande est envoyée</h1>
    <p class="muted">Notre équipe vous recontacte très vite pour préparer vos renforts.${a.telephone ? ` Pour une urgence : <a class="link" href="tel:${esc(a.telephone.replace(/\s/g, ''))}">${esc(a.telephone)}</a>.` : ''}</p>
    <a class="btn" href="/">Retour à l'accueil</a></div>`;
}

const P_ST = { nouveau: ['danger', 'À analyser'], a_relancer: ['attente', 'À relancer'], en_discussion: ['libre', 'Acceptée · RDV'], client: ['libre', 'Client'], perdu: ['off', 'Refusée'] };
V.agence.prospects = async () => {
  const L = await GET('/prospects'), t = S.cfg?.aujourdhui || '';
  const f = S.p.pf || 'nouveau', vis = L.filter(x => f === 'tous' || (f === 'actifs' ? !['client', 'perdu'].includes(x.statut) : x.statut === f));
  const dus = L.filter(x => x.date_relance && x.date_relance <= t && !['client', 'perdu'].includes(x.statut)).length;
  return head('Candidatures clients', 'Établissements qui demandent des renforts (page publique <a class="link" href="/contact" target="_blank" rel="noopener">/contact</a>) et visites terrain. Acceptez (e-mail de proposition de rendez-vous sous 48 h) ou refusez (e-mail de refus), puis créez la fiche client.', btn('Nouvelle visite terrain', 'plus', 'data-a="visite"', 'primary')) +
    `<div class="kpis">${kpi('Prospects actifs', 'target', L.filter(x => !['client', 'perdu'].includes(x.statut)).length)}${kpi('À relancer aujourd\'hui', 'clock', dus, dus ? 'Relances en retard ou du jour' : 'À jour', dus ? 'down' : '')}${kpi('Demandes du site', 'send', L.filter(x => x.source === 'site').length)}${kpi('Devenus clients', 'building', L.filter(x => x.statut === 'client').length)}</div>` +
    panel(null, `<div class="seg">${[['nouveau', `À analyser (${L.filter(x => x.statut === 'nouveau').length})`], ['a_relancer', 'À relancer'], ['en_discussion', 'Rendez-vous'], ['actifs', 'En cours'], ['client', 'Clients'], ['perdu', 'Refusées'], ['tous', 'Toutes']].map(([k, l]) => `<button type="button" aria-pressed="${f === k}" data-a="pfiltre" data-f="${k}">${l}</button>`).join('')}</div>`,
      vis.length ? `<div class="scroll"><table><thead><tr><th>Établissement</th><th>Contact</th><th>Besoins</th><th>Source</th><th>Relance</th><th>Statut</th><th></th></tr></thead><tbody>
      ${vis.map(x => `<tr class="clickable" data-a="prospect" data-id="${x.id}" tabindex="0"><td><b>${esc(x.etablissement)}</b><div class="small muted">${esc(x.type_etab || '')}${x.adresse ? ' · ' + esc(x.adresse) : ''}</div></td>
        <td>${esc(x.repondant || '—')}<div class="small muted">${esc([x.telephone, x.email].filter(Boolean).join(' · '))}</div></td>
        <td class="small">${x.reponses.vehicule ? badge('attente', 'Intérimaires véhiculés') + '<br>' : ''}${esc(x.reponses.frequence || '—')}${x.reponses.postes ? `<div class="muted">${esc(x.reponses.postes.join(', '))}</div>` : ''}</td>
        <td>${x.source === 'site' ? badge('pris', 'Site') : badge('off', 'Visite')}<div class="small muted">${fdate((x.date_visite || x.created_at).slice(0, 10), 'num')}</div></td>
        <td>${x.date_relance ? (x.date_relance <= t && !['client', 'perdu'].includes(x.statut) ? badge('danger', fdate(x.date_relance, 'num')) : fdate(x.date_relance, 'num')) : '<span class="muted">—</span>'}</td>
        <td>${badge(...P_ST[x.statut])}${decisionInfo(x)}</td><td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${boutonsDecision('prospect', x)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune candidature dans cette liste.'));
};
async function prospectModal(id) {
  const [L, d] = await Promise.all([GET('/prospects'), GET('/public/questionnaire')]);
  const x = L.find(p => p.id === id); if (!x) return;
  const r = x.reponses, val = c => { const v = r[c.k]; if (v === undefined || v === '') return null; const t = Array.isArray(v) ? v.join(', ') : v === true ? 'Oui' : String(v); return r[c.k + '_autre'] ? `${t} (${r[c.k + '_autre']})` : t; };
  const secs = d.questionnaire.map(sec => { const L2 = sec.champs.map(c => [c.l, val(c)]).filter(([, v]) => v); return L2.length ? `<h3 class="q-titre">${esc(sec.titre)}</h3><dl class="kv">${L2.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''; }).join('');
  openModal(`${modalHead(ic('target') + esc(x.etablissement), `${x.source === 'site' ? 'Demande reçue par le site' : `Visite terrain${x.enqueteur ? ' par ' + esc(x.enqueteur) : ''}`} le ${fdate((x.date_visite || x.created_at).slice(0, 10), 'num')} · accord ${x.accord === 'en_ligne' ? 'donné en ligne' : esc(x.accord || '—')}`)}
    <div class="panel-b" style="display:flex;flex-direction:column;gap:6px">${secs}</div>
    <form data-f="psuivi" data-id="${x.id}" class="panel-b form" style="border-top:1px solid var(--line)"><h3 class="q-titre full">Suivi commercial</h3>
      <label class="f">Statut<select name="statut">${Object.entries(P_ST).map(([k, [, l]]) => `<option value="${k}" ${k === x.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Date de relance / prochain contact<input type="date" name="date_relance" value="${x.date_relance || ''}"></label>
      <label class="f full">Notes de l'agence<textarea name="notes_agence" maxlength="3000">${esc(x.notes_agence || '')}</textarea></label>
      ${decisionInfo(x) ? `<div class="full">${decisionInfo(x)}</div>` : ''}
      <div class="full row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div class="row">${boutonsDecision('prospect', x)}${x.client_id ? badge('libre', 'Fiche client créée') : btn('Créer la fiche client', 'building', `data-a="pclient" data-id="${x.id}"`, 'sm')}${btn('Supprimer', 'trash', `data-a="pdel" data-id="${x.id}"`, 'sm danger')}</div>
      <div class="row">${btn('Fermer', '', 'data-a="close"')}<button class="btn primary" type="submit">Enregistrer le suivi</button></div></div></form>`);
}
async function visiteModal() {
  const d = await GET('/public/questionnaire'), t = S.cfg?.aujourdhui || '';
  openModal(`${modalHead(ic('target') + 'Visite terrain', 'Questionnaire étude de marché · intérim et extras HCR · 5 à 7 minutes')}<form data-f="visite" novalidate><div class="panel-b">
    <div class="form"><label class="f">Date de la visite<input type="date" name="date_visite" value="${t}" required></label><label class="f">Enquêteur<input type="text" name="enqueteur" value="${esc(S.me.nom)}"></label></div>
    ${questionnaireHtml(d.questionnaire)}
    <section class="q-sec"><h2>Suivi</h2><div class="form">
      <fieldset class="q full"><legend>Accord pour conserver les coordonnées et recontacter</legend><div class="choix"><label><input type="radio" name="accord" value="ecrit" required><span>Écrit (signature)</span></label><label><input type="radio" name="accord" value="oral"><span>Oral</span></label></div></fieldset>
      <label class="f">Date de relance / prochain contact convenu<input type="date" name="date_relance" min="${t}"></label>
      <label class="f full">Notes et observations<textarea name="notes_agence" maxlength="3000"></textarea></label></div></section>
    <div class="err" hidden></div></div>${modalFoot('Enregistrer la visite', 'type="submit"')}</form>`);
}

const C_ST = { nouveau: ['danger', 'À analyser'], a_rappeler: ['attente', 'À rappeler'], entretien: ['libre', 'Acceptée · RDV'], inscrit: ['libre', 'Inscrit(e)'], refuse: ['off', 'Sans suite'] };
V.agence.candidats = async () => {
  const L = await GET('/candidats'), t = S.cfg?.aujourdhui || '';
  const f = S.p.cf || 'nouveau', vis = L.filter(x => f === 'tous' || (f === 'actifs' ? !['inscrit', 'refuse'].includes(x.statut) : x.statut === f));
  const dus = L.filter(x => x.date_relance && x.date_relance <= t && !['inscrit', 'refuse'].includes(x.statut)).length;
  return head('Candidatures intérimaires', 'Candidatures reçues par la page publique <a class="link" href="/candidature" target="_blank" rel="noopener">/candidature</a>. Acceptez-les (e-mail de demande de rendez-vous sous 48 h) ou refusez-les (e-mail de refus), puis créez la fiche intérimaire.') +
    `<div class="kpis">${kpi('Candidatures actives', 'idcard', L.filter(x => !['inscrit', 'refuse'].includes(x.statut)).length)}${kpi('À rappeler aujourd\'hui', 'clock', dus, dus ? 'Rappels en retard ou du jour' : 'À jour', dus ? 'down' : '')}${kpi('Nouvelles', 'send', L.filter(x => x.statut === 'nouveau').length)}${kpi('Inscrits', 'users', L.filter(x => x.statut === 'inscrit').length)}</div>` +
    panel(null, `<div class="seg">${[['nouveau', `À analyser (${L.filter(x => x.statut === 'nouveau').length})`], ['a_rappeler', 'À rappeler'], ['entretien', 'Rendez-vous'], ['actifs', 'En cours'], ['inscrit', 'Inscrits'], ['refuse', 'Refusées'], ['tous', 'Toutes']].map(([k, l]) => `<button type="button" aria-pressed="${f === k}" data-a="cfiltre" data-f="${k}">${l}</button>`).join('')}</div>`,
      vis.length ? `<div class="scroll"><table><thead><tr><th>Candidat</th><th>Postes</th><th>Disponibilités</th><th>Reçue le</th><th>Rappel</th><th>Statut</th><th></th></tr></thead><tbody>
      ${vis.map(x => `<tr class="clickable" data-a="candidat" data-id="${x.id}" tabindex="0"><td><b>${esc(x.prenom)} ${esc(x.nom)}</b>${x.reponses.vehicule ? ' ' + badge('libre', 'Véhiculé(e)') : ''}<div class="small muted">${esc([x.ville, x.telephone].filter(Boolean).join(' · '))}</div></td>
        <td class="small"><b>${esc(x.poste || '—')}</b>${x.reponses.experience ? `<div class="muted">${esc(x.reponses.experience)}</div>` : ''}</td>
        <td class="small">${esc((x.reponses.creneaux || []).join(', ') || '—')}${x.reponses.type_mission ? `<div class="muted">${esc(x.reponses.type_mission)}</div>` : ''}</td>
        <td>${fdate(x.created_at.slice(0, 10), 'num')}${x.cv_fichier ? `<div class="small muted">${ic('file', 'style="width:12px;height:12px;vertical-align:-2px"')} CV joint</div>` : ''}</td>
        <td>${x.date_relance ? (x.date_relance <= t && !['inscrit', 'refuse'].includes(x.statut) ? badge('danger', fdate(x.date_relance, 'num')) : fdate(x.date_relance, 'num')) : '<span class="muted">—</span>'}</td>
        <td>${badge(...C_ST[x.statut])}${decisionInfo(x)}</td><td class="r"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${boutonsDecision('candidat', x)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Aucune candidature dans cette liste.'));
};
async function candidatModal(id) {
  const [L, d] = await Promise.all([GET('/candidats'), GET('/public/candidature')]);
  const x = L.find(c => c.id === id); if (!x) return;
  const r = x.reponses, val = c => { const v = r[c.k]; if (v === undefined || v === '') return null; const t = Array.isArray(v) ? v.join(', ') : v === true ? 'Oui' : c.type === 'date' ? fdate(v, 'num') : String(v); return r[c.k + '_autre'] ? `${t} (${r[c.k + '_autre']})` : t; };
  const secs = d.questionnaire.map(sec => { const L2 = sec.champs.map(c => [c.l, val(c)]).filter(([, v]) => v); return L2.length ? `<h3 class="q-titre">${esc(sec.titre)}</h3><dl class="kv">${L2.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''; }).join('');
  openModal(`${modalHead(ic('idcard') + `${esc(x.prenom)} ${esc(x.nom)}`, `Candidature reçue le ${fdate(x.created_at.slice(0, 10), 'num')} · ${esc(x.poste || 'poste non précisé')}`)}
    <div class="panel-b" style="display:flex;flex-direction:column;gap:6px">${x.cv_fichier ? `<a class="btn sm" style="align-self:flex-start" href="/api/candidats/${x.id}/cv">${ic('download')}Télécharger le CV</a>` : ''}${secs}</div>
    <form data-f="csuivi" data-id="${x.id}" class="panel-b form" style="border-top:1px solid var(--line)"><h3 class="q-titre full">Suivi du recrutement</h3>
      <label class="f">Statut<select name="statut">${Object.entries(C_ST).map(([k, [, l]]) => `<option value="${k}" ${k === x.statut ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Date de rappel / d'entretien<input type="date" name="date_relance" value="${x.date_relance || ''}"></label>
      <label class="f full">Notes de l'agence<textarea name="notes_agence" maxlength="3000">${esc(x.notes_agence || '')}</textarea></label>
      ${decisionInfo(x) ? `<div class="full">${decisionInfo(x)}</div>` : ''}
      <div class="full row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><div class="row">${boutonsDecision('candidat', x)}${x.interim_id ? badge('libre', 'Fiche intérimaire créée') : btn('Créer la fiche intérimaire', 'users', `data-a="cinterim" data-id="${x.id}"`, 'sm')}${btn('Supprimer', 'trash', `data-a="cdel" data-id="${x.id}"`, 'sm danger')}</div>
      <div class="row">${btn('Fermer', '', 'data-a="close"')}<button class="btn primary" type="submit">Enregistrer le suivi</button></div></div></form>`);
}

/* ---------------- Annulation, désistement, indisponibilité imprévue ---------------- */
const RAISONS = {
  annuler: ['Baisse d\'activité', 'Événement annulé', 'Besoin couvert en interne', 'Fermeture exceptionnelle', 'Erreur de demande', 'Autre'],
  desister: ['Maladie', 'Imprévu familial', 'Problème de transport', 'Autre mission ou emploi', 'Autre'],
};
function annulModal(type, id, nom, suite) {
  const client = type === 'annuler', agence = S.me.profil === 'agence';
  openModal(`${modalHead(ic('ban') + (client ? 'Annuler la mission' : 'Me désister de la mission'), esc(nom))}<form data-f="annul" data-t="${type}" data-id="${id}"${suite ? ` data-suite="${esc(JSON.stringify(suite))}"` : ''}><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p class="small">${client ? 'Les intérimaires positionnés sont prévenus et remis à disposition ; les missions ouvertes sur le même créneau leur sont proposées automatiquement.' : 'La place est remise à disposition : l\'employeur, l\'agence et les intérimaires déjà contactés pour cette mission sont prévenus. Prévenez le plus tôt possible.'}</p>
    <fieldset class="q"><legend>Raison${agence ? ' (facultative pour l\'agence)' : ''}</legend><div class="choix">${RAISONS[type].map((r, k) => `<label><input type="radio" name="raison" value="${esc(r)}" ${!agence && k === 0 ? 'required' : ''}><span>${esc(r)}</span></label>`).join('')}</div></fieldset>
    <label class="f">Précision (facultative)<input type="text" name="precision" maxlength="200" placeholder="${client ? 'Ex. : réservation de groupe annulée' : 'Ex. : fièvre depuis ce matin'}"></label>
    <div class="err" hidden></div></div><div class="panel-f" style="justify-content:flex-end">${btn('Retour', '', 'data-a="close"')}<button class="btn primary" type="submit" style="background:var(--danger-dot);border-color:var(--danger-dot)">${ic('ban')}${client ? 'Annuler la mission' : 'Confirmer mon désistement'}</button></div></form>`);
}
function indispoModal() {
  const t = S.cfg?.aujourdhui || '';
  openModal(`${modalHead(ic('ban') + 'Je suis indisponible', 'Un imprévu ? Prévenez l\'agence en un clic.')}<form data-f="indispo"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <fieldset class="q"><legend>Quand ?</legend><div class="choix"><label><input type="radio" name="quand" value="aujourdhui" checked><span>Aujourd'hui</span></label><label><input type="radio" name="quand" value="demain"><span>Demain</span></label><label><input type="radio" name="quand" value="periode"><span>Plusieurs jours</span></label></div></fieldset>
    <div class="form" data-periode hidden><label class="f">Du<input type="date" name="debut" min="${t}" value="${t}"></label><label class="f">Au<input type="date" name="fin" min="${t}" value="${addDays(t, 2)}"></label></div>
    <fieldset class="q"><legend>Raison</legend><div class="choix">${RAISONS.desister.map((r, k) => `<label><input type="radio" name="raison" value="${esc(r)}" ${k === 0 ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div></fieldset>
    <label class="f">Précision (facultative)<input type="text" name="precision" maxlength="200"></label>
    <div class="err" hidden></div></div>${modalFoot(ic('ban') + 'Me déclarer indisponible', 'type="submit"')}</form>`);
}
/** Missions en conflit avec l'indisponibilité : désistement proposé pour chacune. */
function indispoConflits(L, motif) {
  openModal(`${modalHead(ic('alert') + 'Missions sur ces dates', 'Indisponibilité enregistrée. Vous êtes positionné(e) sur ces missions :')}
    <div class="list">${L.map(m => `<div class="li" style="flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>${esc(m.poste)} · ${esc(m.client_nom)}</b><div class="small muted">${fdate(m.date, 'long')} · ${m.debut}–${m.fin}</div></div>
      ${btn('Me désister', 'ban', `data-a="desister1" data-id="${m.id}" data-motif="${esc(motif)}"`, 'sm danger')}</div>`).join('')}</div>
    <div class="panel-f" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="small muted">Sans désistement, vous restez attendu(e) sur ces missions.</span>${btn('Fermer', '', 'data-a="close"', 'primary')}</div>`);
}

/* ---------------- Statistiques (les trois espaces) ---------------- */
const moisCourt = m => new Date(m + '-15T12:00').toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
const moisLong = m => new Date(m + '-15T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
/** Évolution par rapport au mois précédent : texte et sens (hausse / baisse). */
function evolution(v, prec, fmt) {
  if (prec === undefined) return ['', ''];
  if (!prec) return [v ? 'Mois précédent : 0' : 'Rien le mois précédent', ''];
  const d = Math.round((v - prec) / prec * 100);
  return [`${d > 0 ? '+' : ''}${d} % vs ${fmt(prec)} le mois précédent`, d > 0 ? 'up' : d < 0 ? 'down' : ''];
}
const tuile = (t, i, v, fmt, prec, detail) => { const [e, c] = evolution(v, prec, fmt); return kpi(t, i, v === null || v === undefined ? '—' : fmt(v), detail || e, detail ? '' : c); };
const pct = v => v === null || v === undefined ? '—' : num(v) + ' %';
/** Histogramme 6 mois, une seule série : valeur sur chaque barre, info-bulle, tableau des données. */
function histogramme(titre, serie, fmt) {
  const max = Math.max(...serie.map(x => x.valeur), 0) || 1, cur = serie[serie.length - 1].mois;
  return panel(titre, '', `<div class="panel-b"><div class="barres" role="img" aria-label="${esc(titre)} : ${serie.map(x => `${moisLong(x.mois)} ${fmt(x.valeur)}`).join(', ')}">
    ${serie.map(x => `<div class="barre${x.mois === cur ? ' cur' : ''}" title="${esc(moisLong(x.mois))} : ${esc(fmt(x.valeur))}"><span class="barre-v">${x.valeur ? fmt(x.valeur) : ''}</span><span class="barre-b" style="height:${Math.max(x.valeur ? 3 : 0, x.valeur / max * 100)}%"></span><span class="barre-m">${moisCourt(x.mois)}</span></div>`).join('')}</div>
    <details class="donnees"><summary>Voir les données</summary><table><thead><tr><th>Mois</th><th class="r">${esc(titre)}</th></tr></thead><tbody>${serie.map(x => `<tr><td>${moisLong(x.mois)}</td><td class="r num">${fmt(x.valeur)}</td></tr>`).join('')}</tbody></table></details></div>`);
}
/** Classement horizontal (5 premiers). */
function classement(titre, L, fmt, vide) {
  const max = Math.max(...L.map(x => x.valeur), 0) || 1;
  return panel(titre, '', L.length ? `<div class="panel-b classement">${L.map(x => `<div class="cl-l" title="${esc(x.nom)} : ${esc(fmt(x.valeur))}"><span class="cl-n">${esc(x.nom)}</span><span class="cl-b"><span style="width:${x.valeur / max * 100}%"></span></span><span class="cl-v num">${fmt(x.valeur)}</span></div>`).join('')}</div>` : empty(vide));
}
const fmtH = n => num(n) + ' h', eur0 = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
V.agence.stats = async () => {
  const d = await GET('/stats'), k = d.cles;
  return head('Statistiques', `Chiffres clés de ${moisLong(d.mois)} (heures validées par les deux parties), comparés au mois précédent, et évolution sur 6 mois.`) +
    `<div class="kpis">${tuile('Chiffre d\'affaires HT', 'receipt', k.ca_ht, eur0, k.ca_ht_prec)}${tuile('Marge brute estimée', 'chart', k.marge, eur0, undefined, k.marge_pc === null ? 'Aucune heure validée' : `${num(k.marge_pc)} % du chiffre d'affaires`)}
    ${tuile('Heures validées', 'clock', k.heures, fmtH, k.heures_prec)}${tuile('Missions du mois', 'briefcase', k.missions, num, k.missions_prec)}</div>
    <div class="kpis">${tuile('Taux de pourvoi', 'check', k.taux_pourvoi, pct, undefined, 'Missions pourvues sur missions diffusées')}${tuile('Délai moyen de pourvoi', 'clock', k.delai_pourvoi_h, v => v < 48 ? num(v) + ' h' : num(Math.round(v / 24)) + ' j', undefined, 'De la demande au dernier intérimaire retenu')}
    ${tuile('Annulations et désistements', 'ban', k.annulations + k.desistements, num, undefined, `${k.annulations} annulation(s) client · ${k.desistements} désistement(s)`)}${tuile('Contrats signés', 'edit', k.contrats_signes_pc, pct, undefined, `${k.contrats_a_signer} en attente de signature`)}</div>
    <div class="kpis">${tuile('Intérimaires actifs ce mois', 'users', k.interimaires_actifs, num, undefined, `sur ${k.interimaires_total} inscrits · dossiers complets ${pct(k.dossiers_complets_pc)}`)}${tuile('Encours clients TTC', 'wallet', k.encours_ttc, eur0, undefined, k.retard_ttc ? `dont ${eur0(k.retard_ttc)} en retard` : 'Aucun retard')}
    ${tuile('Prospects actifs', 'target', k.prospects_actifs, num)}${tuile('Candidatures du mois', 'idcard', k.candidatures_mois, num)}</div>
    <div class="grid2">${histogramme('Chiffre d\'affaires HT', d.series.ca_ht, eur0)}${histogramme('Heures validées', d.series.heures, fmtH)}</div>
    <div class="grid2">${histogramme('Missions (hors annulées)', d.series.missions, num)}${classement('Meilleurs clients de l\'année (CA HT)', d.tops.clients, eur0, 'Aucune heure facturable cette année.')}</div>
    ${classement('Postes les plus demandés (6 mois, en postes)', d.tops.postes, num, 'Aucune mission.')}
    <h2 class="stats-titre">${ic('star')}Notes et fiabilité</h2>
    <div class="kpis">${tuile('Note moyenne des intérimaires', 'star', d.notes.interimaires.moyenne, v => num(v) + ' / 5', undefined, `${d.notes.interimaires.nombre} avis des employeurs`)}${tuile('Note moyenne des établissements', 'building', d.notes.clients.moyenne, v => num(v) + ' / 5', undefined, `${d.notes.clients.nombre} avis des intérimaires (fiabilité)`)}
    ${kpi('Notes basses du mois', 'alert', d.notes.basses_mois, 'Avis à 2 étoiles ou moins', d.notes.basses_mois ? 'down' : '')}${kpi('Notes basses au total', 'alert', d.notes.interimaires.basses + d.notes.clients.basses, `${d.notes.interimaires.basses} intérimaire(s) · ${d.notes.clients.basses} établissement(s)`, d.notes.interimaires.basses + d.notes.clients.basses ? 'down' : '')}</div>
    <div class="grid2">${classement('Répartition des notes des intérimaires', d.notes.interimaires.repartition, num, 'Aucun avis.')}${classement('Répartition des notes des établissements', d.notes.clients.repartition, num, 'Aucun avis.')}</div>
    <div class="grid2">${classement('Intérimaires les moins bien notés', d.notes.interimaires_bas, v => num(v) + ' / 5', 'Aucun avis.')}${classement('Établissements les moins bien notés', d.notes.clients_bas, v => num(v) + ' / 5', 'Aucun avis.')}</div>` + visitesStats(d.visites);
};
/** Section « Visites du site et origines » : clics sur les liens du site, par origine et par page, demandes envoyées, liens à partager. */
function visitesStats(v) {
  const base = location.origin, pc1 = x => x.taux === null ? '—' : num(x.taux) + ' %';
  const LIENS = [['/contact', 'Page établissements'], ['/candidature', 'Page candidats'], ['/', 'Page de connexion']];
  const ORIG = [['facebook', 'Facebook'], ['mail', 'E-mail'], ['sms', 'SMS']];
  return `<h2 class="stats-titre">${ic('link')}Visites du site et origines</h2>
    <div class="kpis">${tuile('Visites du mois', 'eye', v.mois, num, v.mois_prec)}${tuile('Demandes envoyées depuis le site', 'send', v.demandes, num, v.demandes_prec)}
    ${tuile('Taux de transformation', 'target', v.taux, pct, undefined, 'Demandes sur visites des pages établissements et candidats')}${kpi('Première origine du mois', 'chart', v.principale ? esc(v.principale.nom) : '—', v.principale ? `${num(v.principale.valeur)} visite${v.principale.valeur > 1 ? 's' : ''} sur ${num(v.mois)}` : 'Aucune visite ce mois-ci')}</div>
    <div class="grid2">${histogramme('Visites (clics sur les liens du site)', v.serie, num)}${classement(`Origine des visites de ${moisLong(S.cfg?.aujourdhui?.slice(0, 7) || v.serie[v.serie.length - 1].mois)}`, v.sources, num, 'Aucune visite ce mois-ci.')}</div>
    <div class="grid2">${panel('Origines sur 6 mois', '', v.sources6.length ? `<div class="scroll"><table><thead><tr><th>Origine</th><th class="r">Visites</th><th class="r">Demandes</th><th class="r">Transformation</th></tr></thead><tbody>${v.sources6.map(x => `<tr><td>${esc(x.nom)}</td><td class="r num">${num(x.valeur)}</td><td class="r num">${num(x.demandes)}</td><td class="r num">${pc1(x)}</td></tr>`).join('')}</tbody></table></div>` : empty('Aucune visite sur les 6 derniers mois.'))}
    ${classement('Pages visitées ce mois-ci', v.pages.map(x => ({ nom: x.nom + (x.cle === 'connexion' ? '' : ` · ${x.demandes} demande${x.demandes > 1 ? 's' : ''}`), valeur: x.valeur })), num, 'Aucune visite.')}</div>
    ${panel('Liens à partager pour connaître l\'origine des visites', '', `<div class="panel-b"><p class="small muted">Utilisez ces liens dans vos publications Facebook, vos e-mails et vos SMS : chaque clic est rangé dans la bonne origine. Les QR codes imprimés sont comptés dans « QR code ». Une adresse tapée directement ou ouverte depuis un favori est comptée dans « Adresse du site ». Aucune donnée personnelle n'est enregistrée (ni adresse IP, ni cookie).</p></div>
      <div class="scroll"><table class="liens-suivi"><thead><tr><th>Page</th>${ORIG.map(o => `<th>${o[1]}</th>`).join('')}</tr></thead><tbody>${LIENS.map(([p, n]) => `<tr><td><b>${n}</b><div class="small muted mono">${esc(base + p)}</div></td>${ORIG.map(([k, l]) => { const u = `${base}${p}?src=${k}`; return `<td>${btn('Copier', 'link', `data-a="copy" data-t="${esc(u)}" title="${esc(u)}" aria-label="Copier le lien ${esc(l)} de la ${esc(n.toLowerCase())}"`, 'sm')}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`)}`;
}
V.client.stats = async () => {
  const d = await GET('/stats'), k = d.cles;
  return head('Statistiques', `Vos chiffres de ${moisLong(d.mois)} (heures validées), comparés au mois précédent, et votre activité sur l'année.`) +
    `<div class="kpis">${tuile('Dépenses HT du mois', 'receipt', k.depenses_ht, eur0, k.depenses_ht_prec)}${tuile('Dépenses TTC de l\'année', 'wallet', k.depenses_an_ttc, eur0)}
    ${tuile('Heures du mois', 'clock', k.heures, fmtH, undefined, `${fmtH(k.heures_an)} sur l'année`)}${tuile('Coût horaire moyen HT', 'chart', k.cout_horaire_ht, eur, undefined, 'Majorations comprises')}</div>
    <div class="kpis">${tuile('Missions de l\'année', 'briefcase', k.missions_an, num, undefined, `${k.missions_mois} ce mois-ci · ${k.annulations_an} annulée(s)`)}${tuile('Taux de pourvoi', 'check', k.taux_pourvoi, pct, undefined, 'Missions pourvues sur missions diffusées')}
    ${tuile('Intérimaires venus', 'users', k.interimaires_differents, num, undefined, `${k.interimaires_fideles} revenu(s) au moins 2 fois`)}${tuile('Note moyenne donnée', 'star', k.note_donnee, v => num(v) + ' / 5', undefined, k.note_recue ? `Note reçue des intérimaires : ${num(k.note_recue)} / 5` : 'Aucune note reçue pour l\'instant')}</div>
    <div class="grid2">${histogramme('Dépenses HT', d.series.depenses_ht, eur0)}${histogramme('Heures validées', d.series.heures, fmtH)}</div>
    ${classement('Vos postes les plus demandés (année, en postes)', d.tops.postes, num, 'Aucune mission cette année.')}
    <h2 class="stats-titre">${ic('star')}Notes</h2>
    <div class="grid2">${classement(`Notes reçues des intérimaires${d.notes.recues.moyenne ? ` · moyenne ${num(d.notes.recues.moyenne)} / 5` : ''}`, d.notes.recues.repartition, num, 'Aucun avis reçu.')}${classement(`Notes que vous avez données${d.notes.donnees.moyenne ? ` · moyenne ${num(d.notes.donnees.moyenne)} / 5` : ''}`, d.notes.donnees.repartition, num, 'Aucune note donnée.')}</div>`;
};
V.interim.stats = async () => {
  const d = await GET('/stats'), k = d.cles;
  return head('Mes statistiques', `Vos chiffres de ${moisLong(d.mois)} (heures validées par vous et l'employeur), comparés au mois précédent. Gains en brut, fin de mission et congés payés compris.`) +
    `<div class="kpis">${tuile('Gains bruts du mois', 'wallet', k.gains_brut, eur0, k.gains_brut_prec)}${tuile('Net estimé du mois', 'wallet', k.net_estime_mois, eur0, undefined, 'Estimation avant impôt')}
    ${tuile('Heures du mois', 'clock', k.heures, fmtH, undefined, `${fmtH(k.heures_an)} sur l'année`)}${tuile('Gains bruts de l\'année', 'chart', k.gains_an, eur0)}</div>
    <div class="kpis">${tuile('Missions réalisées', 'briefcase', k.missions_an, num, undefined, `${k.missions_mois} ce mois-ci · ${k.missions_a_venir} à venir`)}${tuile('Établissements', 'building', k.etablissements, num, undefined, 'Différents cette année')}
    ${tuile('Taux d\'acceptation', 'check', k.taux_acceptation, pct, undefined, `Missions acceptées sur missions proposées${k.desistements ? ` · ${k.desistements} désistement(s)` : ''}`)}${tuile('Note moyenne', 'star', k.note, v => num(v) + ' / 5', undefined, 'Avis des employeurs')}</div>
    <div class="grid2">${histogramme('Gains bruts', d.series.gains_brut, eur0)}${histogramme('Heures validées', d.series.heures, fmtH)}</div>
    <div class="grid2">${classement('Mes postes (heures de l\'année)', d.tops.postes, fmtH, 'Aucune heure validée cette année.')}${classement(`Mes notes${d.notes.recues.moyenne ? ` · moyenne ${num(d.notes.recues.moyenne)} / 5` : ''}`, d.notes.recues.repartition, num, 'Aucun avis reçu.')}</div>`;
};

/* ---------------- Avis : note globale, dernier avis, alerte note basse ---------------- */
const noteBasse = n => n !== null && n !== undefined && n < 3;
const alerteNote = n => noteBasse(n) ? `<span class="alerte-note" title="Note moyenne basse">${ic('alert')}${num(n)}</span>` : '';
function avisPanel(A, titre) {
  const bas = noteBasse(A.moyenne) || A.basses;
  const ligne = a => `<div class="avis-l"><div class="row" style="justify-content:space-between;gap:8px"><b>${stars(a.note)} <span class="small">${a.note}/5</span></b><span class="small muted">${fdate(a.date, 'num')} · ${esc(a.poste)}</span></div>
    <div class="small muted">${esc(titre === 'client' ? `${a.prenom} ${a.interim_nom}` : a.client_nom)}</div>${a.axe ? `<div class="small" style="color:var(--danger-fg)">${esc(a.axe)}</div>` : ''}${a.commentaire ? `<div class="small">« ${esc(a.commentaire)} »</div>` : ''}</div>`;
  const max = Math.max(...A.repartition.map(r => r.nombre), 1);
  return panel(titre === 'client' ? 'Avis des intérimaires' : 'Avis des employeurs', A.nombre ? `<span class="row" style="gap:6px">${stars(A.moyenne)}<b class="num">${num(A.moyenne)}</b><span class="small muted">/ 5 · ${A.nombre} avis</span></span>` : '',
    !A.nombre ? empty('Aucun avis pour le moment.') : `<div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
      ${bas ? `<div class="alerte-bloc">${ic('alert')}<div><b>Alerte note basse</b><div class="small">${noteBasse(A.moyenne) ? `Moyenne de ${num(A.moyenne)} / 5. ` : ''}${A.basses ? `${A.basses} avis à 2 étoiles ou moins.` : ''} ${titre === 'client' ? 'Vérifiez la fiabilité de l\'établissement avant de nouvelles missions.' : 'Faites un point avec l\'intérimaire.'}</div></div></div>` : ''}
      <div class="repartition">${A.repartition.map(r => `<div class="rep-l"><span>${r.note} ★</span><span class="cl-b"><span style="width:${r.nombre / max * 100}%;${r.note <= 2 ? 'background:var(--danger-dot)' : ''}"></span></span><span class="num small">${r.nombre}</span></div>`).join('')}</div>
      <div><div class="small muted" style="margin-bottom:4px;font-weight:600">Dernier avis</div>${ligne(A.avis[0])}</div>
      ${A.avis.length > 1 ? `<details class="avis-tous"><summary>Voir tous les avis (${A.avis.length})</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${A.avis.slice(1).map(ligne).join('')}</div></details>` : ''}</div>`);
}

/* ---------------- Candidatures : accepter (rendez-vous sous 48 h) ou refuser, avec message ---------------- */
async function decisionModal(type, id, decision) {
  const url = type === 'candidat' ? `/candidats/${id}` : `/prospects/${id}`;
  const m = await GET(`${url}/modele?decision=${decision}`), ok = decision === 'acceptee';
  const dest = m.email ? `par e-mail à ${esc(m.email)}` : m.telephone ? `par SMS au ${esc(m.telephone)} (pas d'e-mail)` : 'aucun e-mail ni téléphone : la décision est seulement enregistrée';
  const n = new Date(), min = new Date(n.getTime() + 3600e3), max = new Date(n.getTime() + 48 * 3600e3), loc = d => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  openModal(`${modalHead(ic(ok ? 'check' : 'ban') + (ok ? 'Accepter la candidature' : 'Refuser la candidature'), `Envoi ${dest}`)}<form data-f="decision" data-url="${url}" data-d="${decision}" data-type="${type}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    ${ok ? `<label class="f">Proposer un créneau de rendez-vous (facultatif, dans les 48 h)<input type="datetime-local" name="rdv" min="${loc(min)}" max="${loc(max)}" data-rdv></label><p class="hint">Sans créneau, le message demande ses disponibilités. Une date de rappel est fixée à 48 h.</p>` : ''}
    <label class="f">Objet<input type="text" name="sujet" value="${esc(m.sujet)}" maxlength="200" required></label>
    <label class="f">Message (modifiable)<textarea name="texte" rows="12" maxlength="4000" required data-texte>${esc(m.texte)}</textarea></label>
    <div class="err" hidden></div></div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Retour', '', 'data-a="close"')}<button class="btn primary" type="submit"${ok ? '' : ' style="background:var(--danger-dot);border-color:var(--danger-dot)"'}>${ic('send')}${ok ? 'Accepter et envoyer' : 'Refuser et envoyer'}</button></div></form>`);
}
const boutonsDecision = (type, x) => ['nouveau', 'a_rappeler', 'a_relancer'].includes(x.statut)
  ? btn('Accepter', 'check', `data-a="decider" data-t="${type}" data-id="${x.id}" data-d="acceptee"`, 'sm primary') + btn('Refuser', 'ban', `data-a="decider" data-t="${type}" data-id="${x.id}" data-d="refusee"`, 'sm danger') : '';
const decisionInfo = x => x.decision ? `<div class="small ${x.decision === 'refusee' ? 'muted' : ''}" style="margin-top:2px">${x.decision === 'acceptee' ? `${ic('check', 'style="width:12px;height:12px;vertical-align:-2px"')} Acceptée le ${fdate(x.decision_le.slice(0, 10), 'num')}${x.rdv_propose ? ` · RDV proposé ${new Date(x.rdv_propose).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ' · RDV sous 48 h demandé'}` : `Refusée le ${fdate(x.decision_le.slice(0, 10), 'num')}`}</div>` : '';

/* ================= Planning : Mois / Semaine / Intérimaires, agenda en liste sur téléphone ================= */
// Agence : les trois vues (Intérimaires par défaut) · Employeur : Mois et Semaine · Intérimaire : Semaine.
const PL_VUES = { agence: [['mois', 'Mois'], ['semaine', 'Semaine'], ['equipe', 'Intérimaires']], client: [['mois', 'Mois'], ['semaine', 'Semaine']], interim: [['semaine', 'Semaine']] };
const PL_DEFAUT = { agence: 'equipe', client: 'mois', interim: 'semaine' };
const PL_ETAT = { pourvue: 'libre', confirmer: 'attente', recherche: 'pris', diffuser: 'danger' };
const estMobile = () => matchMedia('(max-width: 640px)').matches;
const JOURS_C = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const h2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function legendePlanning(prof) {
  const L = prof === 'interim' ? [['libre', 'Confirmée'], ['attente', 'Contrat ou confirmation en attente'], ['pris', 'Proposée']]
    : prof === 'client' ? [['libre', 'Pourvue'], ['attente', 'Décision à prendre'], ['pris', 'En recherche'], ['danger', 'En validation par l\'agence']]
      : [['libre', 'Pourvue'], ['attente', 'À confirmer par l\'employeur'], ['pris', 'En recherche'], ['danger', 'À diffuser']];
  return `<div class="pl-legende">${L.map(([c, l]) => `<span><i class="pl-pt pl-${c}"></i>${l}</span>`).join('')}<span class="pl-urg">${ic('alert')}Ce soir : importance haute</span></div>`;
}
/** En-tête commun : onglets de vue et navigation (mois ou semaine). */
function barrePlanning(prof, vue) {
  const vues = PL_VUES[prof];
  const onglets = vues.length > 1 ? `<div class="seg pl-onglets" role="tablist">${vues.map(([k, l]) => `<button type="button" role="tab" aria-pressed="${vue === k}" data-a="plvue" data-v="${k}">${l}</button>`).join('')}</div>` : '';
  const moisNav = `<div class="pl-nav">${btn('', 'left', 'data-a="plmois" data-d="-1" aria-label="Mois précédent"', 'sm')}<b>${moisLong(S.p.pm)}</b>${btn('', 'chev', 'data-a="plmois" data-d="1" aria-label="Mois suivant"', 'sm')}${btn('Aujourd\'hui', '', 'data-a="plmois" data-d="0"', 'sm ghost')}</div>`;
  const fin = addDays(S.p.sem, 6);
  const semNav = `<div class="pl-nav">${btn('', 'left', 'data-a="sem" data-d="-7" aria-label="Semaine précédente"', 'sm')}<b>Semaine ${semaineIso(S.p.sem)} · ${fdate(S.p.sem, 'num').slice(0, 5)} – ${fdate(fin, 'num')}</b>${btn('', 'chev', 'data-a="sem" data-d="7" aria-label="Semaine suivante"', 'sm')}${btn('Aujourd\'hui', '', 'data-a="sem" data-d="0"', 'sm ghost')}</div>`;
  return `<div class="pl-barre">${onglets}${vue === 'mois' ? moisNav : semNav}</div>`;
}
async function planning(prof) {
  const t = S.cfg?.aujourdhui || new Date().toISOString().slice(0, 10);
  S.p.sem = S.p.sem || lundi(t); S.p.pm = S.p.pm || t.slice(0, 7);
  const titre = prof === 'interim' ? 'Mon planning' : 'Planning';
  if (estMobile()) return head(titre, '') + await agendaListe(prof);
  const vues = PL_VUES[prof].map(v => v[0]);
  const vue = vues.includes(S.p.pv) ? S.p.pv : PL_DEFAUT[prof];
  const intro = { mois: 'Cliquez sur une date ou une mission pour le détail du jour.', semaine: prof === 'interim' ? 'Vos missions heure par heure. Touchez l\'en-tête d\'un jour pour indiquer votre disponibilité.' : 'Les missions heure par heure, de 6 h à 2 h du matin. Cliquez sur une mission pour le détail du jour.', equipe: 'Une ligne par intérimaire : missions, propositions et disponibilités. Les besoins non pourvus sont en tête.' }[vue];
  const corps = vue === 'mois' ? await planningMois(prof) : vue === 'semaine' ? await planningSemaine(prof) : await planningEquipe();
  return head(titre, intro) + `<section class="panel pl">${barrePlanning(prof, vue)}${legendePlanning(prof)}${corps}</section>`;
}
V.agence.planning = () => planning('agence');
V.client.jour = () => planning('client');
V.interim.dispo = () => planning('interim');

/* ----- A · Mois ----- */
async function planningMois(prof) {
  const c = await GET('/calendrier?mois=' + S.p.pm);
  const E = {}; c.evenements.forEach(e => (E[e.date] = E[e.date] || []).push(e));
  return `<div class="panel-b">${calendrierStandard(S.p.pm, iso => ({
    evenements: (E[iso] || []).map(e => ({ texte: `${e.debut} ${e.poste}${prof === 'agence' ? ' · ' + e.client_nom : ''} ${e.retenus}/${e.nb_postes}`, cls: couleurMission(e), urgent: estCeSoir(e) })),
  }))}</div>`;
}

/* ----- B · Semaine chronologique (6 h → 2 h) ----- */
const PL_H0 = 6, PL_H1 = 26, PL_PX = 30;
async function planningSemaine(prof) {
  const jours = [...Array(7)].map((_, k) => addDays(S.p.sem, k)), t = S.cfg?.aujourdhui;
  const a = await GET(`/agenda?debut=${jours[0]}&fin=${jours[6]}`);
  const D = Object.fromEntries((a.dispos || []).map(d => [d.date, d.etat]));
  const haut = (PL_H1 - PL_H0) * PL_PX, maint = new Date(), minNow = maint.getHours() * 60 + maint.getMinutes();
  const heures = [...Array((PL_H1 - PL_H0) / 2 + 1)].map((_, k) => PL_H0 + k * 2);
  const colonne = j => {
    const L = a.evenements.filter(e => e.date === j).map(e => { let d = h2m(e.debut), f = h2m(e.fin); if (f <= d) f += 1440; if (d < PL_H0 * 60) { d += 1440; f += 1440; } return { ...e, d, f }; });
    // Couloirs : les missions qui se chevauchent sont côte à côte
    const couloirs = []; L.forEach(e => { let k = couloirs.findIndex(fin => fin <= e.d); if (k < 0) { k = couloirs.length; couloirs.push(0); } couloirs[k] = e.f; e.k = k; });
    const n = Math.max(1, couloirs.length);
    return L.map(e => {
      const top = Math.max(0, (e.d - PL_H0 * 60) / 60 * PL_PX), h = Math.max(22, Math.min(haut - top, (e.f - e.d) / 60 * PL_PX) - 2);
      const urg = estCeSoir({ ...e, statut: e.statut || '' });
      return `<button type="button" class="pl-bloc s-${PL_ETAT[e.etat]} pl-${PL_ETAT[e.etat]}${urg ? ' pl-bloc-urg' : ''}" data-a="jour" data-d="${e.date}" style="top:${top}px;height:${h}px;left:calc(${e.k * 100 / n}% + 3px);width:calc(${100 / n}% - 6px)" title="${esc(`${e.debut}–${e.fin} · ${e.poste} · ${e.client_nom} · ${e.libelle}`)}">
        <span class="pl-h">${urg ? ic('alert') : ''}${e.debut}–${e.fin}</span><b>${esc(e.poste)}</b><span>${esc(prof === 'client' ? (e.noms || `${e.retenus}/${e.nb_postes} pourvu`) : e.client_nom)}</span>${prof === 'agence' ? `<span class="pl-qui">${esc(e.noms || `${e.retenus}/${e.nb_postes} pourvu`)}</span>` : ''}</button>`;
    }).join('');
  };
  const entete = j => {
    const k = jours.indexOf(j), d = D[j], futur = j >= t;
    const dispo = prof === 'interim' ? (futur && peut('i_dispos') ? `<button type="button" class="pl-dispo ${d || 'nr'}" data-a="dispo" data-d="${j}" data-e="${d || ''}" title="Changer ma disponibilité">${d === 'disponible' ? 'Disponible' : d === 'indisponible' ? 'Indisponible' : 'Non renseigné'}</button>` : d ? `<span class="pl-dispo ${d}">${d === 'disponible' ? 'Disponible' : 'Indisponible'}</span>` : '') : '';
    return `<div class="pl-jh${j === t ? ' auj' : ''}"><button type="button" class="pl-jh-b" data-a="jour" data-d="${j}"><span>${JOURS_C[k]}</span><b>${Number(j.slice(8))}</b></button>${dispo}</div>`;
  };
  return `<div class="pl-sem"><div class="pl-sem-tete"><span></span>${jours.map(entete).join('')}</div>
    <div class="pl-sem-corps" style="height:${haut}px"><div class="pl-heures">${heures.map(h => `<span style="top:${(h - PL_H0) * PL_PX}px">${String(h % 24).padStart(2, '0')} h</span>`).join('')}</div>
    ${jours.map(j => `<div class="pl-col${j === t ? ' auj' : ''}${D[j] === 'indisponible' ? ' indispo' : ''}" style="background-size:100% ${PL_PX * 2}px"><div class="pl-nuit" style="top:${(22 - PL_H0) * PL_PX}px"></div>${j === t && minNow >= PL_H0 * 60 ? `<div class="pl-maint" style="top:${(minNow - PL_H0 * 60) / 60 * PL_PX}px"></div>` : ''}${colonne(j)}</div>`).join('')}</div></div>
    ${a.evenements.length ? '' : `<div class="panel-b">${empty('Aucune mission cette semaine.')}</div>`}`;
}

/* ----- C · Planning par intérimaire ----- */
async function planningEquipe() {
  const d = await GET('/planning?debut=' + S.p.sem), t = S.cfg?.aujourdhui;
  const B = {}; d.besoins.forEach(b => (B[b.date] = B[b.date] || []).push(b));
  const h = x => x.replace(':00', ' h').replace(':', ' h ');
  const cellule = (c, j) => {
    if (c.statut === 'pris') return `<button type="button" class="pl-case s-libre pl-libre" data-a="jour" data-d="${j}"><b>${h(c.debut)}–${h(c.fin)}</b><span>${esc(c.client)}</span></button>`;
    if (c.statut === 'attente') return `<button type="button" class="pl-case ${c.accepte ? 's-attente pl-attente' : 'pl-propose'}" data-a="jour" data-d="${j}"><b>${h(c.debut)}–${h(c.fin)}</b><span>${c.accepte ? 'À confirmer · ' : 'Proposée · '}${esc(c.client)}</span></button>`;
    if (c.statut === 'libre') return `<button type="button" class="pl-case pl-dispo-c" data-a="jour" data-d="${j}">Disponible</button>`;
    if (c.statut === 'off') return `<button type="button" class="pl-case pl-indispo-c" data-a="jour" data-d="${j}">Indisponible</button>`;
    return `<button type="button" class="pl-case pl-vide" data-a="jour" data-d="${j}" aria-label="${fdate(j, 'long')} : non renseigné"></button>`;
  };
  const nbBesoins = d.besoins.reduce((a, b) => a + (b.nb_postes - b.retenus), 0);
  return `<div class="scroll"><div class="pl-eq" style="min-width:1040px">
    <div class="pl-eq-l pl-eq-tete"><span>Intérimaire</span>${d.jours.map((j, k) => `<button type="button" class="pl-jh-b${j === t ? ' auj' : ''}" data-a="jour" data-d="${j}"><span>${JOURS_C[k]}</span><b>${Number(j.slice(8))}</b></button>`).join('')}<span class="r">Heures</span></div>
    <div class="pl-eq-l pl-eq-besoins"><div><b>Besoins non pourvus</b><span class="small muted">${nbBesoins ? `${nbBesoins} poste${nbBesoins > 1 ? 's' : ''} cette semaine` : 'Tout est pourvu'}</span></div>
      ${d.jours.map(j => `<div class="pl-eq-c">${(B[j] || []).map(b => { const urg = estCeSoir({ date: b.date, debut: b.debut, statut: b.statut }); return `<button type="button" class="pl-case ${b.statut === 'nouvelle' ? 's-danger pl-danger' : 's-pris pl-pris'}${urg ? ' pl-bloc-urg' : ''}" data-a="jour" data-d="${j}"><b>${urg ? ic('alert') : ''}${h(b.debut)}</b><span>${esc(b.poste)} · ${b.nb_postes - b.retenus} place${b.nb_postes - b.retenus > 1 ? 's' : ''}</span></button>`; }).join('')}</div>`).join('')}<span></span></div>
    ${d.lignes.map(l => `<div class="pl-eq-l"><div class="person"><div class="avatar">${initials(l.prenom + ' ' + l.nom)}</div><div><b>${esc(l.prenom)} ${esc(l.nom)}</b><span>${esc(l.poste)}</span></div></div>
      ${l.cases.map((c, k) => `<div class="pl-eq-c">${cellule(c, d.jours[k])}</div>`).join('')}<div class="pl-eq-tot"><b>${num(l.heures)} h</b><span class="pl-jauge"><span style="width:${Math.min(100, l.heures / 39 * 100)}%"></span></span></div></div>`).join('') || empty('Aucun intérimaire.')}
  </div></div>`;
}

/* ----- D · Agenda en liste (téléphone) ----- */
async function agendaListe(prof) {
  const jours = [...Array(7)].map((_, k) => addDays(S.p.sem, k)), t = S.cfg?.aujourdhui;
  const a = await GET(`/agenda?debut=${jours[0]}&fin=${jours[6]}`);
  const D = Object.fromEntries((a.dispos || []).map(d => [d.date, d.etat]));
  const E = {}; a.evenements.forEach(e => (E[e.date] = E[e.date] || []).push(e));
  const ordre = ['diffuser', 'confirmer', 'recherche', 'pourvue'], pire = j => (E[j] || []).map(e => e.etat).sort((x, y) => ordre.indexOf(x) - ordre.indexOf(y))[0];
  const carte = e => {
    const urg = estCeSoir({ ...e, statut: e.statut || '' });
    return `<button type="button" class="ag-carte pl-${PL_ETAT[e.etat]}${urg ? ' pl-bloc-urg' : ''}" data-a="jour" data-d="${e.date}"><span class="ag-h"><b>${e.debut}</b><span>${e.fin}</span></span>
      <span class="ag-c">${urg ? `<span class="ag-urg">${ic('alert')}Ce soir · importance haute</span>` : ''}<b>${prof === 'interim' ? '' : e.nb_postes + ' × '}${esc(e.poste)}</b><span class="small muted">${esc(prof === 'client' ? (e.noms || 'Intérimaires à venir') : prof === 'agence' ? `${e.client_nom}${e.noms ? ' · ' + e.noms : ''}` : e.client_nom)}</span>
      <span class="badge s-${PL_ETAT[e.etat]}">${esc(e.libelle)}${prof === 'interim' || e.etat === 'pourvue' ? '' : ` · ${e.retenus}/${e.nb_postes}`}</span></span>${ic('chev')}</button>`;
  };
  const groupes = jours.filter(j => E[j] || j === t || prof === 'interim').map(j => {
    const d = D[j], dispo = prof === 'interim' && j >= t && peut('i_dispos') ? `<button type="button" class="pl-dispo ${d || 'nr'}" data-a="dispo" data-d="${j}" data-e="${d || ''}">${d === 'disponible' ? 'Disponible' : d === 'indisponible' ? 'Indisponible' : 'Disponibilité ?'}</button>` : '';
    return `<div class="ag-jour" id="ag-${j}"><div class="ag-titre${j === t ? ' auj' : ''}"><b>${j === t ? 'Aujourd\'hui · ' + fdate(j, 'long') : fdate(j, 'long').replace(/^./, c => c.toUpperCase())}</b>${dispo || `<span class="small muted">${(E[j] || []).length ? `${E[j].length} mission${E[j].length > 1 ? 's' : ''}` : ''}</span>`}</div>
      ${(E[j] || []).map(carte).join('') || '<div class="small muted ag-vide">Aucune mission</div>'}</div>`;
  }).join('');
  return `<section class="panel ag">
    <div class="ag-nav">${btn('', 'left', 'data-a="sem" data-d="-7" aria-label="Semaine précédente"', 'sm')}<b>Semaine ${semaineIso(S.p.sem)}</b>${btn('', 'chev', 'data-a="sem" data-d="7" aria-label="Semaine suivante"', 'sm')}</div>
    <div class="ag-bande">${jours.map((j, k) => `<button type="button" class="ag-j${j === t ? ' auj' : ''}" data-a="agjour" data-d="${j}"><span>${JOURS_C[k][0]}</span><b>${Number(j.slice(8))}</b><i class="pl-pt ${pire(j) ? 'pl-' + PL_ETAT[pire(j)] : 'pl-vide'}"></i></button>`).join('')}</div>
    ${legendePlanning(prof)}<div class="ag-liste">${groupes || empty('Aucune mission cette semaine.')}</div>
    ${prof !== 'interim' && (prof === 'agence' || peut('c_demandes')) ? `<div class="ag-action">${btn(prof === 'client' ? 'Nouvelle demande' : 'Nouvelle mission', 'plus', prof === 'client' ? 'data-a="nav" data-v="demandes"' : 'data-a="newmission"', 'primary')}</div>` : ''}</section>`;
}
// Passage ordinateur ↔ téléphone : la vue du planning s'adapte.
matchMedia('(max-width: 640px)').addEventListener('change', () => { if (S.me && ['planning', 'jour', 'dispo'].includes(S.view)) reload(); });

/* ---------------- Droits d'accès (administrateur) ---------------- */
const ESPACES = { agence: ['Agence', 'Collaborateurs de l\'agence (hors administrateurs)', 'building'], client: ['Employeurs', 'Comptes des entreprises clientes', 'briefcase'], interim: ['Intérimaires', 'Comptes des intérimaires', 'users'] };
const interrupteur = (on, attrs, libelle) => `<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(libelle)}" ${attrs}><span></span></button><span class="switch-l ${on ? 'ok' : 'ko'}">${on ? 'Accessible' : 'Verrouillé'}</span>`;
V.agence.droits = async () => {
  const d = await GET('/droits'), e = ESPACES[S.p.de] ? S.p.de : 'client', F = d.catalogue[e], R = d.profils[e];
  const comptes = d.comptes.filter(c => c.profil === e);
  const lignesF = F.map(f => { const on = R[f.k] !== false; return `<div class="dr-l"><div><b>${esc(f.l)}</b><div class="small muted">${esc(f.d)}${f.vues.length ? ' · rubrique masquée si verrouillée' : ''}</div></div>
    <div class="dr-sw">${interrupteur(on, `data-a="droit" data-c="profil:${e}" data-f="${f.k}" data-v="${!on}"`, `${f.l} : ${on ? 'verrouiller' : 'rendre accessible'} pour ${ESPACES[e][0]}`)}</div></div>`; }).join('');
  const lignesC = comptes.map(c => {
    const perso = Object.keys(c.reglages).length;
    return `<div class="li" style="flex-wrap:wrap"><div class="person"><div class="avatar">${initials(c.nom)}</div><div><b>${esc(c.nom)}</b><span><span class="mono">${esc(c.username)}</span>${c.client_nom ? ' · ' + esc(c.client_nom) : ''}${c.actif ? '' : ' · désactivé'}</span></div></div>
      <div class="row">${c.super_admin ? badge('libre', 'Administrateur · accès complet') : `${c.verrous.length ? badge('attente', `${c.verrous.length} fonction${c.verrous.length > 1 ? 's' : ''} verrouillée${c.verrous.length > 1 ? 's' : ''}`) : badge('libre', 'Tout accessible')}${perso ? badge('pris', `${perso} réglage${perso > 1 ? 's' : ''} personnalisé${perso > 1 ? 's' : ''}`) : ''}`}
      ${c.super_admin && c.id === S.me.id ? '' : btn(c.super_admin ? 'Gérer' : 'Personnaliser', 'shield', `data-a="droitscompte" data-id="${c.id}"`, 'sm')}</div></div>`;
  }).join('');
  return head('Droits d\'accès', 'Choisissez, pour chaque espace puis pour chaque compte, les fonctions accessibles ou verrouillées. Une fonction verrouillée disparaît du menu et ses actions sont refusées par le serveur. Les administrateurs gardent un accès complet.') +
    `<div class="seg" style="align-self:flex-start;margin-bottom:4px">${Object.entries(ESPACES).map(([k, [l, , i]]) => `<button type="button" aria-pressed="${k === e}" data-a="despace" data-e="${k}">${ic(i)}${l}</button>`).join('')}</div>` +
    `<div class="grid-main">${panel(`Réglage de l'espace ${ESPACES[e][0]}`, `<span class="small muted">${esc(ESPACES[e][1])}</span>`, `<div class="panel-b dr">${lignesF}</div>`)}
    ${panel(`Comptes (${comptes.length})`, '', comptes.length ? `<div class="panel-b small muted" style="padding-bottom:0">Un réglage personnalisé prime sur celui de l'espace, pour ce compte seulement.</div><div class="list">${lignesC}</div>` : empty('Aucun compte dans cet espace.'))}</div>`;
};
async function droitsCompteModal(id) {
  const d = await GET('/droits'), c = d.comptes.find(x => x.id === id); if (!c) return;
  const F = d.catalogue[c.profil], R = d.profils[c.profil];
  const ligne = f => {
    const v = f.k in c.reglages ? String(c.reglages[f.k]) : '', base = R[f.k] !== false;
    return `<div class="dr-l"><div><b>${esc(f.l)}</b><div class="small muted">${esc(f.d)}</div></div>
      <label class="dr-sel"><span class="sr">${esc(f.l)}</span><select data-a="droitcompte" data-c="user:${c.id}" data-f="${f.k}">
      <option value="" ${v === '' ? 'selected' : ''}>Espace : ${base ? 'accessible' : 'verrouillé'}</option><option value="true" ${v === 'true' ? 'selected' : ''}>Accessible</option><option value="false" ${v === 'false' ? 'selected' : ''}>Verrouillé</option></select></label></div>`;
  };
  openModal(`${modalHead(ic('shield') + esc(c.nom), `${ESPACES[c.profil][0]} · ${esc(c.username)}`)}<div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    ${c.profil === 'agence' ? `<div class="dr-l dr-admin"><div><b>Administrateur</b><div class="small muted">Accès complet à toutes les fonctions et gestion des droits.</div></div><div class="dr-sw">${interrupteur(c.super_admin, `data-a="dradmin" data-id="${c.id}" data-v="${!c.super_admin}"`, 'Administrateur')}</div></div>` : ''}
    ${c.super_admin ? '<p class="small muted">Un administrateur n\'a aucune restriction.</p>' : `<div class="dr">${F.map(ligne).join('')}</div>`}</div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Fermer', '', 'data-a="close"', 'primary')}</div>`);
}

/* ---------------- Formulaires en fenêtre ---------------- */
async function missionForm() {
  const cs = (await GET('/clients')).filter(c => !c.suspendu);
  if (!cs.length) return toast('Créez d\'abord une fiche client (ou réactivez un client suspendu).', true);
  const t = S.cfg?.aujourdhui || new Date().toISOString().slice(0, 10);
  openModal(`${modalHead(ic('plus') + 'Nouvelle mission')}<form data-f="mission"><div class="panel-b form">
    <label class="f full">Client<select name="client_id" required>${cs.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</select></label>
    <label class="f">Poste<input type="text" name="poste" required list="postes-liste"></label>${listePostes()}<label class="f">Date<input type="date" name="date" min="${t}" value="${addDays(t, 7)}" required></label>
    <label class="f">Début<input type="time" name="debut" value="18:00" required></label><label class="f">Fin<input type="time" name="fin" value="23:30" required></label>
    <label class="f">Nombre de postes<input type="number" name="nb_postes" min="1" max="30" value="1" required></label><label class="f">Taux horaire brut (€)<input type="number" name="taux_horaire" step="0.01" min="${S.cfg?.smic || 10}" max="60" value="${(S.cfg?.smic || 12).toFixed(2)}" required><span class="hint" data-taux-aide>Minimum HCR du poste, jamais sous le SMIC.</span></label>
    <label class="f full">Motif de recours (figure sur le contrat)<select name="motif" data-motif>${opt(S.cfg?.motifs || [])}</select></label>
    <div class="full form" data-remplace hidden><label class="f">Salarié remplacé (nom et prénom)<input type="text" name="remplace_nom" maxlength="120"></label><label class="f">Poste du salarié remplacé<input type="text" name="remplace_poste" maxlength="120"></label></div>
    <details class="full guide"><summary><b>Précisions du contrat de mission</b> <span class="small muted">(facultatif : sinon, valeurs habituelles du poste)</span></summary><div class="form" style="margin-top:10px">
      <label class="f full">Tâches principales<textarea name="taches" maxlength="600" placeholder="Service en salle, dressage des tables, accueil de la clientèle…"></textarea></label>
      <label class="f full">Risques particuliers<input type="text" name="risques" maxlength="600" placeholder="Sols glissants, port de charges…"></label>
      <label class="f full">Équipements de protection fournis<input type="text" name="epi" maxlength="600" placeholder="Chaussures antidérapantes, tablier…"></label></div></details>
    ${simLive()}</div>
    ${modalFoot('Créer la mission', 'type="submit"')}</form>`);
  majSimulation($('form[data-f="mission"]'));
}
async function diffuseModal(id) {
  const [ms, is] = await Promise.all([GET('/missions'), GET('/interimaires')]);
  const m = ms.find(x => x.id === id); if (!m) return;
  const deja = new Set(m.envois.map(e => e.interim_id));
  const norm = x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mots = norm(m.poste).split(/[\s-]+/).filter(x => x.length > 3 && !['extra', 'commis'].includes(x));
  const secteurPoste = secteurDuPoste(m.poste) || m.client_secteur;
  const match = i => mots.some(x => norm(i.poste).includes(x)) || i.secteur === secteurPoste;
  const L = is.filter(i => !deja.has(i.id) && !i.suspendu).sort((a, b) => match(b) - match(a) || (b.note || 0) - (a.note || 0));
  const c = S.cfg?.canaux || {};
  openModal(`${modalHead(ic('send') + 'Valider et diffuser la mission', `${m.nb_postes} × ${esc(m.poste)} · ${esc(m.client_nom)} · ${fdate(m.date)} · ${m.debut}–${m.fin}`)}
    <form data-f="diffuser" data-id="${m.id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div><div class="small muted" style="margin-bottom:6px;font-weight:500">Moyen d'envoi</div><div class="statusline">${Object.entries(CANAUX).map(([k, [i, l]]) => `<label class="check" style="border:1px solid var(--line);border-radius:7px;padding:6px 10px"><input type="checkbox" name="canal" value="${k}" ${k !== 'mail' ? 'checked' : ''}>${ic(i)}${l}${c[k] ? '' : ' <span class="hint">(simulé)</span>'}</label>`).join('')}</div></div>
    <label class="f" style="max-width:260px">Taux horaire brut (€)<input type="number" name="taux_horaire" step="0.01" min="${S.cfg?.smic || 10}" max="60" value="${m.taux_horaire}"><span class="hint">Minimum HCR du poste : ${eur(tauxPoste(m.poste))}</span></label>
    ${simLive({ client_id: m.client_id, date: m.date, poste: m.poste, debut: m.debut, fin: m.fin, nb_postes: m.nb_postes, motif: m.motif })}
    <div><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="small muted" style="font-weight:500">Intérimaires destinataires</span>${deja.size ? `<span class="small muted">${deja.size} déjà contacté(s)</span>` : ''}</div>
    <div style="border:1px solid var(--line);border-radius:8px;max-height:280px;overflow:auto">${L.map(i => `<label class="li clickable" style="padding:9px 12px"><span class="person"><input type="checkbox" name="interim" value="${i.id}" style="width:16px;height:16px;accent-color:var(--accent)"><span class="avatar">${initials(i.prenom + ' ' + i.nom)}</span><span><b>${esc(i.prenom)} ${esc(i.nom)}</b><span>${esc(i.poste)}${i.telephone ? '' : ' · pas de téléphone'}${i.email ? '' : ' · pas d\'e-mail'}</span></span></span>${match(i) ? badge('libre', 'Profil correspondant') : ''}</label>`).join('') || empty('Tous les intérimaires ont déjà été contactés.')}</div></div>
    <div class="err" hidden></div></div>${modalFoot(ic('send') + 'Valider et envoyer', 'type="submit"')}</form>`);
  majSimulation($('form[data-f="diffuser"]'));
}
async function interimForm(id) {
  const i = id ? (await GET('/interimaires')).find(x => x.id === id) : {};
  const f = (n, l, t = 'text', extra = '') => `<label class="f">${l}<input type="${t}" name="${n}" value="${esc(i[n] ?? '')}" ${extra}></label>`;
  openModal(`${modalHead(ic(id ? 'edit' : 'plus') + (id ? 'Modifier la fiche' : 'Nouvel intérimaire'))}<form data-f="interim" data-id="${id || ''}"><div class="panel-b form">
    ${f('prenom', 'Prénom', 'text', 'required')}${f('nom', 'Nom', 'text', 'required')}${f('poste', 'Poste principal', 'text', 'required list="postes-liste"')}${listePostes()}
    <label class="f">Secteur<select name="secteur">${opt(SECTEURS, i.secteur)}</select></label>${f('telephone', 'Téléphone (SMS, WhatsApp)', 'tel')}${f('email', 'E-mail', 'email')}${f('ville', 'Ville')}
    ${f('taux_horaire', 'Taux horaire brut (€)', 'number', 'step="0.01" min="10" max="60"')}${f('date_naissance', 'Date de naissance', 'date')}
    ${f('lieu_naissance', 'Lieu de naissance (ville, pays)')}<label class="f">Nationalité<select name="nationalite">${opt(S.cfg?.nationalites || ['Française'], i.nationalite || 'Française')}</select></label>
    ${f('nir', 'N° de sécurité sociale', 'text', 'inputmode="numeric" maxlength="21" autocomplete="off" placeholder="1 85 05 69 123 456 78"')}${f('adresse', 'Adresse du domicile')}${f('code_postal', 'Code postal', 'text', 'inputmode="numeric" maxlength="5"')}
    <label class="f full">Compétences<input type="text" name="competences" value="${esc(i.competences || '')}"></label>
    <p class="hint full">Ces informations remplissent automatiquement le contrat de mission. L'employeur ne voit jamais la date et le lieu de naissance, le n° de sécurité sociale ni l'adresse du domicile. La date de naissance et la nationalité déterminent les pièces exigées (autorisation parentale, titre de séjour). Le dossier passe « complet » quand l'agence a validé toutes les pièces exigées.</p></div>
    ${modalFoot(id ? 'Enregistrer' : 'Créer la fiche', 'type="submit"')}</form>`);
}
async function clientForm(id) {
  const min = S.cfg?.coefficient_minimum || 1.45;
  const c = id ? (await GET('/clients')).find(x => x.id === id) : { coefficient: min, delai_paiement: 15, convention: 'HCR (IDCC 1979)' };
  const signe = id ? (await GET('/contrats-clients?client_id=' + id)).contrats.find(k => k.statut === 'signe') : null;
  const f = (n, l, t = 'text', extra = '') => `<label class="f">${l}<input type="${t}" name="${n}" value="${esc(c[n] ?? '')}" ${extra}></label>`;
  openModal(`${modalHead(ic(id ? 'edit' : 'plus') + (id ? 'Modifier le client' : 'Nouveau client'))}<form data-f="client" data-id="${id || ''}"><div class="panel-b form">
    ${f('nom', 'Raison sociale', 'text', 'required')}${f('siret', 'SIRET')}<label class="f">Secteur<select name="secteur">${opt(SECTEURS, c.secteur)}</select></label>${f('contact', 'Interlocuteur')}
    ${f('email', 'E-mail', 'email')}${f('telephone', 'Téléphone', 'tel')}${f('adresse', 'Adresse')}${f('ville', 'Ville')}
    ${signe ? `<div class="f"><span>Coefficient et délai de paiement</span><b>${num(c.coefficient)} · ${c.delai_paiement} jours</b><span class="hint">Fixés par le contrat ${esc(signe.numero)} signé. Établissez un nouveau contrat pour les modifier.</span></div>`
      : f('coefficient', 'Coefficient de facturation', 'number', `step="0.01" min="${min}" max="5" required`) + f('delai_paiement', 'Délai de paiement (jours)', 'number', 'min="0" max="60" required')}${f('convention', 'Convention collective')}</div>
    ${modalFoot(id ? 'Enregistrer' : 'Créer la fiche', 'type="submit"')}</form>`);
}
function pwModal() {
  openModal(`${modalHead(ic('lock') + 'Changer mon mot de passe')}<form data-f="pw"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <label class="f">Mot de passe actuel<input type="password" name="actuel" autocomplete="current-password" required></label><label class="f">Nouveau mot de passe<input type="password" name="nouveau" autocomplete="new-password" required data-rules></label>
    <label class="f">Confirmer<input type="password" name="confirm" autocomplete="new-password" required></label><div class="rules" id="rules">${rulesHtml('')}</div><div class="err" hidden></div></div>${modalFoot('Enregistrer', 'type="submit"')}</form>`);
}

/* ---------------- Actions ---------------- */
async function act(fn, el) {
  if (S.busy) return; S.busy = true; if (el) el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { S.busy = false; if (el && el.isConnected) el.disabled = false; }
}
const reload = () => renderApp();
const A = {
  suspendre: el => openModal(`${modalHead(ic('lock') + 'Suspendre le profil', esc(el.dataset.n))}<form data-f="suspendre" data-t="${el.dataset.t}" data-id="${el.dataset.id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p>${el.dataset.t === 'clients' ? 'Le client ne pourra plus se connecter ni recevoir de nouvelles missions.' : 'L\'intérimaire ne pourra plus se connecter et ne recevra plus de missions.'} Ses données sont conservées ; vous pourrez le réactiver à tout moment.</p>
    <label class="f">Motif (facultatif, visible par l'agence seulement)<input type="text" name="motif" maxlength="300"></label></div>${modalFoot('Suspendre', 'type="submit"')}</form>`),
  reactiver: el => act(async () => { await POST(`/${el.dataset.t}/${el.dataset.id}/reactiver`); toast('Profil réactivé'); reload(); }, el),
  supprimer: el => openModal(`${modalHead(ic('trash') + 'Supprimer définitivement', esc(el.dataset.n))}<form data-f="supprimer" data-t="${el.dataset.t}" data-id="${el.dataset.id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <p>La fiche, ses accès et ses documents seront <b>effacés sans retour possible</b>.</p>
    <p class="hint">Un profil qui a des contrats, des fiches de paie, des factures ou des heures travaillées ne peut pas être supprimé : ces documents doivent être conservés. Suspendez-le à la place.</p>
    <label class="check"><input type="checkbox" name="ok" required> Je confirme la suppression définitive</label><div class="err" hidden></div></div>
    <div class="panel-f" style="justify-content:flex-end">${btn('Annuler', '', 'data-a="close"')}<button class="btn danger" type="submit">${ic('trash')}Supprimer</button></div></form>`),
  xpadd: el => openModal(`${modalHead(ic('plus') + 'Ajouter une expérience')}<form data-f="xp" data-id="${el.dataset.id}"><div class="panel-b form">
    <label class="f">Poste<input type="text" name="poste" required maxlength="100" list="postes-liste"></label>${listePostes()}<label class="f">Employeur<input type="text" name="employeur" required maxlength="150"></label>
    <label class="f">Début<input type="date" name="debut" required></label><label class="f">Fin (vide si en cours)<input type="date" name="fin"></label>
    <label class="f full">Description (facultatif)<textarea name="description" maxlength="1000" placeholder="Missions, type d'établissement, nombre de couverts…"></textarea></label></div>${modalFoot('Ajouter', 'type="submit"')}</form>`),
  xpdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.append(' Confirmer'); return; } await DEL(`/experiences/${el.dataset.id}`); toast('Ligne retirée'); reload(); }, el),
  pup: el => openModal(`${modalHead(ic('upload') + 'Téléverser un document', esc(el.dataset.label))}<form data-f="piece" data-iid="${el.dataset.iid}"><input type="hidden" name="type" value="${el.dataset.type}"><div class="panel-b form">
    <label class="f full">Fichier (PDF ou photo, 10 Mo maximum)<input type="file" name="fichier" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*"></label>
    ${el.dataset.exp === '1' ? '<label class="f">Date d\'expiration<input type="date" name="expire_le"></label>' : ''}</div>${modalFoot(ic('upload') + 'Envoyer', 'type="submit"')}</form>`),
  pstat: el => act(async () => { await POST(`/pieces/${el.dataset.id}/statut`, { statut: el.dataset.s }); toast('Document validé'); reload(); }, el),
  prefus: el => openModal(`${modalHead('Refuser le document')}<form data-f="prefus" data-id="${el.dataset.id}"><div class="panel-b"><label class="f">Raison du refus (visible par l'intérimaire)<input type="text" name="commentaire" required maxlength="300" placeholder="Document illisible, expiré, recto manquant…"></label></div>${modalFoot('Refuser', 'type="submit"')}</form>`),
  pdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.append(' Confirmer'); return; } await DEL(`/pieces/${el.dataset.id}`); toast('Document retiré'); reload(); }, el),
  signer: el => openModal(`${modalHead(ic('edit') + 'Signer le contrat de mission', 'N° ' + esc(el.dataset.n))}<form data-f="signer" data-id="${el.dataset.id}"><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <a class="btn" href="/api/contrats/${el.dataset.id}/document" target="_blank" rel="noopener" style="align-self:flex-start">${ic('file')}Lire le contrat</a>
    <label class="check"><input type="checkbox" name="accepte" required> J'ai lu le contrat de mission et j'en accepte les conditions${S.me.profil === 'client' ? ', et je suis habilité(e) à signer pour l\'entreprise' : ''}.</label>
    <label class="f">Recopiez la mention « Lu et approuvé »<input type="text" name="mention" required autocomplete="off" placeholder="Lu et approuvé"></label>
    <label class="f">${S.me.profil === 'client' ? 'Votre nom et votre fonction' : 'Votre prénom et votre nom'}<input type="text" name="nom" required autocomplete="name" value="" placeholder="${S.me.profil === 'client' ? 'Jean Dupont, gérant' : esc(S.me.nom)}"></label>
    <p class="hint">Signature électronique simple : la date, l'heure et votre adresse de connexion sont enregistrées.</p><div class="err" hidden></div></div>${modalFoot('Signer le contrat', 'type="submit"')}</form>`),
  bgen: el => act(async () => { const r = await POST('/bulletins/generer', { debut: el.dataset.d, fin: el.dataset.f }); toast(r.crees ? `${r.crees} fiche(s) de paie créée(s)` : 'Aucune heure validée à mettre en paie sur cette période.'); reload(); }, el),
  bpay: el => act(async () => { await POST(`/bulletins/${el.dataset.id}/payer`); toast('Fiche marquée payée. L\'intérimaire est prévenu.'); reload(); }, el),
  nav: el => go(el.dataset.v),
  oeil: el => {
    const i = el.previousElementSibling, voir = i.type === 'password';
    i.type = voir ? 'text' : 'password'; el.setAttribute('aria-pressed', voir);
    el.setAttribute('aria-label', voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); el.title = el.getAttribute('aria-label');
    el.innerHTML = ic(voir ? 'eyeoff' : 'eye'); i.focus();
  },
  navgroupe: el => {
    const ouvert = el.getAttribute('aria-expanded') !== 'true', g = el.dataset.g;
    el.setAttribute('aria-expanded', ouvert); document.getElementById(el.getAttribute('aria-controls')).hidden = !ouvert;
    if (ouvert) NAV_OUVERT.add(g); else NAV_OUVERT.delete(g);
    memoNav();
  },
  // Logo : tableau de bord quand on est connecté (sans recharger la page), sinon page de connexion.
  logo: (el, e) => { if (!S.me || S.me.must_change) return; e.preventDefault(); setMenu(false); go('accueil'); window.scrollTo(0, 0); },
  jour: el => act(() => openJour(el.dataset.d), el),
  navmois: el => { S.p[el.dataset.k] = moisDe(S.p[el.dataset.k] + '-01', Number(el.dataset.d)); reload(); },
  demjour: el => { closeModal(); go('demandes', { dem_date: el.dataset.d }); },
  menu: () => setMenu(!S.menu),
  tab: el => { S.p[el.dataset.k] = el.dataset.v; reload(); },
  logout: () => act(async () => { await POST('/logout').catch(() => { }); S.me = null; S.pwTemp = null; renderAuth(); }),
  close: el => { closeModal(); if (el.dataset.go) go(el.dataset.go); },
  modalbg: (el, e) => { if (e.target === el) closeModal(); },
  motdepasse: () => pwModal(),
  notifs: () => act(async () => {
    const n = await GET('/notifications');
    openModal(`${modalHead(ic('bell') + 'Notifications')}${n.length ? `<div class="list">${n.map(x => `<div class="li"><div>${esc(x.message)}<div class="small muted">${esc(x.created_at)}</div></div></div>`).join('')}</div>` : empty('Aucune notification.')}<div class="panel-f" style="justify-content:flex-end">${btn('Fermer', '', 'data-a="close"', 'primary')}</div>`);
    await POST('/notifications/lu'); refreshCounts();
  }),
  // Préremplit les réglages SMTP d'un fournisseur (le mot de passe reste à saisir).
  smtppreset: el => {
    const f = el.closest('.panel').querySelector('form[data-f="param"]');
    const PRE = {
      gmail: { smtp_host: 'smtp.gmail.com', smtp_port: '465', smtp_secure: 'oui', smtp_user: 'chr-interims@gmail.com', smtp_from: 'CHR Intérim <chr-interims@gmail.com>' },
      brevo: { smtp_host: 'smtp-relay.brevo.com', smtp_port: '587', smtp_secure: 'non' },
      outlook: { smtp_host: 'smtp.office365.com', smtp_port: '587', smtp_secure: 'non' },
    }[el.dataset.p];
    for (const [k, v] of Object.entries(PRE)) { const i = f.elements[k]; if (i) i.value = v; }
    const pw = f.elements.smtp_pass; pw.focus(); pw.scrollIntoView({ block: 'center' });
    toast(el.dataset.p === 'gmail' ? 'Réglages Gmail remplis : collez le mot de passe d\'application (16 lettres), puis Enregistrer.' : 'Serveur et port remplis : saisissez l\'identifiant, la clé et l\'adresse d\'expédition, puis Enregistrer.');
  },
  copy: el => { const t = el.dataset.t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copié'), () => toast('Copie impossible : sélectionnez le texte.', true)); },
  newmission: el => act(missionForm, el),
  diffuser: el => act(() => diffuseModal(Number(el.dataset.id)), el),
  annuler: el => annulModal('annuler', Number(el.dataset.id), el.dataset.n || ''),
  desister: el => annulModal('desister', Number(el.dataset.id), el.dataset.n || ''),
  indispo: () => indispoModal(),
  desister1: el => act(async () => { await POST(`/missions/${el.dataset.id}/desister`, { motif: el.dataset.motif }); el.closest('.li').innerHTML = `<span class="small">${ic('check')} Désistement enregistré, la place est remise à disposition.</span>`; }, el),
  decision: el => act(async () => {
    const r = await POST(`/missions/${el.dataset.m}/decision`, { interim_id: Number(el.dataset.i), accepte: el.dataset.ok === '1' });
    toast(r.verrouillee ? 'Mission validée et verrouillée. Les documents ont été envoyés.' : el.dataset.ok === '1' ? 'Intérimaire retenu.' : 'Intérimaire refusé. La place est de nouveau ouverte.');
    await reload(); await rafraichirJour();
  }, el),
  repondre: el => act(async () => { await POST(`/missions/${el.dataset.id}/repondre`, { accepte: el.dataset.ok === '1' }); toast(el.dataset.ok === '1' ? 'Mission acceptée. En attente de confirmation de l\'employeur.' : 'Mission refusée.'); await reload(); await rafraichirJour(); }, el),
  isel: el => { S.p.isel = Number(el.dataset.id); reload(); },
  csel: el => { S.p.csel = Number(el.dataset.id); reload(); },
  ouvrirclient: el => go('clients', { csel: Number(el.dataset.id) }),
  interimform: el => act(() => interimForm(Number(el.dataset.id) || null), el),
  clientform: el => act(() => clientForm(Number(el.dataset.id) || null), el),
  ccnew: el => ccModal(el),
  krelance: el => act(async () => { const r = await POST(`/contrats/${el.dataset.id}/relancer`); toast(`Relance envoyée : ${r.envoyes.join(' et ')}.`); reload(); }, el),
  frelance: el => act(async () => { await POST(`/factures/${el.dataset.id}/relancer`); toast('Relance envoyée au client.'); reload(); }, el),
  prospect: el => act(() => prospectModal(Number(el.dataset.id)), el),
  visite: () => visiteModal(),
  pfiltre: el => go('prospects', { pf: el.dataset.f }),
  despace: el => go('droits', { de: el.dataset.e }),
  droit: el => act(async () => { await PUT('/droits', { cible: el.dataset.c, fonction: el.dataset.f, acces: el.dataset.v === 'true' }); toast(el.dataset.v === 'true' ? 'Fonction rendue accessible' : 'Fonction verrouillée'); reload(); }, el),
  droitscompte: el => act(() => droitsCompteModal(Number(el.dataset.id)), el),
  dradmin: el => act(async () => { await PUT('/droits/admin', { user_id: Number(el.dataset.id), super_admin: el.dataset.v === 'true' }); toast(el.dataset.v === 'true' ? 'Compte nommé administrateur' : 'Rôle d\'administrateur retiré'); await droitsCompteModal(Number(el.dataset.id)); reload(); }, el),
  decider: (el, e) => { e.stopPropagation(); act(() => decisionModal(el.dataset.t, Number(el.dataset.id), el.dataset.d), el); },
  cfiltre: el => go('candidats', { cf: el.dataset.f }),
  contactonglet: el => renderContact(el.dataset.o),
  candidat: el => act(() => candidatModal(Number(el.dataset.id)), el),
  cinterim: el => act(async () => { const r = await POST(`/candidats/${el.dataset.id}/interimaire`); closeModal(); S.p.isel = r.interim_id; toast('Fiche intérimaire créée. Complétez-la (n° de sécurité sociale, domicile) et créez son accès.'); go('interimaires'); }, el),
  cdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.innerHTML = 'Confirmer la suppression'; el.classList.add('primary'); return; } await DEL(`/candidats/${el.dataset.id}`); closeModal(); toast('Candidature et CV supprimés'); reload(); }, el),
  pclient: el => act(async () => { const r = await POST(`/prospects/${el.dataset.id}/client`); closeModal(); S.p.csel = r.client_id; toast('Fiche client créée, avec le coefficient par défaut. Établissez ensuite le contrat commercial.'); go('clients'); }, el),
  pdel: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.innerHTML = 'Confirmer la suppression'; el.classList.add('primary'); return; } await DEL(`/prospects/${el.dataset.id}`); closeModal(); toast('Prospect supprimé'); reload(); }, el),
  ccsign: el => ccSignModal(Number(el.dataset.id)),
  ccannul: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.innerHTML = 'Confirmer l\'annulation'; el.classList.add('primary'); return; } await POST(`/contrats-clients/${el.dataset.id}/annuler`); toast('Contrat annulé'); reload(); }, el),
  mkacc: el => act(async () => { const c = await POST('/acces', { type: el.dataset.type, id: Number(el.dataset.id) }); await reload(); credModal(c, 'Accès créé'); }, el),
  reset: el => act(async () => { const c = await POST(`/acces/${el.dataset.id}/reset`); await reload(); credModal(c, 'Mot de passe réinitialisé'); }, el),
  toggle: el => act(async () => { const r = await POST(`/acces/${el.dataset.id}/toggle`); toast(r.actif ? 'Compte réactivé' : 'Compte désactivé'); reload(); }, el),
  deldoc: el => act(async () => { if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.lastChild.textContent = 'Confirmer'; return; } await DEL(`/documents/${el.dataset.id}`); toast('Document supprimé'); reload(); }, el),
  hconf: el => act(async () => { await POST(`/heures/${el.dataset.id}/confirmer`, {}); toast('Heures confirmées'); reload(); }, el),
  hval: el => act(async () => { const b = el.dataset.x === undefined ? {} : { extra_accepte: el.dataset.x === '1' }; await POST(`/heures/${el.dataset.id}/valider`, b); toast('Heures validées'); reload(); }, el),
  hedit: el => openModal(`${modalHead(ic('edit') + 'Corriger les heures prévues')}<form data-f="hedit" data-id="${el.dataset.id}"><div class="panel-b"><label class="f">Heures prévues<input type="number" name="h" step="0.25" min="0.25" max="16" value="${el.dataset.v}" required></label></div>${modalFoot('Enregistrer', 'type="submit"')}</form>`),
  payee: el => act(async () => { await POST(`/factures/${el.dataset.id}/payee`); toast('Facture marquée comme payée'); reload(); }, el),
  sem: el => { const d = Number(el.dataset.d); S.p.sem = d ? addDays(S.p.sem, d) : lundi(S.cfg.aujourdhui); reload(); },
  plvue: el => { S.p.pv = el.dataset.v; reload(); },
  plmois: el => { const d = Number(el.dataset.d); S.p.pm = d ? moisDe(S.p.pm + '-01', d) : S.cfg.aujourdhui.slice(0, 7); reload(); },
  agjour: el => document.getElementById('ag-' + el.dataset.d)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  mois: el => { S.p.mo = (S.p.mo || 0) + Number(el.dataset.d); reload(); },
  dispo: el => act(async () => { const nxt = { '': 'disponible', disponible: 'indisponible', indisponible: null }[el.dataset.e]; await PUT('/disponibilites', { date: el.dataset.d, etat: nxt }); reload(); }, el),
  star: el => { const box = el.closest('[data-rate]'), n = Number(el.dataset.n); box.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k < n)); el.closest('form').note.value = n; },
  toggleextra: el => { el.closest('form').querySelector('.extra').hidden = !el.checked; },
};
const F = {
  envoiacc: (fd, f) => act(async () => {
    const out = f.querySelector('[data-resultat]'); out.textContent = 'Envoi en cours…';
    const r = await POST(`/acces/${f.dataset.id}/envoyer`, { password: f.dataset.pw, canaux: fd.getAll('canal') });
    const lib = { envoye: 'envoyé', simule: 'simulé (canal non configuré)', echec: 'échec' };
    out.innerHTML = Object.entries(r.resultats).map(([k, v]) => `${CANAUX[k][1]} : <b>${lib[v.statut]}</b>${v.statut === 'echec' && v.detail ? ` (${esc(v.detail)})` : ''}`).join(' · ');
  }),
  param: (fd, f) => act(async () => {
    const effacer = fd.getAll('effacer'); fd.delete('effacer');
    await PUT('/parametres', { valeurs: Object.fromEntries(fd), effacer });
    S.cfg = await GET('/config').catch(() => S.cfg);
    toast('Paramètres enregistrés'); reload();
  }),
  paramtest: fd => act(async () => {
    const r = await POST('/parametres/test', Object.fromEntries(fd));
    if (r.statut === 'envoye') toast('Message de test envoyé. Vérifiez sa réception.');
    else toast(`Échec de l'envoi : ${r.detail || 'erreur inconnue'}. Vérifiez les réglages.`, true);
  }),
  suspendre: (fd, f) => act(async () => { await POST(`/${f.dataset.t}/${f.dataset.id}/suspendre`, { motif: fd.get('motif') }); closeModal(); toast('Profil suspendu. Ses sessions ont été fermées.'); reload(); }),
  supprimer: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    try { await DEL(`/${f.dataset.t}/${f.dataset.id}`); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    if (f.dataset.t === 'clients') S.p.csel = null; else S.p.isel = null;
    closeModal(); toast('Profil supprimé'); reload();
  }),
  xp: (fd, f) => act(async () => { await POST(`/interimaires/${f.dataset.id}/experiences`, Object.fromEntries(fd)); closeModal(); toast('Expérience ajoutée'); reload(); }),
  piece: (fd, f) => act(async () => { if (!fd.get('expire_le')) fd.delete('expire_le'); await api('POST', `/interimaires/${f.dataset.iid}/pieces`, fd); closeModal(); toast(S.me.profil === 'agence' ? 'Document ajouté et validé' : 'Document envoyé. L\'agence va le vérifier.'); reload(); }),
  prefus: (fd, f) => act(async () => { await POST(`/pieces/${f.dataset.id}/statut`, { statut: 'refuse', commentaire: fd.get('commentaire') }); closeModal(); toast('Document refusé. L\'intérimaire est prévenu.'); reload(); }),
  signer: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    let r; try { r = await POST(`/contrats/${f.dataset.id}/signer`, { accepte: fd.has('accepte'), mention: fd.get('mention'), nom: fd.get('nom') }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    closeModal(); toast(r.mission_validee ? 'Contrat signé : la mission est validée.' : r.contrat_signe ? 'Contrat signé par les deux parties.' : 'Signature enregistrée. En attente de l\'autre partie.'); reload();
  }),
  bpdf: (fd, f) => act(async () => { await api('POST', `/bulletins/${f.dataset.id}/fichier`, fd); toast('Fiche de paie déposée'); reload(); }),
  login: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    try { S.me = await POST('/login', { username: fd.get('username'), password: fd.get('password') }); }
    catch (e) { err.textContent = e.message; err.hidden = false; return; }
    S.pwTemp = S.me.must_change ? fd.get('password') : null;
    await afterLogin();
  }),
  firstpw: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    if (fd.get('nouveau') !== fd.get('confirm')) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; err.hidden = false; return; }
    try { S.me = await POST('/password', { actuel: S.pwTemp || fd.get('actuel'), nouveau: fd.get('nouveau') }); }
    catch (e) { err.textContent = e.message; err.hidden = false; return; }
    S.pwTemp = null; toast('Mot de passe enregistré. Bienvenue !'); await afterLogin();
  }),
  pw: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    if (fd.get('nouveau') !== fd.get('confirm')) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; err.hidden = false; return; }
    try { await POST('/password', { actuel: fd.get('actuel'), nouveau: fd.get('nouveau') }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    closeModal(); toast('Mot de passe modifié');
  }),
  mission: fd => act(async () => { await POST('/missions', Object.fromEntries(fd)); closeModal(); toast('Mission créée. Diffusez-la aux intérimaires.'); go('missions'); }),
  diffuser: (fd, f) => act(async () => {
    const r = await POST(`/missions/${f.dataset.id}/diffuser`, { interims: fd.getAll('interim').map(Number), canaux: fd.getAll('canal'), taux_horaire: Number(fd.get('taux_horaire')) });
    closeModal(); toast(`Mission envoyée à ${r.envoyes} intérimaire${r.envoyes > 1 ? 's' : ''}${r.simules.length ? ` (${r.simules.join(', ')} : simulé, voir le journal)` : ''}.`); reload();
  }),
  interim: (fd, f) => act(async () => {
    const b = Object.fromEntries(fd); if (!b.taux_horaire) delete b.taux_horaire;
    const r = f.dataset.id ? await PUT(`/interimaires/${f.dataset.id}`, b) : await POST('/interimaires', b);
    S.p.isel = r.id; closeModal(); toast('Fiche enregistrée'); go('interimaires');
  }),
  psuivi: (fd, f) => act(async () => { await PUT(`/prospects/${f.dataset.id}`, Object.fromEntries(fd)); closeModal(); toast('Suivi enregistré'); reload(); }),
  visite: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    try { await POST('/prospects', lireQuestionnaire(fd)); } catch (e) { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); return; }
    closeModal(); toast('Visite enregistrée'); go('prospects');
  }),
  annul: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    const motif = [fd.get('raison'), fd.get('precision')].filter(Boolean).join(' : ');
    let r; try { r = await POST(`/missions/${f.dataset.id}/${f.dataset.t}`, { motif }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    closeModal();
    toast(f.dataset.t === 'desister' ? 'Désistement enregistré : la place est remise à disposition et l\'agence est prévenue.' : `Mission annulée.${r.remis_a_disposition ? ` ${r.remis_a_disposition} intérimaire(s) remis à disposition.` : ''}`);
    if (f.dataset.suite) { const L = JSON.parse(f.dataset.suite); if (L.length) return indispoConflits(L, motif); }
    reload();
  }),
  indispo: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    const t = S.cfg?.aujourdhui, quand = fd.get('quand');
    const debut = quand === 'demain' ? addDays(t, 1) : quand === 'periode' ? fd.get('debut') : t, fin = quand === 'periode' ? fd.get('fin') : debut;
    const motif = [fd.get('raison'), fd.get('precision')].filter(Boolean).join(' : ');
    let r; try { r = await POST('/indisponible', { debut, fin, motif }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    closeModal();
    if (r.conflits.length) return indispoConflits(r.conflits, motif);
    toast(`Indisponibilité enregistrée (${r.jours} jour${r.jours > 1 ? 's' : ''}). L'agence est prévenue.`); reload();
  }),
  decision: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    let r; try { r = await POST(`${f.dataset.url}/decision`, { decision: f.dataset.d, rdv: fd.get('rdv') || null, sujet: fd.get('sujet'), texte: fd.get('texte') }); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
    closeModal();
    const e = r.envois[0], canal = e ? (e.canal === 'mail' ? 'E-mail' : 'SMS') : '';
    toast(`${r.decision === 'acceptee' ? 'Candidature acceptée' : 'Candidature refusée'}. ${e ? (e.statut === 'envoye' ? `${canal} envoyé.` : e.statut === 'simule' ? `${canal} simulé (messagerie non configurée, voir le journal).` : `${canal} non envoyé : ${e.detail}`) : 'Aucun moyen de contact : décision enregistrée.'}`, e && e.statut === 'echec');
    reload();
  }),
  csuivi: (fd, f) => act(async () => { await PUT(`/candidats/${f.dataset.id}`, Object.fromEntries(fd)); closeModal(); toast('Suivi enregistré'); reload(); }),
  candidature: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    for (const [k, v] of [...fd]) if (v === '' || (v instanceof File && !v.size)) fd.delete(k);
    if (jetonVisite('candidature')) fd.set('visite', jetonVisite('candidature'));
    try { await POST('/public/candidature', fd); } catch (e) { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    f.closest('.contact-card').innerHTML = contactMerci();
    window.scrollTo(0, 0);
  }),
  contact: (fd, f) => act(async () => {
    const err = f.querySelector('.err'); err.hidden = true;
    try { await POST('/public/contact', { ...lireQuestionnaire(fd), visite: jetonVisite('contact') }); } catch (e) { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    f.closest('.contact-card').innerHTML = contactMerci();
    window.scrollTo(0, 0);
  }),
  ccnew: (fd, f) => act(async () => { await POST('/contrats-clients', { ...Object.fromEntries(fd), client_id: Number(f.dataset.id) }); closeModal(); toast('Contrat enregistré. L\'entreprise est invitée à le signer dans son espace.'); reload(); }),
  ccsign: (fd, f) => act(async () => { const k = await POST(`/contrats-clients/${f.dataset.id}/signer`, { nom: fd.get('nom'), accepte: fd.get('accepte') === '1' }); closeModal(); toast(`Contrat signé : coefficient ${num(k.coefficient)} appliqué.`); S.cfg = await GET('/config').catch(() => S.cfg); reload(); }),
  client: (fd, f) => act(async () => { const b = Object.fromEntries(fd); const r = f.dataset.id ? await PUT(`/clients/${f.dataset.id}`, b) : await POST('/clients', b); S.p.csel = r.id; closeModal(); toast('Fiche enregistrée'); go('clients'); }),
  upload: fd => act(async () => { await api('POST', '/documents', fd); toast('Document déposé'); reload(); }),
  demande: fd => act(async () => { await POST('/missions', Object.fromEntries(fd)); toast('Demande envoyée. L\'agence va la valider et la diffuser.'); reload(); }),
  jour: fd => { S.p.jd = fd.get('date'); reload(); },
  evaluer: (fd, f) => act(async () => { if (!fd.get('note')) throw new Error('Choisissez une note de 1 à 5 étoiles.'); await POST(`/heures/${f.dataset.id}/evaluer`, Object.fromEntries(fd)); toast('Note enregistrée'); reload(); }),
  confirmer: (fd, f) => act(async () => {
    const x = fd.has('avec_extra'), err = f.querySelector('.err'); if (err) err.hidden = true;
    const b = { ...(x ? { extra: Number(fd.get('extra')), justification: fd.get('justification') } : {}), note: Number(fd.get('note')) || undefined, points: fd.getAll('points'), commentaire: fd.get('commentaire') || '' };
    try { await POST(`/heures/${f.dataset.id}/confirmer`, b); } catch (e) { if (err) { err.textContent = e.message; err.hidden = false; return; } throw e; }
    toast(x ? 'Heures et note envoyées. L\'employeur doit accepter les heures en plus.' : 'Heures confirmées, merci pour votre note.'); reload();
  }),
  noteprivee: (fd, f) => act(async () => { await PUT(`/notes-privees/${f.dataset.id}`, { texte: fd.get('texte') }); toast('Note privée enregistrée'); }),
  hedit: (fd, f) => act(async () => { await PUT(`/heures/${f.dataset.id}`, { heures_prevues: Number(fd.get('h')) }); closeModal(); toast('Heures corrigées'); reload(); }),
  facturer: fd => act(async () => { const r = await POST('/factures/generer', Object.fromEntries(fd)); toast(r.creees.length ? `${r.creees.length} facture(s) créée(s) : ${r.creees.join(', ')}` : 'Aucune heure validée à facturer sur cette période.'); reload(); }),
  paie: fd => { S.p.pd = fd.get('debut'); S.p.pf = fd.get('fin'); reload(); },
  accagence: fd => act(async () => { const c = await POST('/acces', { type: 'agence', nom: fd.get('nom') }); await reload(); credModal(c, 'Accès agence créé'); }),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  if (el.type === 'checkbox') return; // géré par l'événement change
  fn(el, e);
});
document.addEventListener('change', e => {
  const el = e.target; if (el.dataset?.a === 'toggleextra') A.toggleextra(el);
  // Réglage d'un compte : comme l'espace, accessible ou verrouillé
  if (el.dataset?.a === 'droitcompte') act(async () => { await PUT('/droits', { cible: el.dataset.c, fonction: el.dataset.f, acces: el.value === '' ? null : el.value === 'true' }); toast('Réglage du compte enregistré'); reload(); });
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || (e.key === ' ' && e.target.matches('.cs-jour'))) && e.target.matches('tr.clickable[data-a],.cs-jour')) { e.preventDefault(); e.target.click(); } if (e.key === 'Escape') closeModal(); });
/** Minimum HCR d'un poste (Paramètres › Convention HCR), SMIC pour un poste hors liste. */
function tauxPoste(poste) { const T = S.cfg?.taux_postes || {}, k = Object.keys(T).find(p => p.toLowerCase() === String(poste || '').trim().toLowerCase()); return k ? T[k] : (S.cfg?.smic || 0); }
document.addEventListener('input', e => {
  const f = e.target.closest?.('form[data-f="mission"]');
  if (f && e.target.name === 'poste') {
    const t = f.querySelector('[name="taux_horaire"]'), min = tauxPoste(e.target.value);
    if (t) { t.value = min.toFixed(2); f.querySelector('[data-taux-aide]').textContent = `Minimum HCR du poste : ${eur(min)}. Modifiable à la hausse.`; }
  }
});
document.addEventListener('input', e => { if (e.target.matches?.('[data-coef-saisie]')) margeCoef(); });
// Créneau de rendez-vous choisi : le message proposé est mis à jour
document.addEventListener('change', async e => {
  if (!e.target.matches?.('[data-rdv]')) return;
  const f = e.target.form, m = await GET(`${f.dataset.url}/modele?decision=${f.dataset.d}&rdv=${encodeURIComponent(e.target.value)}`).catch(() => null);
  if (m) f.querySelector('[data-texte]').value = m.texte;
});
document.addEventListener('change', e => {
  if (e.target.name === 'quand') { const z = e.target.form.querySelector('[data-periode]'); if (z) z.hidden = e.target.value !== 'periode'; }
  // Motif « remplacement » : nom et poste du salarié remplacé (mentions obligatoires)
  if (e.target.matches?.('[data-motif]')) { const z = e.target.form.querySelector('[data-remplace]'); z.hidden = !/remplacement/i.test(e.target.value); z.querySelector('input').required = !z.hidden; }
  // Questionnaire : « Rarement / jamais » saute les questions sur les renforts actuels
  if (e.target.name === 'frequence') e.target.form.querySelectorAll('[data-skip]').forEach(x => { x.hidden = e.target.value === 'Rarement / jamais'; });
  // « Autre » coché : champ de précision
  const t = e.target.form?.querySelector(`[name="${e.target.name}_autre"]`);
  if (t && (e.target.type === 'radio' || e.target.value === 'Autre')) { t.hidden = !(e.target.value === 'Autre' && e.target.checked); if (!t.hidden) t.focus(); }
});
document.addEventListener('input', e => { const f = e.target.closest?.('form[data-f="mission"],form[data-f="demande"],form[data-f="diffuser"]'); if (f && e.target.name !== 'interim' && e.target.name !== 'canal') majSimulation(f); });
document.addEventListener('input', e => { if (e.target.dataset && 'rules' in e.target.dataset) { const r = $('#rules'); if (r) r.innerHTML = rulesHtml(e.target.value); } });
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f) return;
  e.preventDefault(); const fn = F[f.dataset.f]; if (fn) fn(new FormData(f), f);
});

boot();
