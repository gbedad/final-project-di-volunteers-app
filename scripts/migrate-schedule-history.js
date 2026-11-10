// One-off migration:
//  - binomes.schedule_history: the pair's slots and the day each one
//    applies from ([{ since: 'YYYY-MM-DD' | null, schedule: [...] }]); the
//    log, the expected sessions and lateness use the slot of each date
//  - seances.zoom_host_at: when the tutor joined on Zoom (a student is late
//    only after the later of the slot and the tutor)
//  - pair #20 (Jade / Sonia): 12:00-13:00 on Sundays until 2026-10-31,
//    11:00-12:00 from 2026-11-01 (said by the team on 2026-11-10)
//   node scripts/migrate-schedule-history.js          -> dry run
//   node scripts/migrate-schedule-history.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction, replacements) => db.query(sql, { transaction, replacements, logging: false });

const [[cols]] = await q(
  `select count(*)::int n from information_schema.columns
    where (table_name = 'binomes' and column_name = 'schedule_history')
       or (table_name = 'seances' and column_name = 'zoom_host_at')`
);
console.log(`columns: ${cols.n}/2 present.`);
const JADE = [
  { since: null, schedule: [{ day: 'Dimanche', startTime: '12:00', endTime: '13:00' }] },
  { since: '2026-11-01', schedule: [{ day: 'Dimanche', startTime: '11:00', endTime: '12:00' }] },
];
console.log('pair #20 history:', JSON.stringify(JADE));

if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS schedule_history JSONB', transaction);
    await q('ALTER TABLE seances ADD COLUMN IF NOT EXISTS zoom_host_at TIMESTAMPTZ', transaction);
    await q(
      `update binomes set schedule_history = :h::jsonb, schedule = :s::jsonb where id = 20`,
      transaction,
      { h: JSON.stringify(JADE), s: JSON.stringify(JADE[1].schedule) }
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261110180000-schedule-history.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
