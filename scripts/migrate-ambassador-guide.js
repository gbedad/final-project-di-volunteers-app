// One-off migration: activities.ambassador_guide, the long text for the
// ambassadors who offer an outing (WhatsApp format, button « Pour les
// ambassadeurs »), distinct from activities.ambassador_brief (flyer text)
//   node scripts/migrate-ambassador-guide.js          -> dry run
//   node scripts/migrate-ambassador-guide.js --apply  -> adds the column
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[{ has }]] = await q(
  `select exists (select 1 from information_schema.columns
     where table_name = 'activities' and column_name = 'ambassador_guide') as has`
);
console.log(has ? 'Column activities.ambassador_guide already exists.' : 'Column activities.ambassador_guide to add (empty).');
if (apply && !has) {
  await db.transaction(async (t) => {
    await q('ALTER TABLE activities ADD COLUMN IF NOT EXISTS ambassador_guide TEXT', t);
    await q(`insert into "SequelizeMeta"(name) values ('20261122120000-activities-ambassador-guide.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the column.');
}
await db.close();
