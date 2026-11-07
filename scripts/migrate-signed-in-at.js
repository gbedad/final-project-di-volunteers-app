// One-off migration: seances.signed_in_at, the time the tutor signed in
// ("La séance a eu lieu"), shown in the sessions log of the team.
// Sessions already signed in (no report yet, created on the day of the
// session, on-site pair) get their creation time.
//   node scripts/migrate-signed-in-at.js          -> dry run
//   node scripts/migrate-signed-in-at.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[{ has }]] = await q(
  `select exists (select 1 from information_schema.columns
     where table_name = 'seances' and column_name = 'signed_in_at') as has`
);
console.log(has ? 'Column seances.signed_in_at already exists.' : 'Column seances.signed_in_at to add.');

const BACKFILL = `
  from seances s join binomes b on b.id = s.binome_id
  where s.work is null and s.remark is null and s.progress is null
    and (s.created_at at time zone 'Europe/Paris')::date = s.date
    and coalesce(b.how_location, '') !~* '^\\s*(à|a) distance\\s*$'`;
const [rows] = await q(`select s.id, s.date, s.created_at ${BACKFILL}`);
console.log(`Sessions signed in before the column (time = creation time): ${rows.length}`);
for (const r of rows) console.log(`  #${r.id} du ${r.date} -> ${new Date(r.created_at).toISOString()}`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE seances ADD COLUMN IF NOT EXISTS signed_in_at TIMESTAMPTZ', transaction);
    await q(
      `update seances set signed_in_at = created_at
        where signed_in_at is null and id in (select s.id ${BACKFILL})`,
      transaction
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261107120000-signed-in-at.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
