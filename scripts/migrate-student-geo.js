// One-off migration: where the student lives, from the national address
// base (BAN): INSEE code of the town or Paris district, and coordinates
// (for the reports: districts, priority neighbourhoods "QPV")
//   node scripts/migrate-student-geo.js          -> dry run
//   node scripts/migrate-student-geo.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[c]] = await q(
  `select count(*)::int n from information_schema.columns
    where table_name = 'students' and column_name in ('address_citycode', 'address_lat', 'address_lon')`
);
console.log(`students geo columns present: ${c.n}/3`);
if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE students ADD COLUMN IF NOT EXISTS address_citycode TEXT', transaction);
    await q('ALTER TABLE students ADD COLUMN IF NOT EXISTS address_lat DOUBLE PRECISION', transaction);
    await q('ALTER TABLE students ADD COLUMN IF NOT EXISTS address_lon DOUBLE PRECISION', transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261112210000-student-geo.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
