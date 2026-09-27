'use strict';
// Agenda d'une période, selon le profil : missions avec horaires et état de pourvoi (vues Semaine et liste mobile).
// État commun aux trois espaces : pourvue, confirmer (décision ou contrat en attente), recherche (diffusée / proposée), diffuser.
const { all } = require('./db');

module.exports = function register(api, h) {
  const { fail, wrap, isDate, missionPourInterim, missionRow } = h;
  api.get('/agenda', wrap((req, res) => {
    const { debut, fin } = req.query, p = req.user.profil;
    if (!isDate(debut) || !isDate(fin) || fin < debut) fail(400, 'Période invalide.');
    if ((new Date(fin) - new Date(debut)) / 86400000 > 62) fail(400, 'Période trop longue (62 jours au plus).');
    if (p === 'interim') {
      const iid = req.user.interim_id;
      const E = { confirmee: ['pourvue', 'Confirmée'], signature: ['confirmer', 'Contrat à signer'], en_attente: ['confirmer', 'En attente de confirmation'], a_repondre: ['recherche', 'Proposée'] };
      const evenements = all('SELECT m.id FROM missions m JOIN envois e ON e.mission_id = m.id AND e.interim_id = ? WHERE m.date BETWEEN ? AND ? ORDER BY m.date, m.debut', iid, debut, fin)
        .map(x => missionPourInterim(missionRow(x.id), iid)).filter(m => E[m.etat])
        .map(m => ({ id: m.id, date: m.date, debut: m.debut, fin: m.fin, poste: m.poste, client_nom: m.client_nom, nb_postes: m.nb_postes, etat: E[m.etat][0], libelle: E[m.etat][1], statut: '' }));
      const dispos = all('SELECT date, etat FROM disponibilites WHERE interim_id = ? AND date BETWEEN ? AND ?', iid, debut, fin);
      return res.json({ debut, fin, evenements, dispos });
    }
    const filtre = p === 'client' ? 'AND m.client_id = ' + Number(req.user.client_id) : '';
    const evenements = all(`SELECT m.id, m.date, m.debut, m.fin, m.poste, m.nb_postes, m.statut, c.nom AS client_nom,
        (SELECT COUNT(*) FROM reponses r WHERE r.mission_id = m.id AND r.etat = 'retenu') AS retenus,
        (SELECT COUNT(*) FROM reponses r WHERE r.mission_id = m.id AND r.etat = 'accepte') AS en_attente,
        (SELECT GROUP_CONCAT(i.prenom || ' ' || i.nom, ', ') FROM reponses r JOIN interimaires i ON i.id = r.interim_id WHERE r.mission_id = m.id AND r.etat = 'retenu') AS noms
      FROM missions m JOIN clients c ON c.id = m.client_id WHERE m.date BETWEEN ? AND ? AND m.statut != 'annulee' ${filtre} ORDER BY m.date, m.debut`, debut, fin)
      .map(m => {
        const etat = m.statut === 'nouvelle' ? 'diffuser' : m.statut === 'verrouillee' ? 'pourvue' : m.en_attente ? 'confirmer' : 'recherche';
        const libelle = { diffuser: p === 'client' ? 'En validation par l\'agence' : 'À diffuser', pourvue: 'Pourvue', confirmer: p === 'client' ? 'Décision à prendre' : 'À confirmer par l\'employeur', recherche: 'En recherche' }[etat];
        return { ...m, etat, libelle };
      });
    res.json({ debut, fin, evenements });
  }));
};
