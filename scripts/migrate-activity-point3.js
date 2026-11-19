// One-off migration: a third meeting point, there and back
//  - activities.meeting_point3 / meeting_time3 and return_point3 / return_time3
//  - activity_registrations.meeting_choice / return_choice: the check that
//    allowed 1 or 2 now allows 1, 2 or 3
//   node scripts/migrate-activity-point3.js          -> dry run
//   node scripts/migrate-activity-point3.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [cols] = await q(
  `select column_name from information_schema.columns where table_name = 'activities'
    and column_name in ('meeting_point3', 'meeting_time3', 'return_point3', 'return_time3')`
);
console.log(`Columns present: ${cols.length}/4 ${cols.map((c) => c.column_name).join(', ')}`);
const [checks] = await q(
  `select c.conname, pg_get_constraintdef(c.oid) as def
     from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'activity_registrations' and c.contype = 'c'
      and (pg_get_constraintdef(c.oid) like '%meeting_choice%' or pg_get_constraintdef(c.oid) like '%return_choice%')`
);
console.log('Checks on the choices:', checks.map((c) => `${c.conname}: ${c.def}`));
const [[n]] = await q(`select count(*)::int as n from activity_registrations where meeting_choice is not null or return_choice is not null`);
console.log(`Registrations with a point chosen (kept as they are): ${n.n}`);

if (apply) {
  await db.transaction(async (t) => {
    for (const c of ['meeting_point3', 'meeting_time3', 'return_point3', 'return_time3']) {
      await q(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS ${c} TEXT`, t);
    }
    for (const c of checks) await q(`ALTER TABLE activity_registrations DROP CONSTRAINT "${c.conname}"`, t);
    await q(`ALTER TABLE activity_registrations ADD CONSTRAINT activity_registrations_meeting_choice_check CHECK (meeting_choice IN (1, 2, 3))`, t);
    await q(`ALTER TABLE activity_registrations ADD CONSTRAINT activity_registrations_return_choice_check CHECK (return_choice IN (1, 2, 3))`, t);
    await q(`insert into "SequelizeMeta"(name) values ('20261120100000-activity-point3.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
