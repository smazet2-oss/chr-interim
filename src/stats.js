'use strict';
// Statistiques de chaque espace : chiffres clés du mois, comparaison avec le mois précédent, historique sur 6 mois.
// Chaque profil ne reçoit que ses propres données.
const { one, all } = require('./db');
const P = require('./parametres');
const hcr = require('./hcr');

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const moisDe = (iso, k) => { const d = new Date(iso.slice(0, 7) + '-15T12:00Z'); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
const pc = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
const ifmDue = motif => !/usage|saisonnier/i.test(String(motif || ''));

/** Heures validées par les deux parties, avec brut (majorations comprises), facturé HT et coût agence. */
function heuresValorisees(where, ...args) {
  const kIfm = P.num('ifm_taux', 10) / 100, kCp = P.num('iccp_taux', 10) / 100, kCh = P.num('charges_patronales_taux', 20) / 100;
  return all(`SELECT h.interim_id, m.client_id, m.date, m.debut, m.fin, m.motif, m.taux_horaire, m.poste, c.coefficient,
      h.heures_prevues + CASE WHEN h.extra_statut = 'accepte' THEN h.extra ELSE 0 END AS total
    FROM heures h JOIN missions m ON m.id = h.mission_id JOIN clients c ON c.id = m.client_id
    WHERE h.valide_interim = 1 AND h.valide_client = 1 AND h.extra_statut != 'attente' ${where}`, ...args)
    .map(x => {
      const brut = x.total * x.taux_horaire * hcr.facteur(x.date, x.debut, x.fin), ifm = ifmDue(x.motif) ? brut * kIfm : 0, tot = (brut + ifm) * (1 + kCp);
      return { ...x, mois: x.date.slice(0, 7), brut, total_brut: tot, ht: brut * x.coefficient, cout: tot * (1 + kCh) };
    });
}
const somme = (L, k) => L.reduce((a, x) => a + (x[k] || 0), 0);
const serie = (mois6, L, k) => mois6.map(m => ({ mois: m, valeur: r2(somme(L.filter(x => x.mois === m), k)) }));
const top = (L, cle, val, n = 5) => Object.values(L.reduce((o, x) => { const c = x[cle] || '—'; (o[c] = o[c] || { nom: c, valeur: 0 }).valeur += val(x); return o; }, {}))
  .sort((a, b) => b.valeur - a.valeur).slice(0, n).map(x => ({ ...x, valeur: r2(x.valeur) }));

module.exports = function register(api, h) {
  const { today } = h;
  api.get('/stats', (req, res) => {
    const t = today(), mc = t.slice(0, 7), mp = moisDe(t, -1), an = t.slice(0, 4), p = req.user.profil;
    const mois6 = [-5, -4, -3, -2, -1, 0].map(k => moisDe(t, k)), debut6 = mois6[0] + '-01';
    const ceMois = L => L.filter(x => x.mois === mc), moisPrec = L => L.filter(x => x.mois === mp);

    if (p === 'agence') {
      const H = heuresValorisees('AND m.date >= ?', debut6);
      const M = all('SELECT m.*, c.nom AS client_nom, substr(m.date, 1, 7) AS mois FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.date >= ?', debut6);
      const Mc = ceMois(M), fermees = Mc.filter(m => m.statut !== 'nouvelle');
      const delais = all('SELECT (julianday(verrouillee_at) - julianday(created_at)) * 24 AS h FROM missions WHERE verrouillee_at IS NOT NULL AND date >= ?', debut6).map(x => x.h).filter(x => x >= 0);
      const des = one('SELECT COUNT(*) n FROM desistements WHERE substr(created_at, 1, 7) = ?', mc).n;
      const k = one('SELECT SUM(statut = \'signe\') s, SUM(statut = \'a_signer\') a FROM contrats');
      const fa = one('SELECT COALESCE(SUM(CASE WHEN payee_le IS NULL THEN montant_ht * (100 + tva_taux) / 100 END), 0) du, COALESCE(SUM(CASE WHEN payee_le IS NULL AND echeance < ? THEN montant_ht * (100 + tva_taux) / 100 END), 0) retard FROM factures', t);
      const actifs = new Set(ceMois(H).map(x => x.interim_id)).size;
      const iTot = one('SELECT COUNT(*) n, SUM(dossier_complet) c FROM interimaires WHERE suspendu = 0');
      return res.json({
        profil: p, mois: mc, mois6,
        cles: {
          ca_ht: r2(somme(ceMois(H), 'ht')), ca_ht_prec: r2(somme(moisPrec(H), 'ht')),
          marge: r2(somme(ceMois(H), 'ht') - somme(ceMois(H), 'cout')), marge_pc: pc(somme(ceMois(H), 'ht') - somme(ceMois(H), 'cout'), somme(ceMois(H), 'ht')),
          heures: r2(somme(ceMois(H), 'total')), heures_prec: r2(somme(moisPrec(H), 'total')),
          missions: Mc.length, missions_prec: moisPrec(M).length,
          taux_pourvoi: pc(fermees.filter(m => m.statut === 'verrouillee').length, fermees.filter(m => m.statut !== 'annulee').length),
          annulations: Mc.filter(m => m.statut === 'annulee').length, desistements: des,
          delai_pourvoi_h: delais.length ? Math.round(delais.reduce((a, x) => a + x, 0) / delais.length) : null,
          interimaires_actifs: actifs, interimaires_total: iTot.n, dossiers_complets_pc: pc(iTot.c || 0, iTot.n),
          contrats_signes_pc: pc(k.s || 0, (k.s || 0) + (k.a || 0)), contrats_a_signer: k.a || 0,
          encours_ttc: r2(fa.du), retard_ttc: r2(fa.retard),
          prospects_actifs: one('SELECT COUNT(*) n FROM prospects WHERE statut NOT IN (\'client\', \'perdu\')').n,
          candidatures_mois: one('SELECT COUNT(*) n FROM candidats WHERE substr(created_at, 1, 7) = ?', mc).n,
        },
        series: { ca_ht: serie(mois6, H, 'ht'), heures: serie(mois6, H, 'total'), missions: mois6.map(m => ({ mois: m, valeur: M.filter(x => x.mois === m && x.statut !== 'annulee').length })) },
        tops: { clients: top(H.filter(x => x.date.startsWith(an)), 'client_id', x => x.ht).map(x => ({ ...x, nom: one('SELECT nom FROM clients WHERE id = ?', x.nom)?.nom || '—' })),
          postes: top(M.filter(m => m.statut !== 'annulee'), 'poste', m => m.nb_postes) },
      });
    }

    if (p === 'client') {
      const cid = req.user.client_id, H = heuresValorisees('AND m.client_id = ? AND m.date >= ?', cid, an + '-01-01');
      const H6 = heuresValorisees('AND m.client_id = ? AND m.date >= ?', cid, debut6);
      const M = all('SELECT m.*, substr(m.date, 1, 7) AS mois FROM missions m WHERE m.client_id = ? AND m.date >= ?', cid, an + '-01-01');
      const tva = 1 + P.num('tva_taux', 20) / 100, Ma = M.filter(m => m.statut !== 'annulee');
      const venus = all(`SELECT r.interim_id, COUNT(*) n FROM reponses r JOIN missions m ON m.id = r.mission_id WHERE m.client_id = ? AND r.etat = 'retenu' AND m.statut = 'verrouillee' GROUP BY r.interim_id`, cid);
      return res.json({
        profil: p, mois: mc, mois6,
        cles: {
          depenses_ht: r2(somme(ceMois(H), 'ht')), depenses_ht_prec: r2(somme(moisPrec(H6), 'ht')), depenses_an_ttc: r2(somme(H, 'ht') * tva),
          heures: r2(somme(ceMois(H), 'total')), heures_an: r2(somme(H, 'total')),
          cout_horaire_ht: somme(H, 'total') ? r2(somme(H, 'ht') / somme(H, 'total')) : null,
          missions_an: Ma.length, missions_mois: Ma.filter(m => m.mois === mc).length,
          taux_pourvoi: pc(Ma.filter(m => m.statut === 'verrouillee').length, Ma.filter(m => m.statut !== 'nouvelle').length),
          annulations_an: M.filter(m => m.statut === 'annulee').length,
          interimaires_differents: venus.length, interimaires_fideles: venus.filter(v => v.n >= 2).length,
          note_donnee: one(`SELECT ROUND(AVG(e.note), 1) n FROM evaluations e JOIN heures h ON h.id = e.heure_id JOIN missions m ON m.id = h.mission_id WHERE m.client_id = ? AND e.sens = 'client_vers_interim'`, cid).n,
          note_recue: one(`SELECT ROUND(AVG(e.note), 1) n FROM evaluations e JOIN heures h ON h.id = e.heure_id JOIN missions m ON m.id = h.mission_id WHERE m.client_id = ? AND e.sens = 'interim_vers_client'`, cid).n,
        },
        series: { depenses_ht: serie(mois6, H6, 'ht'), heures: serie(mois6, H6, 'total') },
        tops: { postes: top(Ma, 'poste', m => m.nb_postes) },
      });
    }

    const iid = req.user.interim_id, H = heuresValorisees('AND h.interim_id = ? AND m.date >= ?', iid, an + '-01-01');
    const H6 = heuresValorisees('AND h.interim_id = ? AND m.date >= ?', iid, debut6);
    const env = one(`SELECT COUNT(*) n, SUM(r.etat IN ('accepte', 'retenu')) + (SELECT COUNT(*) FROM desistements d WHERE d.interim_id = ?) acc FROM envois e LEFT JOIN reponses r ON r.mission_id = e.mission_id AND r.interim_id = e.interim_id WHERE e.interim_id = ?`, iid, iid);
    const aVenir = all(`SELECT m.date FROM reponses r JOIN missions m ON m.id = r.mission_id WHERE r.interim_id = ? AND r.etat = 'retenu' AND m.statut = 'verrouillee' AND m.date >= ?`, iid, t).length;
    return res.json({
      profil: p, mois: mc, mois6,
      cles: {
        gains_brut: r2(somme(ceMois(H), 'total_brut')), gains_brut_prec: r2(somme(moisPrec(H6), 'total_brut')), gains_an: r2(somme(H, 'total_brut')),
        net_estime_mois: r2(somme(ceMois(H), 'total_brut') * (1 - P.num('cotisations_salariales_taux', 22) / 100)),
        heures: r2(somme(ceMois(H), 'total')), heures_an: r2(somme(H, 'total')),
        missions_mois: new Set(ceMois(H).map(x => x.date + x.debut + x.client_id)).size, missions_an: new Set(H.map(x => x.date + x.debut + x.client_id)).size,
        missions_a_venir: aVenir, etablissements: new Set(H.map(x => x.client_id)).size,
        taux_acceptation: pc(env.acc || 0, env.n), desistements: one('SELECT COUNT(*) n FROM desistements WHERE interim_id = ?', iid).n,
        note: one(`SELECT ROUND(AVG(e.note), 1) n FROM evaluations e JOIN heures h ON h.id = e.heure_id WHERE h.interim_id = ? AND e.sens = 'client_vers_interim'`, iid).n,
      },
      series: { gains_brut: serie(mois6, H6, 'total_brut'), heures: serie(mois6, H6, 'total') },
      tops: { postes: top(H, 'poste', x => x.total) },
    });
  });
};
