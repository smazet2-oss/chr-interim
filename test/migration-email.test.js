'use strict';
// Test : l'ancienne adresse chr-interims@gmail.com est remplacée une fois dans les paramètres enregistrés.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-migr-'));
process.env.DATA_DIR = dir;
const { db, run } = require('../src/db');
db.exec('CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
for (const [k, v] of [['migration_email_contact', 'fait'], ['email', 'chr-interims@gmail.com'], ['smtp_user', 'chr-interims@gmail.com'], ['smtp_from', 'CHR Intérim <chr-interims@gmail.com>'], ['telephone', '04 78 00 00 00']])
  run('INSERT INTO parametres (cle, valeur) VALUES (?, ?)', k, v);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('adresse de l\'agence corrigée en chr.interims@gmail.com', () => {
  const P = require('../src/parametres');
  assert.equal(P.get('email'), 'chr.interims@gmail.com');
  assert.equal(P.get('smtp_user'), 'chr.interims@gmail.com');
  assert.equal(P.get('smtp_from'), 'CHR Intérim <chr.interims@gmail.com>');
  assert.equal(P.get('telephone'), '04 78 00 00 00');
});
