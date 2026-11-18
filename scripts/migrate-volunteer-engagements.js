// One-off migration: volunteers who are not tutors (they go with the
// children on the outings, cultural or scientific activities…)
//  - users.engagements_wished: what the volunteer ticks ('tutorat',
//    'culture', 'sciences'), at registration or later in his space
//  - users.engagements: what the team gives him in the end (null: not yet
//    decided, the wishes count)
//  - users.outing_periods: when an accompanying volunteer is rather free
//    ('semaine', 'weekend', 'vacances')
// Existing volunteers are tutors: both lists get ['tutorat'].
//   node scripts/migrate-volunteer-engagements.js          -> dry run
//   node scripts/migrate-volunteer-engagements.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [cols] = await q(
  `select column_name from information_schema.columns
    where table_name = 'users' and column_name in ('engagements_wished', 'engagements', 'outing_periods')`
);
console.log(`Columns present: ${cols.length}/3 ${cols.map((c) => c.column_name).join(', ')}`);
const [[n]] = await q(`select count(*)::int as n from users where role = 'volunteer'`);
console.log(`Volunteers given ['tutorat'] (wished and assigned): ${n.n}`);

if (apply) {
  await db.transaction(async (t) => {
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS engagements_wished JSONB', t);
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS engagements JSONB', t);
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS outing_periods JSONB', t);
    await q(
      `update users set engagements_wished = coalesce(engagements_wished, '["tutorat"]'::jsonb),
                        engagements = coalesce(engagements, '["tutorat"]'::jsonb)
        where role = 'volunteer'`,
      t
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261118100000-volunteer-engagements.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
