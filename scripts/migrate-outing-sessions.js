// One-off migration: the children of the preparation and return sessions of
// an outing are listed apart (not every child registered to the outing comes
// to them, and others may join)
//  - activity_session_participants: activity, kind ('prep' | 'debrief'),
//    student, presence. The presences already noted on the registrations
//    (attendance_prep, attendance_post) are carried over.
//   node scripts/migrate-outing-sessions.js          -> dry run
//   node scripts/migrate-outing-sessions.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[t]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'activity_session_participants'`);
console.log(`Table activity_session_participants: ${t.n ? 'present' : 'to create'}`);
const [[c]] = await q(
  `select count(*) filter (where attendance_prep is not null)::int as prep,
          count(*) filter (where attendance_post is not null)::int as debrief
     from activity_registrations`
);
console.log(`Presences carried over: ${c.prep} for the preparation, ${c.debrief} for the return session`);
const [detail] = await q(
  `select a.id, a.title,
          count(*) filter (where r.attendance_prep is not null)::int as prep,
          count(*) filter (where r.attendance_post is not null)::int as debrief
     from activity_registrations r join activities a on a.id = r.activity_id
    where r.attendance_prep is not null or r.attendance_post is not null
    group by a.id, a.title order by a.id`
);
for (const d of detail) console.log(`  #${d.id} ${d.title}: preparation ${d.prep}, return ${d.debrief}`);

if (apply) {
  await db.transaction(async (tr) => {
    await q(
      `CREATE TABLE IF NOT EXISTS activity_session_participants (
         id SERIAL PRIMARY KEY,
         activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
         kind TEXT NOT NULL CHECK (kind IN ('prep', 'debrief')),
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         attendance TEXT,
         created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (activity_id, kind, student_id)
       )`,
      tr
    );
    await q(
      `insert into activity_session_participants (activity_id, kind, student_id, attendance)
         select activity_id, 'prep', student_id, attendance_prep from activity_registrations where attendance_prep is not null
       on conflict do nothing`,
      tr
    );
    await q(
      `insert into activity_session_participants (activity_id, kind, student_id, attendance)
         select activity_id, 'debrief', student_id, attendance_post from activity_registrations where attendance_post is not null
       on conflict do nothing`,
      tr
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261119100000-outing-sessions.cjs') on conflict do nothing`, tr);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
