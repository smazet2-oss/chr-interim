'use strict';
// Données de démonstration (fictives). Usage : npm run demo
// Tous les comptes de démonstration utilisent le mot de passe « Demo2026! », sauf camille.roux (première connexion).
const bcrypt = require('bcryptjs');
const { one, run, tx } = require('./db');

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

  for (let k = 1; k <= 20; k++) run('INSERT OR IGNORE INTO disponibilites (interim_id, date, etat) VALUES (?,?,?)', I[0], jour(k), k % 7 === 0 ? 'indisponible' : 'disponible');
  run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', I[0], f1, 'Nouvelle mission : Commis de cuisine chez Brasserie Le Comptoir');
});
console.log('Démonstration installée. Comptes (mot de passe « Demo2026! ») : claire.morel (agence), comptoir.lyon (employeur), yanis.benali, lucas.martin, thomas.petit (intérimaires).');
console.log('camille.roux : mot de passe provisoire « Provisoire1 » (changement obligatoire à la première connexion).');
