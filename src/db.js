'use strict';
// Base de données SQLite (module intégré à Node.js, aucune dépendance native).
process.removeAllListeners('warning');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'chr-interim.sqlite');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  siret TEXT, secteur TEXT NOT NULL DEFAULT 'Restauration',
  adresse TEXT, ville TEXT, contact TEXT, email TEXT, telephone TEXT,
  coefficient REAL NOT NULL DEFAULT 2.0,
  delai_paiement INTEGER NOT NULL DEFAULT 15,
  convention TEXT NOT NULL DEFAULT 'HCR (IDCC 1979)',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS interimaires (
  id INTEGER PRIMARY KEY,
  prenom TEXT NOT NULL, nom TEXT NOT NULL,
  poste TEXT NOT NULL, secteur TEXT NOT NULL DEFAULT 'Restauration',
  telephone TEXT, email TEXT, ville TEXT,
  competences TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  taux_horaire REAL NOT NULL DEFAULT 12.0,
  dossier_complet INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  profil TEXT NOT NULL CHECK (profil IN ('agence','client','interim')),
  nom TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  interim_id INTEGER REFERENCES interimaires(id) ON DELETE CASCADE,
  must_change INTEGER NOT NULL DEFAULT 1,
  actif INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  poste TEXT NOT NULL,
  date TEXT NOT NULL,
  debut TEXT NOT NULL, fin TEXT NOT NULL,
  nb_postes INTEGER NOT NULL DEFAULT 1 CHECK (nb_postes > 0),
  taux_horaire REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle','diffusee','verrouillee','annulee')),
  commentaire TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verrouillee_at TEXT
);
CREATE TABLE IF NOT EXISTS envois (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  canaux TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mission_id, interim_id)
);
-- etat : accepte (attente employeur) · retenu · refuse_client · decline · non_retenu
CREATE TABLE IF NOT EXISTS reponses (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  etat TEXT NOT NULL CHECK (etat IN ('accepte','retenu','refuse_client','decline','non_retenu')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mission_id, interim_id)
);
CREATE TABLE IF NOT EXISTS heures (
  id INTEGER PRIMARY KEY,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  heures_prevues REAL NOT NULL,
  extra REAL NOT NULL DEFAULT 0,
  justification TEXT,
  extra_statut TEXT NOT NULL DEFAULT 'aucun' CHECK (extra_statut IN ('aucun','attente','accepte','refuse')),
  valide_interim INTEGER NOT NULL DEFAULT 0,
  valide_client INTEGER NOT NULL DEFAULT 0,
  UNIQUE (mission_id, interim_id)
);
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY,
  heure_id INTEGER NOT NULL REFERENCES heures(id) ON DELETE CASCADE,
  sens TEXT NOT NULL CHECK (sens IN ('client_vers_interim','interim_vers_client')),
  note INTEGER NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire TEXT, axe TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (heure_id, sens)
);
CREATE TABLE IF NOT EXISTS notes_privees (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  texte TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (client_id, interim_id)
);
CREATE TABLE IF NOT EXISTS disponibilites (
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  etat TEXT NOT NULL CHECK (etat IN ('disponible','indisponible')),
  PRIMARY KEY (interim_id, date)
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nom TEXT NOT NULL, categorie TEXT NOT NULL,
  fichier TEXT NOT NULL, type TEXT NOT NULL, taille INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS factures (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  debut TEXT NOT NULL, fin TEXT NOT NULL,
  montant_ht REAL NOT NULL,
  echeance TEXT NOT NULL,
  payee_le TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS facture_heures (
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  heure_id INTEGER NOT NULL UNIQUE REFERENCES heures(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  interim_id INTEGER REFERENCES interimaires(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS envois_messages (
  id INTEGER PRIMARY KEY,
  canal TEXT NOT NULL,
  destinataire TEXT NOT NULL,
  contenu TEXT NOT NULL,
  statut TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.exec(`
-- Lignes d'expérience du CV. source = 'mission' : ajoutée automatiquement au verrouillage d'une mission.
CREATE TABLE IF NOT EXISTS experiences (
  id INTEGER PRIMARY KEY,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  debut TEXT NOT NULL, fin TEXT,
  employeur TEXT NOT NULL, poste TEXT NOT NULL, description TEXT,
  source TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','mission')),
  mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (interim_id, mission_id)
);
-- Pièces du dossier administratif de l'intérimaire.
CREATE TABLE IF NOT EXISTS pieces (
  id INTEGER PRIMARY KEY,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  nom TEXT NOT NULL, fichier TEXT NOT NULL, mime TEXT NOT NULL, taille INTEGER NOT NULL,
  expire_le TEXT,
  statut TEXT NOT NULL DEFAULT 'a_verifier' CHECK (statut IN ('a_verifier','valide','refuse')),
  commentaire TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Contrats de mission, créés au verrouillage de la mission.
CREATE TABLE IF NOT EXISTS contrats (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'a_signer' CHECK (statut IN ('a_signer','signe','annule')),
  signe_le TEXT, signe_nom TEXT, signe_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mission_id, interim_id)
);
-- Fiches de paie par quinzaine.
CREATE TABLE IF NOT EXISTS bulletins (
  id INTEGER PRIMARY KEY,
  interim_id INTEGER NOT NULL REFERENCES interimaires(id) ON DELETE CASCADE,
  debut TEXT NOT NULL, fin TEXT NOT NULL,
  heures REAL NOT NULL, brut REAL NOT NULL, ifm REAL NOT NULL, iccp REAL NOT NULL, total REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','paye')),
  paye_le TEXT,
  fichier TEXT, fichier_nom TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bulletin_heures (
  bulletin_id INTEGER NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
  heure_id INTEGER NOT NULL UNIQUE REFERENCES heures(id) ON DELETE CASCADE
);
`);

// Migrations de colonnes (bases créées avec une version précédente).
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('missions', 'motif', "TEXT NOT NULL DEFAULT 'Accroissement temporaire d''activité'");
addColumn('interimaires', 'date_naissance', 'TEXT');
addColumn('interimaires', 'nationalite', "TEXT NOT NULL DEFAULT 'Française'");
addColumn('factures', 'tva_taux', 'REAL NOT NULL DEFAULT 20');
// Suspension d'un profil (réversible) : plus de connexion, plus de missions.
for (const t of ['clients', 'interimaires']) {
  addColumn(t, 'suspendu', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(t, 'suspendu_le', 'TEXT');
  addColumn(t, 'motif_suspension', 'TEXT');
}

/** Exécute fn dans une transaction exclusive (évite les courses sur les acceptations). */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

module.exports = { db, tx, one, all, run, DATA_DIR };
