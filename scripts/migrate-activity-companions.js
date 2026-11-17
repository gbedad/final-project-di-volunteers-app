// One-off migration: the number of adults going with the children is
// given as such ("Nombre d'accompagnants prévus"), no longer as a ratio
// ("un adulte pour … enfants", adults_per_students, kept but unused)
//  - activities.companions: adults planned (null: not given)
//   node scripts/migrate-activity-companions.js          -> dry run
//   node scripts/migrate-activity-companions.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[col]] = await q(
  `select count(*)::int n from information_schema.columns where table_name = 'activities' and column_name = 'companions'`
);
console.log(`activities.companions: ${col.n ? 'present' : 'to create'} (empty for every outing: to fill in)`);
if (apply) {
  await db.transaction(async (t) => {
    await q('ALTER TABLE activities ADD COLUMN IF NOT EXISTS companions INTEGER CHECK (companions >= 0)', t);
    await q(`insert into "SequelizeMeta"(name) values ('20261117090000-activity-companions.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
