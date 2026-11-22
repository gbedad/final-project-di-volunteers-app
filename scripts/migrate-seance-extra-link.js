// One-off migration: a session row can belong to an exceptional session
// (extra_sessions), so that a pair can have two sessions the same day: the
// regular one (slot) and one in addition (case « séance en plus »).
//  - seances.extra_id: the exceptional session the row was recorded for
//    (NULL for a regular session of the slot)
//  - backfill: rows of an exceptional session on a day the pair has no slot,
//    or when it replaces the slot, are linked to it; the others are listed
//   node scripts/migrate-seance-extra-link.js          -> dry run (reads only)
//   node scripts/migrate-seance-extra-link.js --apply  -> writes the changes
import db from '../config/database.js';
import { slotOn } from '../services/pairSchedule.js';

const apply = process.argv.includes('--apply');
// Rows of the query (not the [rows, metadata] pair of db.query)
const q = async (sql, transaction) => (await db.query(sql, { transaction, logging: false }))[0];

const colRows = await q(
  `select column_name from information_schema.columns where table_name = 'seances' and column_name = 'extra_id'`
);
const columnExists = colRows.length > 0;
console.log(`seances.extra_id: ${columnExists ? 'present' : 'to add'}`);

// Rows to link: the exceptional session of the day, when the pair has no
// slot that day or the exceptional session replaces the slot
const rows = await q(`
  select s.id as seance_id, s.binome_id, s.date::text as date,
         e.id as extra_id, e.kind, b.schedule, b.schedule_history
  from seances s
  join extra_sessions e on e.binome_id = s.binome_id and e.date = s.date
  join binomes b on b.id = s.binome_id
  where true ${columnExists ? 'and s.extra_id is null' : ''}
  order by s.binome_id, s.date, s.id`);
const toLink = [];
const toCheck = [];
for (const r of rows) {
  const pair = { id: r.binome_id, schedule: r.schedule, schedule_history: r.schedule_history };
  const slot = slotOn(pair, r.date);
  if (r.kind === 'remplacement' || !slot) toLink.push(r);
  else toCheck.push(r);
}
console.log(`à relier à leur séance exceptionnelle : ${toLink.length}`);
toLink.forEach((r) => console.log(`  seance ${r.seance_id} (binome ${r.binome_id}, ${r.date}) -> extra ${r.extra_id} (${r.kind})`));
console.log(`à vérifier à la main (créneau ce jour-là + séance exceptionnelle) : ${toCheck.length}`);
toCheck.forEach((r) => console.log(`  seance ${r.seance_id} (binome ${r.binome_id}, ${r.date}) ~ extra ${r.extra_id}`));

if (apply) {
  await db.transaction(async (transaction) => {
    if (!columnExists) {
      await q(
        `alter table seances add column extra_id integer references extra_sessions(id) on delete set null`,
        transaction
      );
      await q('create index if not exists seances_extra on seances (extra_id)', transaction);
    }
    for (const r of toLink) {
      await q(`update seances set extra_id = ${Number(r.extra_id)} where id = ${Number(r.seance_id)}`, transaction);
    }
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
