// One-off migration: cultural activities, second step (the team's model
// file "Modèle fichier activité.xlsx")
//  - activities: programme ("parcours"), objective, link, what to bring,
//    two meeting points with times, person in charge, WhatsApp group,
//    preparation and debrief sessions, review, volunteer time, notes
//  - activity_registrations: outing authorisation signed online by the
//    parent (link, PDF), coming / leaving alone or accompanied, phone during
//    the outing, presences at the preparation and the debrief
//  - activity_staff: parents going with the group (linked to their child)
//  - activity_expenses: each expense (who paid, how, when, supplier,
//    accounting label, receipt), and its refund by the treasurer
//  - student_memberships: the yearly membership fee of each student
//   node scripts/migrate-activities-2.js          -> dry run
//   node scripts/migrate-activities-2.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [tables] = await q(
  `select table_name from information_schema.tables where table_name in ('activity_expenses', 'student_memberships')`
);
const [[cols]] = await q(
  `select count(*)::int n from information_schema.columns
    where (table_name = 'activities' and column_name in ('objective', 'program', 'prep', 'volunteer_minutes'))
       or (table_name = 'activity_registrations' and column_name in ('consent_token_hash', 'arrival', 'attendance_prep'))
       or (table_name = 'activity_staff' and column_name = 'student_id')`
);
const [[costs]] = await q(`select count(*)::int n from activities where jsonb_array_length(costs) > 0`);
console.log(`new tables present: ${tables.map((t) => t.table_name).join(', ') || 'none'} (2 expected)`);
console.log(`new columns present: ${cols.n}/8; activities with costs to move to expenses: ${costs.n}`);

const ACTIVITY_COLUMNS = [
  'program TEXT',
  'objective TEXT',
  'link TEXT',
  'bring TEXT',
  'meeting_time TEXT',
  'meeting_point2 TEXT',
  'meeting_time2 TEXT',
  'responsible TEXT',
  'whatsapp_group TEXT',
  "prep JSONB",
  "debrief JSONB",
  'review TEXT',
  'volunteer_minutes INTEGER',
  "notes JSONB NOT NULL DEFAULT '[]'",
];
const REGISTRATION_COLUMNS = [
  'consent_source TEXT',
  'consent_token_hash TEXT UNIQUE',
  'consent_requested_at TIMESTAMPTZ',
  'consent_expires_at TIMESTAMPTZ',
  'consent_channel TEXT',
  'consent_sent_to TEXT',
  'consent_signer TEXT',
  'consent_relation TEXT',
  'consent_choices JSONB',
  'consent_file_id INTEGER',
  'consent_ip TEXT',
  'arrival TEXT',
  'departure TEXT',
  'emergency_phone TEXT',
  'attendance_prep TEXT',
  'attendance_post TEXT',
];

if (apply) {
  await db.transaction(async (transaction) => {
    for (const c of ACTIVITY_COLUMNS) await q(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS ${c}`, transaction);
    for (const c of REGISTRATION_COLUMNS) {
      await q(`ALTER TABLE activity_registrations ADD COLUMN IF NOT EXISTS ${c}`, transaction);
    }
    await q('ALTER TABLE activity_staff ADD COLUMN IF NOT EXISTS student_id INTEGER', transaction);
    await q(
      `CREATE TABLE IF NOT EXISTS activity_expenses (
         id SERIAL PRIMARY KEY,
         activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
         label TEXT NOT NULL,
         amount NUMERIC(10,2) NOT NULL DEFAULT 0,
         paid_by TEXT,
         method TEXT,
         paid_on DATE,
         beneficiary TEXT,
         accounting_label TEXT,
         receipt_key TEXT,
         receipt_name TEXT,
         to_refund BOOLEAN NOT NULL DEFAULT false,
         refunded_at DATE,
         refunded_by INTEGER,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS student_memberships (
         id SERIAL PRIMARY KEY,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         school_year TEXT NOT NULL,
         amount NUMERIC(8,2) NOT NULL DEFAULT 10,
         paid_at DATE,
         method TEXT,
         note TEXT,
         recorded_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (student_id, school_year)
       )`,
      transaction
    );
    // The first costs (label + amount) become expenses
    await q(
      `insert into activity_expenses (activity_id, label, amount)
       select a.id, c->>'label', coalesce((c->>'amount')::numeric, 0)
         from activities a, jsonb_array_elements(a.costs) c
        where not exists (select 1 from activity_expenses e where e.activity_id = a.id)`,
      transaction
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261112180000-activities-2.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
