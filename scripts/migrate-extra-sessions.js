// One-off migration: exceptional sessions and incidents of a student
//  - extra_sessions: a session out of the pair's slot, set by the team (or
//    declared afterwards by the tutor): 'supplementaire' (in addition) or
//    'remplacement' (instead of a regular session, which becomes a "Pas de
//    séance": break_id)
//  - student_incidents: incidents declared on the student's page, by type,
//    shown in "Contrôles" until they are marked as dealt with
//   node scripts/migrate-extra-sessions.js          -> dry run
//   node scripts/migrate-extra-sessions.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [found] = await q(
  `select table_name from information_schema.tables where table_name in ('extra_sessions', 'student_incidents')`
);
const has = (t) => found.some((r) => r.table_name === t);
console.log(`extra_sessions: ${has('extra_sessions') ? 'present' : 'to create'}`);
console.log(`student_incidents: ${has('student_incidents') ? 'present' : 'to create'}`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `CREATE TABLE IF NOT EXISTS extra_sessions (
         id SERIAL PRIMARY KEY,
         binome_id INTEGER NOT NULL REFERENCES binomes(id) ON DELETE CASCADE,
         kind TEXT NOT NULL CHECK (kind IN ('supplementaire', 'remplacement')),
         date DATE NOT NULL,
         start_time TEXT NOT NULL,
         end_time TEXT NOT NULL,
         remote BOOLEAN NOT NULL DEFAULT false,
         replaces_date DATE,
         break_id INTEGER REFERENCES pair_breaks(id) ON DELETE SET NULL,
         note TEXT,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (binome_id, date)
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS student_incidents (
         id SERIAL PRIMARY KEY,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         binome_id INTEGER REFERENCES binomes(id) ON DELETE SET NULL,
         date DATE NOT NULL,
         type TEXT NOT NULL,
         note TEXT,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         resolved_at TIMESTAMPTZ,
         resolved_by INTEGER,
         resolution TEXT
       )`,
      transaction
    );
    await q('CREATE INDEX IF NOT EXISTS student_incidents_student ON student_incidents (student_id, date)', transaction);
    await q(
      `insert into "SequelizeMeta"(name) values ('20261115120000-extra-sessions.cjs') on conflict do nothing`,
      transaction
    );
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
