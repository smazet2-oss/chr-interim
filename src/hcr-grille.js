'use strict';
// Valeurs par défaut de la convention HCR (IDCC 1979), sans dépendance : partagées par les paramètres et les calculs.
// À vérifier et mettre à jour à chaque avenant « salaires » et à chaque revalorisation du SMIC (Paramètres › Convention HCR).
/** SMIC horaire brut au 1er juin 2026 (revalorisation automatique de 2,41 %, contre 12,02 € au 1er janvier 2026). */
const SMIC_DEFAUT = '12.31';
/** Taux horaire brut minimum par niveau et échelon : grille de l'avenant n° 33 du 19 juin 2024 (étendu, applicable depuis le 1er décembre 2024).
 *  Les niveaux I-1 à II-1 sont inférieurs au SMIC : c'est alors le SMIC qui s'applique (voir hcr.tauxPoste). */
const GRILLE_DEFAUT = {
  'I-1': '12.00', 'I-2': '12.08', 'I-3': '12.18', 'II-1': '12.28', 'II-2': '12.55', 'II-3': '13.17',
  'III-1': '13.32', 'III-2': '13.54', 'III-3': '14.00', 'IV-1': '14.40', 'IV-2': '14.77', 'IV-3': '15.40',
  'V-1': '18.43', 'V-2': '21.78', 'V-3': '28.12',
};
const NIVEAUX = Object.keys(GRILLE_DEFAUT);
/** Niveau habituel de chaque poste proposé. */
const POSTES = {
  'Plongeur': 'I-1', 'Commis de salle': 'I-2', 'Commis de cuisine': 'I-2', 'Extra petit-déjeuner': 'I-2',
  'Femme de chambre': 'I-2', 'Valet de chambre': 'I-2', 'Serveur': 'I-3', 'Veilleur de nuit': 'I-3',
  'Barman': 'II-1', 'Réceptionniste': 'II-1', 'Cuisinier': 'II-2', 'Chef de rang': 'II-3',
  'Chef de partie': 'III-1', 'Gouvernante': 'III-1', 'Maître d\'hôtel': 'III-2',
};
const cleNiveau = n => 'grille_' + n.replace('-', '_');
const clePoste = p => 'niveau_' + p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
module.exports = { SMIC_DEFAUT, GRILLE_DEFAUT, NIVEAUX, POSTES, cleNiveau, clePoste };
