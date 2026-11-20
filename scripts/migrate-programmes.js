// One-off migration: students.programmes, the permanent programme tags of a
// student (e.g. 'lionnes': annual membership but no participation)
//   node scripts/migrate-programmes.js          -> dry run
//   node scripts/migrate-programmes.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'students' and column_name = 'programmes') as has`,
  { logging: false }
);
console.log(has ? 'Column students.programmes already exists.' : "Column students.programmes to add (empty array '{}').");
if (apply) {
  await db.transaction(async (transaction) => {
    await db.query(
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS programmes VARCHAR(255)[] NOT NULL DEFAULT '{}'",
      { transaction, logging: false }
    );
    await db.query(
      `insert into "SequelizeMeta"(name) values ('20261120120000-programmes.cjs') on conflict do nothing`,
      { transaction, logging: false }
    );
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
