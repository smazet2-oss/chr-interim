'use strict';
// Données de démonstration (fictives). Usage : npm run demo
// Tous les comptes de démonstration utilisent le mot de passe « Demo2026! », sauf camille.roux (première connexion).
const bcrypt = require('bcryptjs');
const { one, all, run, tx } = require('./db');
const dossier = require('./dossier');
require('./prospects'); // crée la table des prospects
require('./visites'); // crée la table des visites
require('./etude'); // crée les tables de l'étude de marché
require('./candidats'); // crée la table des candidatures
require('./partenaires'); // crée les tables des partenariats
const RELEVES = require('./releves'); // relevés mensuels des partenaires

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
    ['Lucas', 'Martin', 'Plongeur', 'Cuisine', 'Vénissieux', 'Plonge batterie, entretien', '1 an', 12.31],
    ['Thomas', 'Petit', 'Serveur', 'Restauration', 'Lyon 8e', 'Plateau, terrasse', '1 an', 12.31],
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
  const p3 = mission(C[0], 'Plongeur', jour(-3), '18:00', '00:00', 1, 12.31, 'verrouillee');
  envoi(p3, I[3], 'sms'); rep(p3, I[3], 'retenu');
  const h3 = run('INSERT INTO heures (mission_id, interim_id, heures_prevues, valide_interim, valide_client) VALUES (?,?,6,1,1)', p3, I[3]).lastInsertRowid;
  run('INSERT INTO evaluations (heure_id, sens, note, commentaire, axe) VALUES (?,?,?,?,?)', h3, 'client_vers_interim', 3, 'Travail correct, 20 minutes de retard.', 'Ponctualité');

  // Missions à venir, à différents stades.
  mission(C[0], 'Serveur', jour(7), '18:00', '23:30', 2, 12.31, 'nouvelle');
  const f1 = mission(C[0], 'Commis de cuisine', jour(14), '18:00', '00:00', 1, 12.5, 'diffusee');
  envoi(f1, I[0], 'whatsapp,sms'); envoi(f1, I[3], 'sms'); envoi(f1, I[5], 'mail');
  const f2 = mission(C[1], 'Commis petit-déjeuner', jour(9), '06:30', '12:30', 1, 12.8, 'diffusee');
  envoi(f2, I[0], 'sms'); envoi(f2, I[5], 'whatsapp'); rep(f2, I[5], 'accepte');
  const f3 = mission(C[0], 'Chef de rang', jour(6), '18:00', '23:30', 2, 13.2, 'diffusee');
  envoi(f3, I[1], 'whatsapp'); envoi(f3, I[4], 'sms,mail'); rep(f3, I[1], 'accepte'); rep(f3, I[4], 'accepte');
  mission(C[2], 'Barman', jour(10), '19:00', '02:00', 1, 12.9, 'nouvelle');
  // Mission du soir même, non pourvue : signalée « importance haute ».
  const f4 = mission(C[0], 'Serveur', jour(0), '19:00', '23:30', 1, 12.31, 'diffusee');
  envoi(f4, I[0], 'sms,whatsapp'); envoi(f4, I[3], 'sms');

  // Historique des 5 derniers mois (statistiques) : missions réalisées, heures validées des deux côtés.
  const HIST = [[C[0], 'Serveur', I[4], '18:00', '23:30', 12.31], [C[0], 'Commis de cuisine', I[0], '10:00', '15:00', 12.5], [C[1], 'Femme de chambre', I[1], '08:00', '13:00', 12.31],
    [C[2], 'Barman', I[2], '19:00', '02:00', 12.9], [C[0], 'Plongeur', I[3], '18:00', '00:00', 12.31], [C[1], 'Réceptionniste', I[5], '07:00', '15:00', 12.4]];
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

  // Une intérimaire mineure (17 ans) et un veilleur de nuit de 66 ans : alertes d'âge et conditions particulières
  {
    const ans = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 40); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); };
    run('INSERT INTO interimaires (prenom, nom, poste, secteur, ville, competences, experience, taux_horaire, telephone, email, date_naissance, lieu_naissance, dossier_complet) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)',
      'Léna', 'Robert', 'Commis de salle', 'Restauration', 'Villeurbanne', 'Bac pro CSR en cours', 'Stages en brasserie', 12.31, '06 00 00 00 21', 'lena@exemple.fr', ans(17), 'Lyon (France)');
    run('INSERT INTO interimaires (prenom, nom, poste, secteur, ville, competences, experience, taux_horaire, telephone, email, date_naissance, lieu_naissance, dossier_complet) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)',
      'Gérard', 'Lambert', 'Veilleur de nuit', 'Hôtellerie', 'Lyon 3e', 'Accueil, sécurité incendie (SSIAP 1)', '30 ans en hôtellerie', 12.31, '06 00 00 00 22', 'gerard@exemple.fr', ans(66), 'Mâcon (France)');
    // Serveur de nationalité étrangère, carte de résident pas encore vérifiée à la préfecture : missions proches grisées
    run('INSERT INTO interimaires (prenom, nom, poste, secteur, ville, competences, experience, taux_horaire, telephone, email, date_naissance, lieu_naissance, nationalite, titre_sejour, titre_expiration, dossier_complet) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
      'Amadou', 'Traoré', 'Serveur', 'Restauration', 'Lyon 8e', 'Service en salle, anglais', '4 ans en brasserie', 12.31, '06 00 00 00 23', 'amadou@exemple.fr', ans(29), 'Bamako (Mali)', 'Autre', 'Carte de résident ou carte « résident de longue durée-UE »', jour(900));
  }

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
    JSON.stringify({ situation: 'Étudiant(e)', postes: ['Serveur', 'Chef de rang'], poste_principal: 'Serveur', experience: '1 à 3 ans', formations: ['Formation hygiène HACCP'], creneaux: ['Le soir', 'Le week-end'], type_mission: 'Extras ponctuels', prevenance: 'Sous 24 à 48 h', transport: ['Transports en commun'], rayon: '10 à 25 km', tenue: 'Oui, complète', canal: 'WhatsApp', autorisation: 'Nationalité française ou européenne' }));
  // Candidatures de nationalité étrangère : une étudiante (titre « étudiant », conditions) et une personne sans autorisation de travail (non acceptable)
  run('INSERT INTO candidats (prenom, nom, telephone, email, ville, poste, reponses, statut) VALUES (?,?,?,?,?,?,?,\'nouveau\')', 'Mei', 'Chen', '06 44 55 66 77', 'mei.chen@exemple.fr', 'Lyon 7e', 'Serveur',
    JSON.stringify({ nationalite_cat: 'Autre nationalité', titre_sejour: 'Titre de séjour ou visa long séjour « étudiant »', titre_expiration: jour(300), situation: 'Étudiant(e)', postes: ['Serveur'], poste_principal: 'Serveur', experience: 'Moins d\'un an', creneaux: ['Le soir', 'Le week-end'], type_mission: 'Extras ponctuels' }));
  run('INSERT INTO candidats (prenom, nom, telephone, ville, poste, reponses, statut) VALUES (?,?,?,?,?,?,\'nouveau\')', 'Diego', 'Ramos', '06 55 66 77 88', 'Vénissieux', 'Plongeur',
    JSON.stringify({ nationalite_cat: 'Autre nationalité', titre_sejour: 'Visa court séjour, touriste ou visiteur', situation: 'Sans emploi / demandeur d\'emploi', postes: ['Plongeur'], poste_principal: 'Plongeur', experience: '1 à 3 ans', creneaux: ['En semaine'], type_mission: 'Missions régulières' }));
  // CV de démonstration (PDF d'une page) joint à la candidature d'Inès
  {
    const lignes = ['Ines MOREAU - Serveuse / Chef de rang', 'Lyon 3e - 06 22 33 44 55 - ines.moreau@exemple.fr', '', 'EXPERIENCE', '2023-2026  Serveuse, Brasserie des Celestins, Lyon 2e', '2022-2023  Commis de salle, Hotel du Parc, Lyon 6e', '', 'FORMATION', 'Formation hygiene HACCP (2022)', 'Bac pro Commercialisation et services en restauration', '', 'DISPONIBILITES', 'Le soir et le week-end - vehiculee'];
    const flux = 'BT /F1 13 Tf 60 780 Td 18 TL ' + lignes.map(l => `(${l.replace(/[()\\]/g, '')}) '`).join(' ') + ' ET';
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let pdf = '%PDF-1.4\n'; const pos = [];
    objs.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    const dir = require('path').join(require('./db').DATA_DIR, 'cv'); require('fs').mkdirSync(dir, { recursive: true });
    const fichier = require('crypto').randomBytes(16).toString('hex') + '.pdf';
    require('fs').writeFileSync(require('path').join(dir, fichier), pdf, 'latin1');
    run('UPDATE candidats SET cv_fichier = ?, cv_nom = ? WHERE prenom = ? AND nom = ?', fichier, 'CV Ines Moreau.pdf', 'Inès', 'Moreau');
  }
  run('INSERT INTO candidats (prenom, nom, telephone, ville, poste, reponses, statut, date_relance) VALUES (?,?,?,?,?,?,\'a_rappeler\',?)', 'Karim', 'Haddad', '06 33 44 55 66', 'Villeurbanne', 'Cuisinier',
    JSON.stringify({ situation: 'Sans emploi / demandeur d\'emploi', postes: ['Cuisinier', 'Chef de partie'], poste_principal: 'Cuisinier', experience: 'Plus de 3 ans', formations: ['CAP / BEP cuisine ou service'], creneaux: ['En semaine', 'Le soir'], type_mission: 'Missions régulières', canal: 'SMS' }), jour(0));

  // Prospects : une demande reçue par le site, une visite terrain à relancer aujourd'hui.
  run(`INSERT INTO prospects (source, etablissement, adresse, repondant, telephone, email, type_etab, reponses, accord, statut) VALUES ('site',?,?,?,?,?,?,?, 'en_ligne', 'nouveau')`,
    'La Table du Marché', 'Lyon 6e', 'Sophie Garnier, gérante', '06 11 22 33 44', 'sophie@tabledumarche.example', 'Restauration traditionnelle / gastronomique',
    JSON.stringify({ frequence: 'Ponctuellement (1 à 3 fois par mois)', postes: ['Cuisinier', 'Serveur / chef de rang'], delai: 'Court terme (24 à 48 h)', problemes: ['Manque de réactivité (délais trop longs)'], services: ['Garantie de remplacement sous 2 heures'], coefficient: 'Entre 1,95 et 2,10', message: 'Besoin de deux extras les samedis soir.' }));
  run(`INSERT INTO prospects (source, etablissement, adresse, repondant, telephone, type_etab, reponses, date_visite, enqueteur, accord, statut, date_relance, notes_agence) VALUES ('visite',?,?,?,?,?,?,?, 'Claire Morel', 'oral', 'a_relancer', ?, ?)`,
    'Hôtel des Célestins', 'Lyon 2e', 'Paul Martin, directeur', '04 78 11 22 33', 'Hôtel / hôtel-restaurant',
    JSON.stringify({ frequence: 'Saisonnier / événementiel', postes: ['Employé d\'étage / femme de chambre', 'Réceptionniste / veilleur de nuit'], satisfaction: 'Moyennement satisfait', reglement: 'Virement à 30 jours' }),
    jour(-7), jour(0), 'Intéressé pour la saison des salons. Envoyer une proposition tarifaire.');
  // Étude de marché saisie avec le gérant de la Brasserie Le Comptoir, rattachée à sa fiche client
  run(`INSERT INTO prospects (source, etablissement, adresse, repondant, telephone, email, type_etab, reponses, date_visite, enqueteur, accord, statut, client_id, notes_agence) VALUES ('visite',?,?,?,?,?,?,?,?, 'Claire Morel', 'client', 'client', ?, ?)`,
    'Brasserie Le Comptoir', '12 rue Mercière, Lyon 2e', 'Marc Dupuis, gérant', '04 78 00 00 01', 'contact@lecomptoir.example', 'Brasserie / restauration rapide',
    JSON.stringify({ etablissement: 'Brasserie Le Comptoir', type_etab: 'Brasserie / restauration rapide', effectif: '5 à 15 personnes', frequence: 'Régulièrement (plusieurs fois par semaine)',
      postes: ['Serveur / chef de rang', 'Commis / plongeur'], extras_mois: 12, heures_mois: 70, pics: 'Fêtes des Lumières, terrasse de mai à septembre', vehicule: true, delai: 'Court terme (24 à 48 h)',
      canaux: ['Réseau personnel / bouche-à-oreille', 'Agences d\'intérim traditionnelles'], agences: 'Une agence généraliste', satisfaction: 'Moyennement satisfait',
      problemes: ['Manque de réactivité (délais trop longs)', 'Retards, absences ou abandons de poste'], probleme_principal: 'Retards, absences ou abandons de poste',
      services: ['Garantie de remplacement sous 2 heures', 'Gestion 100 % dématérialisée (smartphone)'], prix_serveur: 23, prix_cuisinier: 26, coefficient: 'Entre 1,95 et 2,10',
      reglement: 'Virement à 30 jours', releve: 'Oui, par WhatsApp', message: 'Besoin surtout le vendredi et le samedi soir.' }),
    jour(-20), C[0], 'Très satisfait des premiers extras. Souhaite un interlocuteur joignable le soir.');
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
  // Étude de marché de l'année : réponses anonymes de démonstration (établissements et intérimaires) et quelques invitations
  {
    const an = Number(jour(0).slice(0, 4)), pick = (L, k) => L[k % L.length], rid = () => require('crypto').randomBytes(16).toString('hex');
    for (let k = 0; k < 14; k++) run('INSERT INTO etude_reponses (annee, cible, rid, source, reponses, complet) VALUES (?,?,?,?,?,1)', an, 'etablissement', rid(), k % 3 ? 'mail' : 'site', JSON.stringify({
      type_etab: pick(['Restauration traditionnelle / gastronomique', 'Brasserie / restauration rapide', 'Hôtel / hôtel-restaurant', 'Bar / pub / discothèque', 'Traiteur / événementiel'], k),
      effectif: pick(['Moins de 5 personnes', '5 à 15 personnes', '5 à 15 personnes', 'Plus de 15 personnes'], k),
      frequence: pick(['Ponctuellement (1 à 3 fois par mois)', 'Régulièrement (plusieurs fois par semaine)', 'Saisonnier / événementiel', 'Ponctuellement (1 à 3 fois par mois)', 'Rarement / jamais'], k),
      postes: [pick(['Cuisinier', 'Serveur / chef de rang', 'Commis / plongeur'], k), pick(['Serveur / chef de rang', 'Barman / limonadier', 'Réceptionniste / veilleur de nuit'], k + 1)],
      delai: pick(['Court terme (24 à 48 h)', 'Urgence absolue (moins de 4 h)', 'Planifié (plus d\'une semaine)'], k),
      problemes: [pick(['Manque de réactivité (délais trop longs)', 'Profils non qualifiés / sans expérience HCR', 'Retards, absences ou abandons de poste', 'Coût / tarifs trop élevés'], k)],
      services: [pick(['Garantie de remplacement sous 2 heures', 'Profils évalués et équipés (tenue HCR)', 'Gestion 100 % dématérialisée (smartphone)'], k)],
      prix_serveur: 22 + (k % 5), prix_cuisinier: 25 + (k % 6), coefficient: pick(['Entre 1,95 et 2,10', 'Moins de 1,95', 'Entre 2,10 et 2,25'], k), vehicule: k % 4 === 0 || undefined }));
    for (let k = 0; k < 11; k++) run('INSERT INTO etude_reponses (annee, cible, rid, source, reponses, complet) VALUES (?,?,?,?,?,1)', an, 'interimaire', rid(), k % 2 ? 'mail' : 'site', JSON.stringify({
      situation: pick(['Étudiant(e)', 'Salarié(e)', 'Sans emploi / demandeur d\'emploi', 'Étudiant(e)', 'Retraité(e)'], k), postes: [pick(['Serveur', 'Commis de cuisine', 'Plongeur', 'Barman', 'Cuisinier'], k)], experience: pick(['1 à 3 ans', 'Plus de 3 ans', 'Moins d\'un an', 'Débutant(e)'], k),
      creneaux: ['Le soir', pick(['Le week-end', 'En semaine', 'La nuit'], k)], type_mission: pick(['Extras ponctuels', 'Missions régulières', 'Tout type de mission', 'Saison complète'], k),
      prevenance: pick(['Sous 24 à 48 h', 'Le jour même', 'Avec une semaine de prévenance'], k), rayon: pick(['10 à 25 km', 'Moins de 10 km', 'Plus de 25 km'], k),
      taux_souhaite: 12 + (k % 4) * 0.5, priorites: [pick(['Paiement rapide', 'Planning flexible', 'Missions proches de chez moi', 'Évoluer vers un CDI'], k)], canal: pick(['WhatsApp', 'SMS', 'E-mail'], k), vehicule: k % 3 === 0 || undefined }));
    for (const [c, e, n, cl, rep] of [['etablissement', 'contact@lecomptoir.example', 'Brasserie Le Comptoir', 1, 1], ['etablissement', 'sophie@tabledumarche.example', 'Sophie Garnier', 1, 0], ['interimaire', 'yanis.benali@exemple.fr', 'Yanis', 1, 1]])
      run(`INSERT INTO etude_envois (annee, cible, email, nom, jeton, envoye_le, statut, clique_le, repondu_le) VALUES (?,?,?,?,?, datetime('now', '-6 days'), 'envoye', ${cl ? "datetime('now', '-5 days')" : 'NULL'}, ${rep ? "datetime('now', '-5 days')" : 'NULL'})`, an, c, e, n, rid());
  }
  // Visites du site sur 6 mois (mesure d'audience des liens), en hausse depuis les publications Facebook.
  const ORIGINES = ['facebook', 'facebook', 'facebook', 'mail', 'site', 'site', 'qr', 'recherche', 'facebook', 'mail', 'sms', 'autre'];
  for (let k = 0; k < 170; k++) {
    const age = Math.floor(k * k / 170), page = ['contact', 'candidature', 'candidature', 'connexion'][k % 4];
    run('INSERT INTO visites (jeton, page, source, converti, created_at) VALUES (?,?,?,?, datetime(\'now\', ?))', require('crypto').randomBytes(16).toString('hex'),
      page, ORIGINES[k % ORIGINES.length], page !== 'connexion' && k % 7 === 0 ? 1 : 0, `-${age} days`);
  }
  run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', I[0], f1, 'Nouvelle mission : Commis de cuisine chez Brasserie Le Comptoir');
  // Partenariat : agence ETT partenaire (apport d'affaires en sourcing), son accès, un besoin et des candidats présentés
  {
    const pid = Number(run(`INSERT INTO partenaires (raison_sociale, siret, adresse, ville, contact, email, telephone, zones, metiers, commission_type, commission_valeur, convention_numero, convention_signee_le, convention_signee_nom, convention_signee_mode)
      VALUES (?,?,?,?,?,?,?,?,?, 'forfait', 350, ?, datetime('now', '-30 days'), ?, 'en_ligne')`, 'Rhône Emploi Intérim', '812 345 678 00021', '45 cours Lafayette', 'Lyon 3e', 'Nadia Benali, directrice d\'agence',
      'contact@rhone-emploi.example', '04 72 00 11 22', 'Lyon, Villeurbanne, Rhône (69)', 'Salle, cuisine, hôtellerie', 'AA-' + jour(0).slice(0, 4) + '-0001', 'Nadia Benali, directrice d\'agence').lastInsertRowid);
    run('INSERT INTO users (username, password_hash, profil, nom, partenaire_id, must_change) VALUES (?,?,?,?,?,0)', 'rhone.emploi', PW, 'partenaire', 'Nadia Benali', pid);
    const dem = (poste, ville, nb, debut, contrat, desc, jb) => Number(run('INSERT INTO partenaires_demandes (partenaire_id, poste, ville, nb_postes, date_debut, type_contrat, description, job_boards) VALUES (?,?,?,?,?,?,?,?)', pid, poste, ville, nb, debut, contrat, desc, JSON.stringify(jb)).lastInsertRowid);
    const d1 = dem('Serveur', 'Lyon 2e', 3, jour(10), 'Saisonnier', 'Brasserie de 120 couverts, service en coupure, anglais apprécié.', ['Indeed', 'HelloWork']);
    dem('Plongeur', 'Villeurbanne', 1, jour(4), 'Mission d\'intérim', 'Restauration collective, horaires de jour.', ['France Travail']);
    const cands = [['Sarah', 'Lemoine', 'Indeed', 'Serveur', 'Lyon 8e', 1], ['Hugo', 'Faure', 'HelloWork', 'Serveur', 'Lyon 1er', 1], ['Amina', 'Kone', 'France Travail', 'Plongeur', 'Villeurbanne', 0]];
    const ids = cands.map(([pr, n, src, poste, ville, part]) => Number(run('INSERT INTO candidats (prenom, nom, telephone, ville, poste, reponses, statut, source, partage_partenaires) VALUES (?,?,?,?,?,?,\'entretien\',?,?)',
      pr, n, '06 70 00 00 0' + pr.length, ville, poste, JSON.stringify({ nationalite_cat: 'Française', situation: 'Sans emploi / demandeur d\'emploi', postes: [poste], poste_principal: poste, experience: '1 à 3 ans', creneaux: ['Le soir', 'Le week-end'] }), src, part).lastInsertRowid));
    const pres = (k, statut, extra = '') => run(`INSERT INTO presentations (partenaire_id, demande_id, candidat_id, prenom, nom, poste, ville, telephone, source, resume, consentement_le, statut, retour_partenaire, date_placement, commission_montant, commission_statut, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now', '-100 days'),?,?,?,?,?, datetime('now', '-100 days'))`, pid, d1, ids[k], cands[k][0], cands[k][1], 'Serveur', cands[k][4], '06 70 00 00 0' + cands[k][0].length, cands[k][2],
      'Expérience : 1 à 3 ans\nDisponibilités : Le soir, Le week-end', statut, extra, statut === 'placee' ? jour(-95) : null, statut === 'placee' ? 350 : null, statut === 'placee' ? 'a_facturer' : 'non_due');
    pres(0, 'placee', 'Embauchée en contrat saisonnier jusqu\'à fin septembre.');
    pres(1, 'proposee');
    // Sourcing de clients : recherche du partenaire et établissement présenté (prospect « Hôtel des Célestins »)
    const dc = Number(run('INSERT INTO partenaires_demandes (partenaire_id, type, poste, ville, nb_postes, description) VALUES (?,?,?,?,?,?)', pid, 'client', 'Hôtels 3 et 4 étoiles', 'Lyon', 2, 'Besoins réguliers en réception et étages, saison des salons.').lastInsertRowid);
    const pr = one('SELECT * FROM prospects WHERE etablissement = ?', 'Hôtel des Célestins');
    if (pr) run(`INSERT INTO presentations (type, partenaire_id, demande_id, prospect_id, etablissement, secteur, adresse, prenom, nom, poste, ville, telephone, source, resume, consentement_le, statut, retour_partenaire)
      VALUES ('client',?,?,?,?,?,?,?, '', ?, ?, ?, 'Visite terrain', ?, datetime('now', '-3 days'), 'entretien', ?)`, pid, dc, pr.id, pr.etablissement, pr.type_etab, pr.adresse, pr.repondant, pr.type_etab, pr.adresse, pr.telephone,
      'Recours aux extras : Saisonnier / événementiel\nPostes recherchés : Employé d\'étage / femme de chambre, Réceptionniste / veilleur de nuit', 'Rendez-vous avec le directeur prévu la semaine prochaine.');
  }
});
// Relevés mensuels du partenaire (3 derniers mois), déposés comme par le partenaire : fichier pré-rempli complété
{
  const p = one('SELECT * FROM partenaires WHERE raison_sociale = ?', 'Rhône Emploi Intérim'), x = one('SELECT id FROM presentations WHERE partenaire_id = ? AND statut = \'placee\'', p.id);
  const mois0 = jour(0).slice(0, 7), decal = (m, k) => { const [a, n] = m.split('-').map(Number); return new Date(Date.UTC(a, n - 1 + k, 15)).toISOString().slice(0, 7); };
  [[-3, 118, 2, 1], [-2, 132, 3, 2], [-1, 146, 4, 2]].forEach(([k, h, nb, extra]) => {
    const m = decal(mois0, k), [a, n] = m.split('-'), base = RELEVES.modele(p, m).replace(/^\ufeff/, '').trim().split('\r\n').filter(l => l.startsWith('#') || l.startsWith('Réf'));
    const L = [`P-${x.id};Intérimaire;Sarah Lemoine;Brasserie Saint-Paul;Serveur;01/${n}/${a};;${h};12,50;1,95;;Réalisée;Contrat saisonnier`];
    const autres = [['Hugo Faure', 'Hôtel Bellecour', 'Réceptionniste', 13.2, 2.0], ['Amina Kone', 'Restaurant Le Square', 'Plongeur', 12.31, 1.9], ['Lina Roy', 'Brasserie Saint-Paul', 'Commis de cuisine', 12.6, 1.95], ['Omar Diallo', 'Hôtel Bellecour', 'Cuisinier', 13.8, 2.05]];
    autres.slice(0, nb).forEach(([nom, cl, po, t, c], i) => L.push(`;Intérimaire;${nom};${cl};${po};;;${40 + i * 18 + k * -6};${String(t).replace('.', ',')};${String(c).replace('.', ',')};;Réalisée;`));
    for (let i = 0; i < extra; i++) L.push(`;Client;Extra week-end ${i + 1};Hôtel des Célestins;Femme de chambre;;;${24 + i * 8};12,40;2;;Réalisée;Client présenté en cours de signature`);
    const buf = Buffer.from([...base, ...L].join('\r\n'), 'utf8'), r = RELEVES.analyser(buf, p, m);
    if (r.erreurs.length) throw new Error(r.erreurs.join(' '));
    RELEVES.enregistrer(p, m, r.lignes, buf, `releve-${m}.csv`, 'partenaire');
  });
}
console.log('Démonstration installée. Comptes (mot de passe « Demo2026! ») : claire.morel (agence), comptoir.lyon (employeur), yanis.benali, lucas.martin, thomas.petit (intérimaires), rhone.emploi (agence partenaire).');
console.log('camille.roux : mot de passe provisoire « Provisoire1 » (changement obligatoire à la première connexion).');
