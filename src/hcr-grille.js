'use strict';
// Valeurs par défaut de la convention HCR (IDCC 1979), sans dépendance : partagées par les paramètres et les calculs.
// À vérifier et mettre à jour à chaque avenant « salaires » et à chaque revalorisation du SMIC (Paramètres › Convention HCR).
const SMIC_DEFAUT = '12.02';
/** Taux horaire brut minimum par niveau et échelon (grille des salaires HCR). */
const GRILLE_DEFAUT = {
  'I-1': '11.88', 'I-2': '11.95', 'I-3': '12.10', 'II-1': '12.20', 'II-2': '12.30', 'II-3': '12.55',
  'III-1': '12.65', 'III-2': '13.10', 'III-3': '13.60', 'IV-1': '13.75', 'IV-2': '14.40', 'IV-3': '15.30',
  'V-1': '16.35', 'V-2': '19.10', 'V-3': '22.10',
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
