// One-off migration: sessions signed on Jotform (the paper-free attendance
// sheet used before the application, still used alongside it)
//  - seances.source ('app' | 'jotform'), seances.jotform_id (one Jotform
//    answer = one session at most), seances.jotform_signature_url
//  - jotform_pending: Jotform answers not matched to a pair yet (the team
//    matches them by hand)
//  - jotform_aliases: names seen on Jotform matched by hand to a pair, used
//    again for the next answers ("Dalia Y." with Sylviane Ly -> pair #27)
//   node scripts/migrate-jotform.js          -> dry run
//   node scripts/migrate-jotform.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[cols]] = await q(
  `select count(*)::int n from information_schema.columns
    where table_name = 'seances' and column_name in ('source', 'jotform_id', 'jotform_signature_url')`
);
const [[tables]] = await q(
  `select count(*)::int n from information_schema.tables
    where table_name in ('jotform_pending', 'jotform_aliases')`
);
console.log(`seances: ${cols.n}/3 columns present; tables: ${tables.n}/2 present.`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `ALTER TABLE seances
         ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app',
         ADD COLUMN IF NOT EXISTS jotform_id TEXT UNIQUE,
         ADD COLUMN IF NOT EXISTS jotform_signature_url TEXT`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS jotform_pending (
         id SERIAL PRIMARY KEY,
         jotform_id TEXT UNIQUE NOT NULL,
         date DATE,
         arrival TEXT,
         tutor_name TEXT,
         student_first TEXT,
         student_last TEXT,
         signature_url TEXT,
         reason TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         resolved_at TIMESTAMPTZ,
         resolved_by INTEGER,
         resolution TEXT
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS jotform_aliases (
         id SERIAL PRIMARY KEY,
         student_key TEXT NOT NULL,
         tutor_key TEXT NOT NULL,
         binome_id INTEGER NOT NULL,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (student_key, tutor_key)
       )`,
      transaction
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261107160000-jotform.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
