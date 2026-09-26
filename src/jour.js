'use strict';
// Détail d'une journée et vue mensuelle du calendrier, selon le profil connecté.
const { one, all } = require('./db');

const moisValide = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

module.exports = function register(api, h) {
  const { fail, isDate, wrap, missionPourInterim, missionRow, today } = h;

  /** Résumé par date pour le calendrier du mois (agence et employeur). */
  api.get('/calendrier', wrap((req, res) => {
    const mois = moisValide(req.query.mois) ? req.query.mois : today().slice(0, 7);
    const p = req.user.profil;
    if (p === 'interim') fail(403, 'Accès refusé.');
    const filtre = p === 'client' ? 'AND m.client_id = ?' : '';
    const args = p === 'client' ? [mois + '%', req.user.client_id] : [mois + '%'];
    const rows = all(`SELECT m.date,
        COUNT(*) AS missions, SUM(m.nb_postes) AS postes,
        SUM(m.statut = 'nouvelle') AS nouvelles, SUM(m.statut = 'verrouillee') AS verrouillees,
        (SELECT COUNT(*) FROM reponses r JOIN missions x ON x.id = r.mission_id WHERE x.date = m.date AND x.statut != 'annulee' ${p === 'client' ? 'AND x.client_id = m.client_id' : ''} AND r.etat = 'retenu') AS retenus,
        (SELECT COUNT(*) FROM reponses r JOIN missions x ON x.id = r.mission_id WHERE x.date = m.date AND x.statut = 'diffusee' ${p === 'client' ? 'AND x.client_id = m.client_id' : ''} AND r.etat = 'accepte') AS en_attente
      FROM missions m WHERE m.date LIKE ? AND m.statut != 'annulee' ${filtre} GROUP BY m.date ORDER BY m.date`, ...args);
    res.json({ mois, jours: rows });
  }));

  /** Tout ce qui concerne une date, structuré par mission. */
  api.get('/jour/:date', wrap((req, res) => {
    const date = req.params.date;
    if (!isDate(date)) fail(400, 'Date invalide.');
    const p = req.user.profil;
    const SQL_M = `SELECT m.*, c.nom AS client_nom, c.adresse AS client_adresse, c.ville AS client_ville, c.contact AS client_contact, c.telephone AS client_telephone, c.secteur AS client_secteur
      FROM missions m JOIN clients c ON c.id = m.client_id`;
    const suivi = (mid, iid) => {
      const k = one('SELECT statut, signe_le FROM contrats WHERE mission_id = ? AND interim_id = ?', mid, iid);
      const hr = one('SELECT heures_prevues, extra, extra_statut, valide_interim, valide_client FROM heures WHERE mission_id = ? AND interim_id = ?', mid, iid);
      return { contrat: k ? k.statut : null, contrat_signe_le: k?.signe_le || null, heures: hr || null };
    };

    if (p === 'agence') {
      const missions = all(SQL_M + ' WHERE m.date = ? ORDER BY m.debut, c.nom', date).map(m => ({
        ...m,
        intervenants: all(`SELECT e.interim_id, e.canaux, e.created_at AS envoye_le, i.prenom, i.nom, i.poste, i.telephone, r.etat
            FROM envois e JOIN interimaires i ON i.id = e.interim_id LEFT JOIN reponses r ON r.mission_id = e.mission_id AND r.interim_id = e.interim_id
            WHERE e.mission_id = ? ORDER BY i.nom`, m.id)
          .map(x => ({ ...x, canaux: x.canaux.split(','), ...suivi(m.id, x.interim_id) })),
      }));
      const occupes = new Set(all(`SELECT r.interim_id FROM reponses r JOIN missions m ON m.id = r.mission_id WHERE m.date = ? AND m.statut = 'verrouillee' AND r.etat = 'retenu'`, date).map(x => x.interim_id));
      const dispo = all(`SELECT i.id, i.prenom, i.nom, i.poste, i.secteur, d.etat FROM disponibilites d JOIN interimaires i ON i.id = d.interim_id WHERE d.date = ? AND i.suspendu = 0 ORDER BY i.nom`, date);
      return res.json({
        date, profil: p, missions,
        disponibles: dispo.filter(x => x.etat === 'disponible' && !occupes.has(x.id)),
        indisponibles: dispo.filter(x => x.etat === 'indisponible'),
      });
    }

    if (p === 'client') {
      const missions = all(SQL_M + ' WHERE m.date = ? AND m.client_id = ? ORDER BY m.debut', date, req.user.client_id).map(m => ({
        id: m.id, poste: m.poste, date: m.date, debut: m.debut, fin: m.fin, nb_postes: m.nb_postes, taux_horaire: m.taux_horaire, statut: m.statut, commentaire: m.commentaire,
        candidats: all(`SELECT r.interim_id, r.etat, i.prenom, i.nom, i.poste, i.telephone,
            (SELECT ROUND(AVG(e.note),1) FROM evaluations e JOIN heures h ON h.id = e.heure_id WHERE h.interim_id = i.id AND e.sens = 'client_vers_interim') AS note
            FROM reponses r JOIN interimaires i ON i.id = r.interim_id WHERE r.mission_id = ? AND r.etat != 'decline' ORDER BY r.id`, m.id)
          // Le téléphone de l'intérimaire n'est communiqué qu'une fois la mission validée.
          .map(c => ({ ...c, telephone: m.statut === 'verrouillee' && c.etat === 'retenu' ? c.telephone : null, ...(c.etat === 'retenu' ? suivi(m.id, c.interim_id) : {}) })),
      }));
      return res.json({ date, profil: p, missions });
    }

    // Intérimaire : ses missions ce jour-là, avec les coordonnées de l'employeur une fois confirmée.
    const iid = req.user.interim_id;
    const missions = all(`${SQL_M} JOIN envois e ON e.mission_id = m.id AND e.interim_id = ? WHERE m.date = ? ORDER BY m.debut`, iid, date).map(m => {
      const base = missionPourInterim(missionRow(m.id), iid);
      const conf = base.etat === 'confirmee';
      return {
        ...base, commentaire: m.commentaire,
        lieu: [m.client_adresse, m.client_ville].filter(Boolean).join(', '),
        contact: conf ? { nom: m.client_contact, telephone: m.client_telephone } : null,
        collegues: conf ? all(`SELECT i.prenom FROM reponses r JOIN interimaires i ON i.id = r.interim_id WHERE r.mission_id = ? AND r.etat = 'retenu' AND r.interim_id != ?`, m.id, iid).map(x => x.prenom) : [],
        ...(conf ? suivi(m.id, iid) : {}),
        contrat_id: conf ? one('SELECT id FROM contrats WHERE mission_id = ? AND interim_id = ?', m.id, iid)?.id : null,
      };
    });
    const d = one('SELECT etat FROM disponibilites WHERE interim_id = ? AND date = ?', iid, date);
    res.json({ date, profil: p, missions, disponibilite: d ? d.etat : null });
  }));
};
