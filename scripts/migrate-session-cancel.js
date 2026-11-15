// One-off migration: who cancelled a session ("Annulée par l'élève" or "par
// le tuteur"), told by the tutor in the report or by the team in
// "Renseigner"
//  - seances.cancelled_by: 'eleve' | 'tuteur' (attendance 'annulé')
//   node scripts/migrate-session-cancel.js          -> dry run
//   node scripts/migrate-session-cancel.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[col]] = await q(
  `select count(*)::int n from information_schema.columns where table_name = 'seances' and column_name = 'cancelled_by'`
);
const [[old]] = await q(`select count(*)::int n from seances where attendance = 'annulé'`);
console.log(`seances.cancelled_by: ${col.n ? 'present' : 'to create'}; sessions already "annulé": ${old.n} (left without who)`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `ALTER TABLE seances ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('eleve', 'tuteur'))`,
      transaction
    );
    await q(
      `insert into "SequelizeMeta"(name) values ('20261116120000-session-cancel.cjs') on conflict do nothing`,
      transaction
    );
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
