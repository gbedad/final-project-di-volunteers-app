// One-off migration: session reports of the pairs (table seances) and the
// date of the last monthly reminder sent to the tutor (binomes.reminded_at)
//   node scripts/migrate-seances.js          -> dry run
//   node scripts/migrate-seances.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select to_regclass('public.seances') is not null as exists`,
  { logging: false }
);
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'binomes' and column_name = 'reminded_at') as has`,
  { logging: false }
);
console.log(exists ? 'Table seances already exists.' : 'Table seances to create (empty).');
console.log(has ? 'Column binomes.reminded_at already exists.' : 'Column binomes.reminded_at to add.');
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS seances (
      id SERIAL PRIMARY KEY,
      binome_id INTEGER NOT NULL REFERENCES binomes(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      duration_minutes INTEGER,
      attendance VARCHAR(255) NOT NULL DEFAULT 'présent',
      work TEXT,
      progress INTEGER,
      remark TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run('CREATE INDEX IF NOT EXISTS seances_binome_id_date ON seances (binome_id, date)');
    await run('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261007160000-seances.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
