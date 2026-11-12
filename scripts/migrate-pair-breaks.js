// One-off migration: sessions not held, said in advance, and holidays
//  - pair_breaks: "Pas de séance" from a day to a day (tutor or team), with
//    a reason; those days are not expected in the sessions log
//  - binomes.during_holidays: the pair goes on during the school holidays
//  - binomes.schedule_request: new slot told by the tutor, until the team
//    applies it ({ schedule, note, at })
//  - binomes.resume_notice: school return day of the last "back to
//    school" e-mail sent to the tutor (one per return)
//   node scripts/migrate-pair-breaks.js          -> dry run
//   node scripts/migrate-pair-breaks.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[cols]] = await q(
  `select count(*)::int n from information_schema.columns
    where table_name = 'binomes' and column_name in ('during_holidays', 'schedule_request', 'resume_notice')`
);
const [[tables]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'pair_breaks'`);
console.log(`binomes columns: ${cols.n}/3 present; table pair_breaks: ${tables.n ? 'present' : 'to create'}.`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS during_holidays BOOLEAN NOT NULL DEFAULT false', transaction);
    await q('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS schedule_request JSONB', transaction);
    await q('ALTER TABLE binomes ADD COLUMN IF NOT EXISTS resume_notice DATE', transaction);
    await q(
      `CREATE TABLE IF NOT EXISTS pair_breaks (
         id SERIAL PRIMARY KEY,
         binome_id INTEGER NOT NULL REFERENCES binomes(id) ON DELETE CASCADE,
         date_from DATE NOT NULL,
         date_to DATE NOT NULL,
         reason TEXT NOT NULL,
         note TEXT,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         CHECK (date_to >= date_from)
       )`,
      transaction
    );
    await q('CREATE INDEX IF NOT EXISTS pair_breaks_binome ON pair_breaks (binome_id, date_to)', transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261112120000-pair-breaks.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
