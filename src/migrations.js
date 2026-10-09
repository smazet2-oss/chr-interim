'use strict';
// Mises à jour ponctuelles des données en ligne, exécutées une seule fois au démarrage (repère dans la table parametres).
const { one, all, run, tx } = require('./db');
const { SMIC_DEFAUT, GRILLE_DEFAUT, cleNiveau } = require('./hcr-grille');

const fait = cle => !!one('SELECT 1 FROM parametres WHERE cle = ?', cle);
const marquer = cle => run('INSERT INTO parametres (cle, valeur) VALUES (?, \'fait\')', cle);
const fr = n => Number(n).toFixed(2).replace('.', ',');

/** SMIC au 1er juin 2026 (12,31 €) et grille HCR de l'avenant n° 33 : paramètres, intérimaires et missions à venir. */
function smicJuin2026(aujourdhui) {
  if (fait('migration_smic_2026_06')) return null;
  const smic = Number(SMIC_DEFAUT), bilan = { parametres: 0, interimaires: 0, missions: 0, passees: 0 };
  // Anciennes valeurs par défaut (avant cette mise à jour) : remplacées seulement si l'agence ne les avait pas modifiées.
  const ANCIENNE = { 'I-1': '11.88', 'I-2': '11.95', 'I-3': '12.10', 'II-1': '12.20', 'II-2': '12.30', 'II-3': '12.55', 'III-1': '12.65', 'III-2': '13.10', 'III-3': '13.60',
    'IV-1': '13.75', 'IV-2': '14.40', 'IV-3': '15.30', 'V-1': '16.35', 'V-2': '19.10', 'V-3': '22.10' };
  tx(() => {
    const s = one('SELECT valeur FROM parametres WHERE cle = \'smic_horaire\'');
    if (s && Number(s.valeur) < smic) { run('UPDATE parametres SET valeur = ?, updated_at = datetime(\'now\') WHERE cle = \'smic_horaire\'', SMIC_DEFAUT); bilan.parametres++; }
    for (const [n, v] of Object.entries(GRILLE_DEFAUT)) {
      const r = one('SELECT valeur FROM parametres WHERE cle = ?', cleNiveau(n));
      if (r && Number(r.valeur) === Number(ANCIENNE[n]) && r.valeur !== v) { run('UPDATE parametres SET valeur = ?, updated_at = datetime(\'now\') WHERE cle = ?', v, cleNiveau(n)); bilan.parametres++; }
    }
    // Taux horaire brut habituel des intérimaires et missions à venir : jamais sous le SMIC
    bilan.interimaires = Number(run('UPDATE interimaires SET taux_horaire = ? WHERE taux_horaire < ?', smic, smic).changes);
    bilan.missions = Number(run('UPDATE missions SET taux_horaire = ? WHERE taux_horaire < ? AND date >= ? AND statut != \'annulee\'', smic, smic, aujourdhui).changes);
    // Missions passées depuis le 1er juin 2026 payées sous le SMIC : signalées à l'agence pour régularisation (fiches de paie et factures déjà établies)
    const L = all('SELECT m.date, m.poste, m.taux_horaire, c.nom FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.taux_horaire < ? AND m.date >= \'2026-06-01\' AND m.date < ? AND m.statut != \'annulee\' ORDER BY m.date', smic, aujourdhui);
    bilan.passees = L.length;
    if (L.length) run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `SMIC au 1er juin 2026 : ${fr(smic)} € brut de l'heure. ${L.length} mission(s) réalisée(s) depuis le 1er juin ont un taux horaire brut inférieur (de ${fr(Math.min(...L.map(x => x.taux_horaire)))} à ${fr(Math.max(...L.map(x => x.taux_horaire)))} €) : régularisez la paie et la facturation. Exemples : ${L.slice(0, 3).map(x => `${x.poste} chez ${x.nom} le ${x.date.split('-').reverse().join('/')}`).join(' ; ')}.`);
    if (bilan.interimaires || bilan.missions) run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', `Mise à jour SMIC ${fr(smic)} € et grille HCR (avenant n° 33) : ${bilan.missions} mission(s) à venir et ${bilan.interimaires} fiche(s) intérimaire(s) relevées au SMIC.`);
    marquer('migration_smic_2026_06');
  });
  return bilan;
}

module.exports = { smicJuin2026 };
