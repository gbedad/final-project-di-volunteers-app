// One-off migration: seances.confirmation — a session recorded by the team
// (source 'equipe') without any sign-in: how it was confirmed ("Appel au
// tuteur — …"); author_id is the team member
//   node scripts/migrate-session-confirmation.js          -> dry run
//   node scripts/migrate-session-confirmation.js --apply  -> writes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'seances' and column_name = 'confirmation') as has`,
  { logging: false }
);
console.log(has ? 'Column seances.confirmation already exists.' : 'Column seances.confirmation to add.');
if (apply) {
  await db.transaction(async (transaction) => {
    await db.query('ALTER TABLE seances ADD COLUMN IF NOT EXISTS confirmation TEXT', { transaction, logging: false });
    await db.query(`insert into "SequelizeMeta"(name) values ('20261111100000-session-confirmation.cjs') on conflict do nothing`, { transaction, logging: false });
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
