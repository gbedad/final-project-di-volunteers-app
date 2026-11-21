// One-off migration: students, binomes and seances get an `activite` column
// ('benevolat' by default, 'payant' for paid tutoring). Existing rows become
// 'benevolat'.
//   node scripts/migrate-activite.js          -> dry run (reads only)
//   node scripts/migrate-activite.js --apply  -> adds the columns
import db from '../config/database.js';

const TABLES = ['students', 'binomes', 'seances'];
const apply = process.argv.includes('--apply');

const [rows] = await db.query(
  `select table_name from information_schema.columns
     where column_name = 'activite' and table_name in (:tables)`,
  { replacements: { tables: TABLES }, logging: false }
);
const done = new Set(rows.map((r) => r.table_name));
const todo = TABLES.filter((t) => !done.has(t));
console.log(
  todo.length ? `Columns activite to add: ${todo.join(', ')}` : 'Columns activite already exist.'
);

if (apply && todo.length) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    for (const table of todo) {
      await run(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS activite VARCHAR(255) NOT NULL DEFAULT 'benevolat'`
      );
    }
    await run(`insert into "SequelizeMeta"(name)
      values ('20261121120000-activite.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the columns.');
}
await db.close();
