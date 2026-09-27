'use strict';
// Annulations et désistements, avec motif.
// - L'employeur (ou l'agence) annule une mission : les intérimaires concernés sont remis à disposition
//   et reçoivent les missions ouvertes sur le même créneau.
// - L'intérimaire se désiste : la place est remise à disposition, avec une alerte à l'employeur, à l'agence
//   et aux intérimaires déjà contactés pour cette mission.
// - L'intérimaire se déclare indisponible (imprévu) depuis son tableau de bord.
const { db, one, all, run, tx } = require('./db');
const P = require('./parametres');
const { envoyer } = require('./notify');

db.exec(`CREATE TABLE IF NOT EXISTS desistements (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  etat_avant TEXT NOT NULL, motif TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

/** Minutes [début, fin[ d'un créneau, fin après minuit comprise. */
const intervalle = (debut, fin) => { const [a, b] = [debut, fin].map(x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; }); return [a, b <= a ? b + 1440 : b]; };
const chevauche = (m1, m2) => {
  if (m1.date !== m2.date) return false;
  const [a1, b1] = intervalle(m1.debut, m1.fin), [a2, b2] = intervalle(m2.debut, m2.fin);
  return a1 < b2 && a2 < b1;
};
const dfr = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const dc = iso => new Date(iso + 'T12:00').toLocaleDateString('fr-FR');
const notifAgence = msg => run('INSERT INTO notifications (pour_agence, message) VALUES (1, ?)', msg);

module.exports = function register(api, h) {
  const { fail, wrap, role, str, today, missionRow, compteurs, missionPourInterim, dossier } = h;
  const motifDe = (b, requis) => { const m = str(b.motif, 300); if (requis && m.length < 3) fail(400, 'Indiquez la raison de l\'annulation.'); return m; };
  const contacter = async (i, sujet, texte, titre) => {
    for (const c of ['sms', 'mail']) if (c === 'mail' ? i.email : i.telephone) await envoyer(c, i, sujet, texte, { titre });
  };

  /** Missions ouvertes (non complètes) sur le même créneau, pour un intérimaire remis à disposition. */
  function creneauxLibres(m, iid) {
    return all(`SELECT m.*, c.nom AS client_nom FROM missions m JOIN clients c ON c.id = m.client_id
        WHERE m.statut = 'diffusee' AND m.date = ? AND m.id != ? AND c.suspendu = 0
          AND NOT EXISTS (SELECT 1 FROM reponses r WHERE r.mission_id = m.id AND r.interim_id = ?)`, m.date, m.id, iid)
      .filter(x => chevauche(x, m) && compteurs(x.id).actifs < x.nb_postes);
  }

  /** Annulation d'une mission par l'employeur (ses missions) ou l'agence, avec motif. */
  api.post('/missions/:id/annuler', role('agence', 'client'), wrap(async (req, res) => {
    const p = req.user.profil, m = missionRow(req.params.id);
    if (!m || (p === 'client' && m.client_id !== req.user.client_id)) fail(404, 'Mission introuvable.');
    if (m.statut === 'annulee') fail(409, 'Mission déjà annulée.');
    if (p === 'client' && m.date < today()) fail(409, 'Mission passée : contactez l\'agence.');
    const motif = motifDe(req.body || {}, p === 'client');
    const concernes = all(`SELECT i.*, r.etat FROM reponses r JOIN interimaires i ON i.id = r.interim_id WHERE r.mission_id = ? AND r.etat IN ('accepte', 'retenu')`, m.id);
    const alternatives = {};
    tx(() => {
      run('UPDATE missions SET statut = \'annulee\', motif_annulation = ?, annulee_par = ?, annulee_le = datetime(\'now\') WHERE id = ?', motif || null, p, m.id);
      dossier.surAnnulation(m.id);
      run('DELETE FROM heures WHERE mission_id = ? AND valide_interim = 0 AND valide_client = 0', m.id);
      for (const i of concernes) {
        // Remise à disposition : jour redevenu disponible, missions ouvertes sur le même créneau proposées.
        run('INSERT INTO disponibilites (interim_id, date, etat) VALUES (?,?,\'disponible\') ON CONFLICT(interim_id, date) DO UPDATE SET etat = \'disponible\'', i.id, m.date);
        const L = creneauxLibres(m, i.id);
        for (const x of L) run('INSERT OR IGNORE INTO envois (mission_id, interim_id, canaux) VALUES (?,?,\'espace\')', x.id, i.id);
        alternatives[i.id] = L;
        run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', i.id, m.id,
          `Mission annulée par ${p === 'client' ? 'l\'employeur' : 'l\'agence'} : ${m.poste} chez ${m.client_nom}, ${dc(m.date)}${motif ? ` (motif : ${motif})` : ''}. Vous êtes remis(e) à disposition.`);
        if (L.length) run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', i.id, L[0].id,
          `Nouvelle mission : ${L.length} mission${L.length > 1 ? 's' : ''} disponible${L.length > 1 ? 's' : ''} sur le même créneau (${L.map(x => `${x.poste} chez ${x.client_nom}, ${x.debut}–${x.fin}`).join(' ; ')}).`);
      }
      if (p === 'client') notifAgence(`${m.client_nom} a annulé la mission ${m.poste} du ${dc(m.date)} (${m.nb_postes} poste${m.nb_postes > 1 ? 's' : ''}) : ${motif}. ${concernes.length} intérimaire(s) remis à disposition.`);
      else run('INSERT INTO notifications (client_id, mission_id, message) VALUES (?,?,?)', m.client_id, m.id, `L'agence a annulé la mission ${m.poste} du ${dc(m.date)}${motif ? ` : ${motif}` : ''}.`);
    });
    const nom = P.get('raison_sociale');
    for (const i of concernes) {
      const L = alternatives[i.id];
      await contacter(i, `${nom} : mission annulée`, `${nom} : la mission ${m.poste} chez ${m.client_nom} du ${dfr(m.date)} est annulée${motif ? ` (${motif})` : ''}. Vous êtes remis(e) à disposition.${L.length ? ` ${L.length} autre${L.length > 1 ? 's' : ''} mission${L.length > 1 ? 's' : ''} sur le même créneau vous attend${L.length > 1 ? 'ent' : ''} dans votre espace.` : ''}`, 'Mission annulée');
    }
    res.json({ ok: true, remis_a_disposition: concernes.length, alternatives: Object.values(alternatives).reduce((a, L) => a + L.length, 0) });
  }));

  /** Désistement de l'intérimaire (accepté ou retenu), avec motif : la place est remise à disposition. */
  api.post('/missions/:id/desister', role('interim'), wrap(async (req, res) => {
    const iid = req.user.interim_id, m = missionRow(req.params.id);
    const r = m && one('SELECT * FROM reponses WHERE mission_id = ? AND interim_id = ?', m.id, iid);
    if (!r || !['accepte', 'retenu'].includes(r.etat)) fail(404, 'Vous n\'êtes pas positionné(e) sur cette mission.');
    if (m.statut === 'annulee') fail(409, 'Mission déjà annulée.');
    if (m.date < today()) fail(409, 'Mission passée : contactez l\'agence.');
    const motif = motifDe(req.body || {}, true), i = one('SELECT * FROM interimaires WHERE id = ?', iid), nomI = `${i.prenom} ${i.nom}`;
    let aPrevenir = [];
    tx(() => {
      run('UPDATE reponses SET etat = \'decline\', updated_at = datetime(\'now\') WHERE id = ?', r.id);
      run('INSERT INTO desistements (mission_id, interim_id, etat_avant, motif) VALUES (?,?,?,?)', m.id, iid, r.etat, motif);
      run('UPDATE contrats SET statut = \'annule\' WHERE mission_id = ? AND interim_id = ? AND statut != \'annule\'', m.id, iid);
      run('DELETE FROM heures WHERE mission_id = ? AND interim_id = ? AND valide_interim = 0 AND valide_client = 0', m.id, iid);
      run('DELETE FROM experiences WHERE mission_id = ? AND interim_id = ?', m.id, iid);
      // Remise à disposition : la mission se rouvre, les non-retenus peuvent de nouveau accepter.
      if (m.statut === 'verrouillee') run('UPDATE missions SET statut = \'diffusee\', validee_le = NULL WHERE id = ?', m.id);
      run('DELETE FROM reponses WHERE mission_id = ? AND etat = \'non_retenu\'', m.id);
      aPrevenir = all(`SELECT i.* FROM envois e JOIN interimaires i ON i.id = e.interim_id
          WHERE e.mission_id = ? AND e.interim_id != ? AND i.suspendu = 0 AND NOT EXISTS (SELECT 1 FROM reponses r WHERE r.mission_id = e.mission_id AND r.interim_id = e.interim_id)`, m.id, iid);
      for (const x of aPrevenir) run('INSERT INTO notifications (interim_id, mission_id, message) VALUES (?,?,?)', x.id, m.id, `Nouvelle mission : une place s'est libérée, ${m.poste} chez ${m.client_nom}, ${dc(m.date)} ${m.debut}–${m.fin}. Les places vont aux premiers qui acceptent.`);
      run('INSERT INTO notifications (client_id, mission_id, message) VALUES (?,?,?)', m.client_id, m.id, `Désistement : ${nomI} ne pourra pas assurer la mission ${m.poste} du ${dc(m.date)} (${motif}). La place est remise à disposition des intérimaires.`);
      notifAgence(`Désistement de ${nomI} : ${m.poste} chez ${m.client_nom}, ${dc(m.date)} ${m.debut}–${m.fin} (${motif}). Place remise à disposition, ${aPrevenir.length} intérimaire(s) prévenu(s).`);
    });
    const c = one('SELECT * FROM clients WHERE id = ?', m.client_id), nom = P.get('raison_sociale');
    if (c.email) await envoyer('mail', c, `${nom} : désistement sur la mission du ${dc(m.date)}`, `${nom} : ${nomI} s'est désisté(e) de la mission ${m.poste} du ${dfr(m.date)} (${motif}). La place est de nouveau proposée à nos intérimaires ; nous vous tenons informé(e).`, { titre: 'Désistement d\'un intérimaire' });
    for (const x of aPrevenir) await contacter(x, `${nom} : place disponible`, `${nom} : une place s'est libérée, ${m.poste} chez ${m.client_nom}, ${dfr(m.date)} ${m.debut}–${m.fin}. Les places vont aux premiers qui acceptent : répondez dans votre espace.`, 'Une place s\'est libérée');
    res.json(missionPourInterim(missionRow(m.id), iid));
  }));

  /** Indisponibilité imprévue : jours marqués indisponibles, missions en conflit renvoyées pour désistement. */
  api.post('/indisponible', role('interim'), wrap((req, res) => {
    const iid = req.user.interim_id, b = req.body || {}, t = today();
    const debut = b.debut || t, fin = b.fin || debut, re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(debut) || !re.test(fin) || fin < debut) fail(400, 'Dates invalides.');
    if (debut < t) fail(400, 'La date de début est passée.');
    const jours = [];
    for (let d = new Date(debut + 'T12:00Z'); d.toISOString().slice(0, 10) <= fin; d = new Date(d.getTime() + 86400000)) jours.push(d.toISOString().slice(0, 10));
    if (jours.length > 60) fail(400, '60 jours au plus.');
    tx(() => jours.forEach(j => run('INSERT INTO disponibilites (interim_id, date, etat) VALUES (?,?,\'indisponible\') ON CONFLICT(interim_id, date) DO UPDATE SET etat = \'indisponible\'', iid, j)));
    const conflits = all(`SELECT m.*, c.nom AS client_nom, r.etat FROM reponses r JOIN missions m ON m.id = r.mission_id JOIN clients c ON c.id = m.client_id
        WHERE r.interim_id = ? AND r.etat IN ('accepte', 'retenu') AND m.statut != 'annulee' AND m.date BETWEEN ? AND ? ORDER BY m.date, m.debut`, iid, debut, fin)
      .map(m => ({ id: m.id, poste: m.poste, client_nom: m.client_nom, date: m.date, debut: m.debut, fin: m.fin, etat: m.etat }));
    const i = one('SELECT prenom, nom FROM interimaires WHERE id = ?', iid);
    notifAgence(`${i.prenom} ${i.nom} se déclare indisponible ${debut === fin ? `le ${dc(debut)}` : `du ${dc(debut)} au ${dc(fin)}`}${b.motif ? ` (${str(b.motif, 200)})` : ''}${conflits.length ? ` : ${conflits.length} mission(s) concernée(s)` : ''}.`);
    res.json({ jours: jours.length, conflits });
  }));
};
module.exports.chevauche = chevauche;
