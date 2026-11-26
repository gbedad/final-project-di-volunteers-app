// One-off migration: capacity of each room (salles.capacite, default 1) and
// its alert threshold (salles.seuil_alerte, empty = no alert). Salle Haute
// takes up to 4 sessions at the same time, with a warning from 3.
//   node scripts/migrate-salles-capacite.js          -> dry run
//   node scripts/migrate-salles-capacite.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [cols] = await q(
  `select column_name from information_schema.columns where table_name = 'salles' and column_name in ('capacite', 'seuil_alerte')`
);
const has = (c) => cols.some((r) => r.column_name === c);
console.log(`salles.capacite: ${has('capacite') ? 'present' : 'to create'}`);
console.log(`salles.seuil_alerte: ${has('seuil_alerte') ? 'present' : 'to create'}`);
console.log('Salle Haute (MdA) : capacité 4, alerte dès 3');

if (apply) {
  await db.transaction(async (transaction) => {
    await q(`ALTER TABLE salles ADD COLUMN IF NOT EXISTS capacite INTEGER NOT NULL DEFAULT 1`, transaction);
    await q(`ALTER TABLE salles ADD COLUMN IF NOT EXISTS seuil_alerte INTEGER`, transaction);
    await q(`UPDATE salles SET capacite = 4, seuil_alerte = 3 WHERE site = 'MdA' AND name = 'Salle Haute'`, transaction);
  });
  console.log('Applied.');
} else {
  console.log('Dry run: nothing written. Use --apply to write.');
}

process.exit(0);
