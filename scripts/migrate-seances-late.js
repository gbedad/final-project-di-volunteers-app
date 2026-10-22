// One-off migration: seances.late, the student arrived 15 minutes late or
// more (incident, see the Charte). False for the existing sessions.
//   node scripts/migrate-seances-late.js          -> dry run
//   node scripts/migrate-seances-late.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'seances' and column_name = 'late') as has`,
  { logging: false }
);
const [[{ n }]] = await db.query('select count(*)::int n from seances', { logging: false });
console.log(has ? 'Column seances.late already exists.' : `Column seances.late to add (false for the ${n} existing sessions).`);
if (apply) {
  await db.transaction(async (transaction) => {
    await db.query('ALTER TABLE seances ADD COLUMN IF NOT EXISTS late BOOLEAN NOT NULL DEFAULT false', { transaction, logging: false });
    await db.query(`insert into "SequelizeMeta"(name) values ('20261022100000-seances-late.cjs') on conflict do nothing`, { transaction, logging: false });
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
