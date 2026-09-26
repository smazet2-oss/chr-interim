'use strict';
// Simulation d'une mission : paie estimée de l'intérimaire, coût pour l'employeur, marge de l'agence.
// Les taux viennent des Paramètres (rubrique Paie et Facturation). Ce sont des estimations indicatives.
const { one } = require('./db');
const P = require('./parametres');

const r2 = n => Math.round(n * 100) / 100;

/** Durée en heures entre deux horaires HH:MM (passage de minuit compris), au quart d'heure. */
function dureeHeures(debut, fin) {
  const [h1, m1] = String(debut).split(':').map(Number), [h2, m2] = String(fin).split(':').map(Number);
  let min = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (min <= 0) min += 24 * 60;
  return Math.round(min / 15) / 4;
}

/** L'indemnité de fin de mission n'est pas due pour un emploi d'usage ou saisonnier (article L1251-33). */
const ifmDue = motif => !/usage|saisonnier/i.test(String(motif || ''));

/**
 * @param {{debut:string, fin:string, nb_postes?:number, taux_horaire:number, motif?:string, coefficient?:number}} m
 */
function calculer(m) {
  const heures = dureeHeures(m.debut, m.fin), nb = Math.max(1, Number(m.nb_postes) || 1);
  const taux = Number(m.taux_horaire) || 0, coef = Number(m.coefficient) || 1;
  const due = ifmDue(m.motif);
  // Par intérimaire
  const brut = heures * taux;
  const ifm = due ? brut * P.num('ifm_taux', 10) / 100 : 0;
  const iccp = (brut + ifm) * P.num('iccp_taux', 10) / 100;
  const total_brut = brut + ifm + iccp;
  const net = total_brut * (1 - P.num('cotisations_salariales_taux', 22) / 100);
  const charges = total_brut * P.num('charges_patronales_taux', 20) / 100;
  // Facturation à l'employeur : heures × taux × coefficient du client, pour tous les postes
  const taux_facture = taux * coef;
  const ht = heures * taux_facture * nb, tva = ht * P.num('tva_taux', 20) / 100;
  const cout_agence = (total_brut + charges) * nb;
  return {
    heures, nb_postes: nb, taux_horaire: taux, ifm_due: due,
    brut: r2(brut), ifm: r2(ifm), iccp: r2(iccp), total_brut: r2(total_brut), net: r2(net),
    coefficient: coef, taux_facture: r2(taux_facture), ht: r2(ht), tva: r2(tva), ttc: r2(ht + tva),
    charges: r2(charges * nb), cout_agence: r2(cout_agence), marge: r2(ht - cout_agence),
    marge_pc: ht ? Math.round((ht - cout_agence) / ht * 1000) / 10 : 0,
  };
}

/** Ne renvoie à chaque profil que ce qui le concerne. */
function vue(s, profil) {
  if (profil === 'agence') return s;
  if (profil === 'client') return { heures: s.heures, nb_postes: s.nb_postes, taux_facture: s.taux_facture, ht: s.ht, tva: s.tva, ttc: s.ttc };
  return { heures: s.heures, taux_horaire: s.taux_horaire, ifm_due: s.ifm_due, brut: s.brut, ifm: s.ifm, iccp: s.iccp, total_brut: s.total_brut, net: s.net };
}

/** Simulation d'une mission enregistrée, vue par un profil. */
function pourMission(m, profil) {
  const coefficient = m.coefficient ?? one('SELECT coefficient FROM clients WHERE id = ?', m.client_id)?.coefficient ?? 1;
  return vue(calculer({ ...m, coefficient }), profil);
}

module.exports = { calculer, vue, pourMission, dureeHeures, ifmDue };
