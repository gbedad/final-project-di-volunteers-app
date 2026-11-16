// One-off migration: outings, third step
//  - activities.organizer_id: the organiser (a name of the base: team or
//    validated tutor), shown everywhere; who can change the outing stays
//    owner_id (the creator, or the one it was handed to)
//  - activities.return_point / return_time (+ 2): meeting points of the way
//    back, as meeting_point / meeting_time (+ 2) are those of the way there
//  - activities.ambassador_brief: detailed presentation for the ambassadors
//    who offer the outing (a page to copy or share)
//  - activities.flyer_settings: flyers by destination, the fields ticked
//    ({ <type>: { fields: [...], cta } })
//  - activity_registrations.meeting_choice / return_choice: meeting point (1
//    or 2) of the student, there and back, set by the team
// Existing: the free "Responsable" text becomes the organiser when it is
// exactly the name of an account; registrations get point 1 where the
// outing has one.
//   node scripts/migrate-activities-3.js          -> dry run
//   node scripts/migrate-activities-3.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [cols] = await q(
  `select table_name, column_name from information_schema.columns
    where (table_name = 'activities' and column_name in ('organizer_id', 'return_point', 'return_time', 'return_point2', 'return_time2', 'ambassador_brief', 'flyer_settings'))
       or (table_name = 'activity_registrations' and column_name in ('meeting_choice', 'return_choice'))`
);
console.log(`Columns present: ${cols.length}/9 ${cols.map((c) => c.column_name).join(', ')}`);
const [matches] = await q(
  `select a.id, a.title, a.responsible, u.id as user_id, u.role
     from activities a
     join users u on lower(trim(u.first_name || ' ' || u.last_name)) = lower(trim(a.responsible))
    where coalesce(a.responsible, '') <> ''`
);
const [unmatched] = await q(
  `select a.id, a.title, a.responsible from activities a
    where coalesce(a.responsible, '') <> ''
      and not exists (select 1 from users u where lower(trim(u.first_name || ' ' || u.last_name)) = lower(trim(a.responsible)))`
);
console.log('Organiser from "Responsable":', matches.map((m) => `#${m.id} ${m.title} -> user ${m.user_id} (${m.role})`));
console.log('"Responsable" without an account (kept as text):', unmatched.map((m) => `#${m.id} ${m.responsible}`));
const [[regs]] = await q(
  `select count(*)::int as n from activity_registrations r join activities a on a.id = r.activity_id
    where coalesce(a.meeting_point, '') <> ''`
);
console.log(`Registrations given meeting point 1 (outing with a meeting point): ${regs.n}`);

if (apply) {
  await db.transaction(async (t) => {
    await q('ALTER TABLE activities ADD COLUMN IF NOT EXISTS organizer_id INTEGER REFERENCES users(id) ON DELETE SET NULL', t);
    for (const c of ['return_point', 'return_time', 'return_point2', 'return_time2', 'ambassador_brief']) {
      await q(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS ${c} TEXT`, t);
    }
    await q('ALTER TABLE activities ADD COLUMN IF NOT EXISTS flyer_settings JSONB', t);
    await q('ALTER TABLE activity_registrations ADD COLUMN IF NOT EXISTS meeting_choice SMALLINT CHECK (meeting_choice IN (1, 2))', t);
    await q('ALTER TABLE activity_registrations ADD COLUMN IF NOT EXISTS return_choice SMALLINT CHECK (return_choice IN (1, 2))', t);
    await q(
      `update activities a set organizer_id = u.id
         from users u
        where a.organizer_id is null and coalesce(a.responsible, '') <> ''
          and lower(trim(u.first_name || ' ' || u.last_name)) = lower(trim(a.responsible))`,
      t
    );
    await q(
      `update activity_registrations r set meeting_choice = 1
         from activities a
        where a.id = r.activity_id and r.meeting_choice is null and coalesce(a.meeting_point, '') <> ''`,
      t
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261116150000-activities-3.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
