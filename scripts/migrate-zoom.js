// One-off migration: remote sessions held on Zoom (meetings created by
// Moodle on the association's Zoom account)
//  - binomes.zoom_meeting_id: the Zoom meeting of the pair, learnt at the
//    first match, used for the next ones
//  - seances.zoom_key: meeting + day (the 40-minute parts of a session are
//    one session)
//  - zoom_pending: Zoom sessions not matched to a pair yet
//   node scripts/migrate-zoom.js          -> dry run
//   node scripts/migrate-zoom.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[cols]] = await q(
  `select count(*)::int n from information_schema.columns
    where (table_name = 'binomes' and column_name = 'zoom_meeting_id')
       or (table_name = 'seances' and column_name = 'zoom_key')`
);
const [[tables]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'zoom_pending'`);
console.log(`columns: ${cols.n}/2 present; table zoom_pending: ${tables.n ? 'present' : 'to create'}.`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT', transaction);
    await q('ALTER TABLE seances ADD COLUMN IF NOT EXISTS zoom_key TEXT UNIQUE', transaction);
    await q(
      `CREATE TABLE IF NOT EXISTS zoom_pending (
         id SERIAL PRIMARY KEY,
         zoom_key TEXT UNIQUE NOT NULL,
         meeting_id TEXT NOT NULL,
         date DATE NOT NULL,
         topic TEXT,
         host_email TEXT,
         host_name TEXT,
         student_names TEXT,
         arrival TIMESTAMPTZ,
         minutes INTEGER,
         reason TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         resolved_at TIMESTAMPTZ,
         resolved_by INTEGER,
         resolution TEXT
       )`,
      transaction
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261110120000-zoom.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
