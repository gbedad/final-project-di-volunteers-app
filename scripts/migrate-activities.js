// One-off migration: cultural activities (outings), apart from the tutoring
//  - activities: the outing (card), its costs and the participation asked
//    of each family
//  - activity_registrations: the students registered (or waiting), their
//    outing authorisation, what they owe and paid, their presence
//  - activity_staff: the adults who go with them (not platform accounts;
//    a tutor can be linked), each with a link to tick the presences
//   node scripts/migrate-activities.js          -> dry run
//   node scripts/migrate-activities.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [rows] = await q(
  `select table_name from information_schema.tables
    where table_name in ('activities', 'activity_registrations', 'activity_staff')`
);
console.log(`tables present: ${rows.map((r) => r.table_name).join(', ') || 'none'} (3 expected).`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `CREATE TABLE IF NOT EXISTS activities (
         id SERIAL PRIMARY KEY,
         title TEXT NOT NULL,
         kind TEXT,
         description TEXT,
         date DATE,
         start_time TEXT,
         end_time TEXT,
         place TEXT,
         meeting_point TEXT,
         image TEXT,
         levels TEXT[] NOT NULL DEFAULT '{}',
         places INTEGER,
         deadline DATE,
         status TEXT NOT NULL DEFAULT 'brouillon',
         fee NUMERIC(8,2) NOT NULL DEFAULT 0,
         costs JSONB NOT NULL DEFAULT '[]',
         adults_per_students INTEGER NOT NULL DEFAULT 8,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS activity_registrations (
         id SERIAL PRIMARY KEY,
         activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         status TEXT NOT NULL DEFAULT 'inscrit',
         consent_at DATE,
         fee_override NUMERIC(8,2),
         paid_amount NUMERIC(8,2),
         paid_at DATE,
         paid_method TEXT,
         attendance TEXT,
         attendance_at TIMESTAMPTZ,
         attendance_by TEXT,
         note TEXT,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (activity_id, student_id)
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS activity_staff (
         id SERIAL PRIMARY KEY,
         activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
         user_id INTEGER,
         name TEXT NOT NULL,
         phone TEXT,
         email TEXT,
         role TEXT NOT NULL DEFAULT 'accompagnateur',
         token TEXT UNIQUE NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      transaction
    );
    await q('CREATE INDEX IF NOT EXISTS activity_registrations_student ON activity_registrations (student_id)', transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261112150000-activities.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
