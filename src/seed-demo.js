'use strict';
// Données de démonstration (fictives). Usage : npm run demo
// Tous les comptes de démonstration utilisent le mot de passe « Demo2026! », sauf camille.roux (première connexion).
const bcrypt = require('bcryptjs');
const { one, all, run, tx } = require('./db');
const dossier = require('./dossier');
require('./prospects'); // crée la table des prospects
require('./visites'); // crée la table des visites
require('./candidats'); // crée la table des candidatures

if (one('SELECT 1 FROM clients LIMIT 1')) {
  console.log('La base contient déjà des données : démonstration non installée. (npm run demo:reset pour repartir de zéro)');
  process.exit(0);
}
const PW = bcrypt.hashSync('Demo2026!', 10);
const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };

tx(() => {
  const user = (username, profil, nom, client_id = null, interim_id = null, must = 0, pw = PW) =>
    run('INSERT INTO users (username, password_hash, profil, nom, client_id, interim_id, must_change) VALUES (?,?,?,?,?,?,?)', username, pw, profil, nom, client_id, interim_id, must);
  if (!one('SELECT 1 FROM users WHERE username = ?', 'claire.morel')) user('claire.morel', 'agence', 'Claire Morel');

  const C = [
    ['Brasserie Le Comptoir', 'Restauration', 'Lyon 2e', 'Marc Dupuis', 'contact@lecomptoir.example', '04 78 00 00 01', 2.05],
    ['Hôtel Bellecour', 'Hôtellerie', 'Lyon 2e', 'Nadia Benard', 'reception@bellecour.example', '04 78 00 00 02', 2.1],
    ['Le Zinc, bar à cocktails', 'Bar', 'Lyon 1er', 'Hugo Laval', 'hugo@lezinc.example', '04 78 00 00 03', 2.0],
  ].map(([nom, secteur, ville, contact, email, telephone, coef]) =>
    Number(run('INSERT INTO clients (nom, secteur, ville, contact, email, telephone, coefficient, siret, adresse) VALUES (?,?,?,?,?,?,?,?,?)',
      nom, secteur, ville, contact, email, telephone, coef, '912 345 678 000' + Math.floor(Math.random() * 90 + 10), '12 rue Mercière').lastInsertRowid));
  user('comptoir.lyon', 'client', 'Marc Dupuis', C[0]);
  user('hotel.bellecour', 'client', 'Nadia Benard', C[1]);

  const I = [
    ['Yanis', 'Benali', 'Commis de cuisine', 'Cuisine', 'Lyon 7e', 'HACCP, mise en place, garde-manger', '3 ans en brasserie', 12.5],
    ['Camille', 'Roux', 'Chef de rang', 'Restauration', 'Villeurbanne', 'Anglais courant, service à l\'assiette, vins', '6 ans', 13.2],
    ['Mehdi', 'Ouali', 'Barman', 'Bar', 'Lyon 1er', 'Cocktails, caisse', '2 ans', 12.9],
    ['Lucas', 'Martin', 'Plongeur', 'Cuisine', 'Vénissieux', 'Plonge batterie, entretien', '1 an', 12.1],
    ['Thomas', 'Petit', 'Serveur', 'Restauration', 'Lyon 8e', 'Plateau, terrasse', '1 an', 12.2],
    ['Aïcha', 'Diallo', 'Cheffe de partie', 'Cuisine', 'Lyon 9e', 'Poisson, pâtisserie', '8 ans', 14.1],
  ].map(([prenom, nom, poste, secteur, ville, competences, experience, taux], k) =>
    Number(run('INSERT INTO interimaires (prenom, nom, poste, secteur, ville, competences, experience, taux_horaire, telephone, email, dossier_complet) VALUES (?,?,?,?,?,?,?,?,?,?,1)',
      prenom, nom, poste, secteur, ville, competences, experience, taux, `06 00 00 00 ${String(10 + k)}`, `${prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@exemple.fr`).lastInsertRowid));
  user('yanis.benali', 'interim', 'Yanis Benali', null, I[0]);
  user('camille.roux', 'interim', 'Camille Roux', null, I[1], 1, bcrypt.hashSync('Provisoire1', 10));
  user('lucas.martin', 'interim', 'Lucas Martin', null, I[3]);
  user('thomas.petit', 'interim', 'Thomas Petit', null, I[4]);

  const mission = (c, poste, date, debut, fin, nb, taux, statut) =>
    Number(run('INSERT INTO missions (client_id, poste, date, debut, fin, nb_postes, taux_horaire, statut) VALUES (?,?,?,?,?,?,?,?)', c, poste, date, debut, fin, nb, taux, statut).lastInsertRowid);
  const envoi = (m, i, canaux) => run('INSERT INTO envois (mission_id, interim_id, canaux) VALUES (?,?,?)', m, i, canaux);
  const rep = (m, i, etat) => run('INSERT INTO reponses (mission_id, interim_id, etat) VALUES (?,?,?)', m, i, etat);

  // Missions passées, verrouillées : heures à confirmer et à valider.
  const p1 = mission(C[0], 'Commis de cuisine', jour(-1), '10:00', '15:00', 1, 12.5, 'verrouillee');
  envoi(p1, I[0], 'sms'); rep(p1, I[0], 'retenu');
  run('INSERT INTO heures (mission_id, interim_id, heures_prevues) VALUES (?,?,5)', p1, I[0]);
  const p2 = mission(C[0], 'Chef de rang', jour(-1), '18:00', '23:30', 1, 13.2, 'verrouillee');
  envoi(p2, I[1], 'whatsapp'); rep(p2, I[1], 'retenu');
  run('INSERT INTO heures (mission_id, interim_id, heures_prevues, extra, justification, extra_statut, valide_interim) VALUES (?,?,5.5,1,?,\'attente\',1)', p2, I[1], 'Groupe de 24 couverts arrivé à 22 h');
  const p3 = mission(C[0], 'Plongeur', jour(-3), '18:00', '00:00', 1, 12.1, 'verrouillee');
  envoi(p3, I[3], 'sms'); rep(p3, I[3], 'retenu');
  const h3 = run('INSERT INTO heures (mission_id, interim_id, heures_prevues, valide_interim, valide_client) VALUES (?,?,6,1,1)', p3, I[3]).lastInsertRowid;
  run('INSERT INTO evaluations (heure_id, sens, note, commentaire, axe) VALUES (?,?,?,?,?)', h3, 'client_vers_interim', 3, 'Travail correct, 20 minutes de retard.', 'Ponctualité');

  // Missions à venir, à différents stades.
  mission(C[0], 'Serveur', jour(7), '18:00', '23:30', 2, 12.2, 'nouvelle');
  const f1 = mission(C[0], 'Commis de cuisine', jour(14), '18:00', '00:00', 1, 12.5, 'diffusee');
  envoi(f1, I[0], 'whatsapp,sms'); envoi(f1, I[3], 'sms'); envoi(f1, I[5], 'mail');
  const f2 = mission(C[1], 'Commis petit-déjeuner', jour(9), '06:30', '12:30', 1, 12.8, 'diffusee');
  envoi(f2, I[0], 'sms'); envoi(f2, I[5], 'whatsapp'); rep(f2, I[5], 'accepte');
  const f3 = mission(C[0], 'Chef de rang', jour(6), '18:00', '23:30', 2, 13.2, 'diffusee');
  envoi(f3, I[1], 'whatsapp'); envoi(f3, I[4], 'sms,mail'); rep(f3, I[1], 'accepte'); rep(f3, I[4], 'accepte');
  mission(C[2], 'Barman', jour(10), '19:00', '02:00', 1, 12.9, 'nouvelle');
  // Mission du soir même, non pourvue : signalée « importance haute ».
  const f4 = mission(C[0], 'Serveur', jour(0), '19:00', '23:30', 1, 12.2, 'diffusee');
  envoi(f4, I[0], 'sms,whatsapp'); envoi(f4, I[3], 'sms');

  // Historique des 5 derniers mois (statistiques) : missions réalisées, heures validées des deux côtés.
  const HIST = [[C[0], 'Serveur', I[4], '18:00', '23:30', 12.2], [C[0], 'Commis de cuisine', I[0], '10:00', '15:00', 12.5], [C[1], 'Femme de chambre', I[1], '08:00', '13:00', 12.1],
    [C[2], 'Barman', I[2], '19:00', '02:00', 12.9], [C[0], 'Plongeur', I[3], '18:00', '00:00', 12.1], [C[1], 'Réceptionniste', I[5], '07:00', '15:00', 12.4]];
  for (let k = 150; k >= 8; k -= 4) {
    const [c, poste, i, debut, fin, taux] = HIST[((150 - k) / 4) % HIST.length];
    const mh = mission(c, poste, jour(-k), debut, fin, 1, taux, 'verrouillee');
    run('UPDATE missions SET created_at = datetime(?, \'-3 days\'), verrouillee_at = datetime(?, \'-2 days\', \'+' + (k % 30) + ' hours\'), validee_le = datetime(?, \'-1 days\') WHERE id = ?', jour(-k), jour(-k), jour(-k), mh);
    envoi(mh, i, 'sms'); rep(mh, i, 'retenu');
    const [h1, m1] = debut.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
    const hh = run('INSERT INTO heures (mission_id, interim_id, heures_prevues, valide_interim, valide_client) VALUES (?,?,?,1,1)', mh, i, ((h2 * 60 + m2 - h1 * 60 - m1 + 1440) % 1440 || 1440) / 60).lastInsertRowid;
    run('INSERT INTO evaluations (heure_id, sens, note, commentaire) VALUES (?,\'client_vers_interim\',?,?)', hh, 4 + (k % 2), 'Bon service.');
    // Le Zinc : fiabilité en baisse (retards de prise de poste signalés), pour illustrer l'alerte note basse.
    if (c === C[2]) run('INSERT INTO evaluations (heure_id, sens, note, commentaire, axe) VALUES (?,\'interim_vers_client\',?,?,?)', hh, ((150 - k) / 4) % 12 < 6 ? 2 : 3, 'Personne pour ouvrir à l\'heure prévue.', 'Horaires non respectés');
    else run('INSERT INTO evaluations (heure_id, sens, note, commentaire) VALUES (?,\'interim_vers_client\',?,?)', hh, 4, 'Équipe accueillante.');
  }

  // Mission à venir pourvue : contrat en cours de signature (Yanis et l'employeur).
  const f6 = mission(C[0], 'Commis de cuisine', jour(3), '11:00', '15:00', 1, 12.5, 'verrouillee');
  envoi(f6, I[0], 'sms'); rep(f6, I[0], 'retenu');
  run('INSERT INTO heures (mission_id, interim_id, heures_prevues) VALUES (?,?,4)', f6, I[0]);

  // Données légales de l'agence et état civil des intérimaires (remplissent les contrats de mission).
  for (const [k, v] of [['representant_nom', 'Claire Morel'], ['representant_qualite', 'Gérante'], ['siret', '912 345 678 00017'], ['adresse', '5 rue de la République'],
    ['code_postal', '69002'], ['ville', 'Lyon'], ['garantie_financiere', 'Atradius, 75 000 €, 159 rue Anatole France, 92300 Levallois-Perret'], ['caisse_retraite', 'Klesia'],
    ['organisme_prevoyance', 'Intérimaires Santé / Intérimaires Prévoyance'], ['telephone', '04 78 00 00 00'], ['email', 'chr.interims@gmail.com']]) {
    run('INSERT INTO parametres (cle, valeur) VALUES (?,?) ON CONFLICT(cle) DO NOTHING', k, v);
  }
  run('UPDATE interimaires SET date_naissance = \'1998-03-14\', lieu_naissance = \'Lyon (France)\', nir = \'198036938812397\', adresse = \'14 rue de Marseille\', code_postal = \'69007\' WHERE id = ?', I[0]);
  I.slice(1).forEach((id, k) => run('UPDATE interimaires SET date_naissance = ?, lieu_naissance = ?, adresse = ?, code_postal = ? WHERE id = ?', `199${k}-0${k + 1}-1${k}`, 'Lyon (France)', `${10 + k} avenue Berthelot`, '69007', id));

  // Contrats et lignes d'expérience des missions déjà verrouillées.
  for (const m of all('SELECT m.*, c.nom AS client_nom FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.statut = \'verrouillee\'')) {
    dossier.surVerrouillage(m, all('SELECT interim_id FROM reponses WHERE mission_id = ? AND etat = \'retenu\'', m.id).map(x => x.interim_id), jour(0).slice(0, 4));
  }
  // Missions passées : contrats signés par l'intérimaire et l'employeur, missions validées.
  for (const k of all('SELECT k.id, i.prenom, i.nom, c.contact FROM contrats k JOIN missions m ON m.id = k.mission_id JOIN interimaires i ON i.id = k.interim_id JOIN clients c ON c.id = m.client_id WHERE m.date < ?', jour(0))) {
    run('UPDATE contrats SET created_at = datetime(\'now\',\'-6 days\'), statut = \'signe\', signe_le = datetime(\'now\',\'-5 days\'), signe_nom = ?, client_signe_le = datetime(\'now\',\'-4 days\'), client_signe_nom = ? WHERE id = ?', `${k.prenom} ${k.nom}`, `${k.contact}, gérant`, k.id);
  }
  run('UPDATE missions SET validee_le = datetime(\'now\',\'-4 days\') WHERE statut = \'verrouillee\' AND date < ?', jour(0));

  // Candidatures reçues par la page publique.
  run('INSERT INTO candidats (prenom, nom, telephone, email, ville, poste, reponses, statut) VALUES (?,?,?,?,?,?,?,\'nouveau\')', 'Inès', 'Moreau', '06 22 33 44 55', 'ines.moreau@exemple.fr', 'Lyon 3e', 'Serveur',
    JSON.stringify({ postes: ['Serveur', 'Chef de rang'], poste_principal: 'Serveur', experience: '1 à 3 ans', formations: ['Formation hygiène HACCP'], creneaux: ['Le soir', 'Le week-end'], type_mission: 'Extras ponctuels', prevenance: 'Sous 24 à 48 h', transport: ['Transports en commun'], rayon: '10 à 25 km', tenue: 'Oui, complète', canal: 'WhatsApp', autorisation: 'Nationalité française ou européenne' }));
  run('INSERT INTO candidats (prenom, nom, telephone, ville, poste, reponses, statut, date_relance) VALUES (?,?,?,?,?,?,\'a_rappeler\',?)', 'Karim', 'Haddad', '06 33 44 55 66', 'Villeurbanne', 'Cuisinier',
    JSON.stringify({ postes: ['Cuisinier', 'Chef de partie'], poste_principal: 'Cuisinier', experience: 'Plus de 3 ans', formations: ['CAP / BEP cuisine ou service'], creneaux: ['En semaine', 'Le soir'], type_mission: 'Missions régulières', canal: 'SMS' }), jour(0));

  // Prospects : une demande reçue par le site, une visite terrain à relancer aujourd'hui.
  run(`INSERT INTO prospects (source, etablissement, adresse, repondant, telephone, email, type_etab, reponses, accord, statut) VALUES ('site',?,?,?,?,?,?,?, 'en_ligne', 'nouveau')`,
    'La Table du Marché', 'Lyon 6e', 'Sophie Garnier, gérante', '06 11 22 33 44', 'sophie@tabledumarche.example', 'Restauration traditionnelle / gastronomique',
    JSON.stringify({ frequence: 'Ponctuellement (1 à 3 fois par mois)', postes: ['Cuisinier / chef de partie', 'Serveur / chef de rang'], delai: 'Court terme (24 à 48 h)', problemes: ['Manque de réactivité (délais trop longs)'], services: ['Garantie de remplacement sous 2 heures'], coefficient: 'Entre 1,95 et 2,10', message: 'Besoin de deux extras les samedis soir.' }));
  run(`INSERT INTO prospects (source, etablissement, adresse, repondant, telephone, type_etab, reponses, date_visite, enqueteur, accord, statut, date_relance, notes_agence) VALUES ('visite',?,?,?,?,?,?,?, 'Claire Morel', 'oral', 'a_relancer', ?, ?)`,
    'Hôtel des Célestins', 'Lyon 2e', 'Paul Martin, directeur', '04 78 11 22 33', 'Hôtel / hôtel-restaurant',
    JSON.stringify({ frequence: 'Saisonnier / événementiel', postes: ['Employé d\'étage / gouvernante', 'Réceptionniste / veilleur de nuit'], satisfaction: 'Moyennement satisfait', reglement: 'Virement à 30 jours' }),
    jour(-7), jour(0), 'Intéressé pour la saison des salons. Envoyer une proposition tarifaire.');
  run('INSERT INTO experiences (interim_id, debut, fin, employeur, poste, description) VALUES (?,?,?,?,?,?)', I[0], '2021-09-01', '2024-06-30', 'Restaurant L\'Ardoise, Lyon', 'Commis de cuisine', 'Brasserie de 80 couverts, poste garde-manger puis chaud.');
  run('INSERT INTO experiences (interim_id, debut, fin, employeur, poste) VALUES (?,?,?,?,?)', I[0], '2019-09-01', '2021-06-30', 'Lycée hôtelier François Rabelais', 'CAP Cuisine (formation)');
  // Fiche de paie de Lucas (heures validées des deux côtés).
  const h3b = one('SELECT h.id, m.taux_horaire, h.heures_prevues FROM heures h JOIN missions m ON m.id = h.mission_id WHERE h.id = ?', h3);
  const brut = h3b.heures_prevues * h3b.taux_horaire, ifm = brut * 0.1, iccp = (brut + ifm) * 0.1, r2 = n => Math.round(n * 100) / 100;
  const b = run('INSERT INTO bulletins (interim_id, debut, fin, heures, brut, ifm, iccp, total) VALUES (?,?,?,?,?,?,?,?)', I[3], jour(-15), jour(0), h3b.heures_prevues, r2(brut), r2(ifm), r2(iccp), r2(brut + ifm + iccp));
  run('INSERT INTO bulletin_heures (bulletin_id, heure_id) VALUES (?,?)', b.lastInsertRowid, h3);

  for (let k = 1; k <= 20; k++) run('INSERT OR IGNORE INTO disponibilites (interim_id, date, etat) VALUES (?,?,?)', I[0], jour(k), k % 7 === 0 ? 'indisponible' : 'disponible');
  // Journal des envois : quelques messages de chaque canal
  for (const [c, d, t, st, det] of [
    ['mail', 'yanis.benali@exemple.fr', 'CHR Intérim : nouvelle mission Commis de cuisine chez Brasserie Le Comptoir.', 'simule', 'Canal non configuré'],
    ['mail', 'contact@lecomptoir.example', 'CHR Intérim : contrat de mission à signer.', 'simule', 'Canal non configuré'],
    ['mail', 'ines.moreau@exemple.fr', 'Bonjour Inès, merci pour votre candidature au poste de Serveur.', 'echec', 'Identifiant ou mot de passe SMTP refusé.'],
    ['sms', '+33612345678', 'CHR Intérim : nouvelle mission Serveur samedi 18:00–23:30.', 'simule', 'Canal non configuré'],
    ['sms', '+33622334455', 'CHR Intérim : rappel, mission demain 07:00.', 'simule', 'Canal non configuré'],
    ['whatsapp', '+33633445566', 'CHR Intérim : vos heures sont à valider.', 'simule', 'Canal non configuré'],
  ]) run('INSERT INTO envois_messages (canal, destinataire, contenu, statut, detail) VALUES (?,?,?,?,?)', c, d, t, st, det);
  // Visites du site sur 6 mois (mesure d'audience des liens), en hausse depuis les publications Facebook.
  const ORIGINES = ['facebook', 'facebook', 'facebook', 'mail', 'site', 'site', 'qr', 'recherche', 'facebook', 'mail', 'sms', 'autre'];
  for (let k = 0; k < 170; k++) {
    const age = Math.floor(k * k / 170), page = ['contact', 'candidature', 'candidature', 'connexion'][k % 4];
    run('INSERT INTO visites (jeton, page, source, converti, created_at) VALUES (?,?,?,?, datetime(\'now\', ?))', require('crypto').randomBytes(16).toString('hex'),
      page, ORIGINES[k % ORIGINES.length], page !== 'connexion' && k % 7 === 0 ? 1 : 0, `-${age} days`);
  }
  run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', I[0], f1, 'Nouvelle mission : Commis de cuisine chez Brasserie Le Comptoir');
});
console.log('Démonstration installée. Comptes (mot de passe « Demo2026! ») : claire.morel (agence), comptoir.lyon (employeur), yanis.benali, lucas.martin, thomas.petit (intérimaires).');
console.log('camille.roux : mot de passe provisoire « Provisoire1 » (changement obligatoire à la première connexion).');
