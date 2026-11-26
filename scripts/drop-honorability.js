// One-off migration: drops users.honorability_received (the attestation
// d'honorabilité is no longer asked). Irreversible for the stored ticks.
//   node scripts/drop-honorability.js          -> dry run, changes nothing
//   node scripts/drop-honorability.js --apply  -> drops the column
// Deploy the server code first: the running code must not read the column.
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'honorability_received')`,
  { logging: false }
);

if (!exists) {
  console.log('Column users.honorability_received already gone. Nothing to do.');
} else {
  const [[{ ticked }]] = await db.query(
    'select count(*) as ticked from users where honorability_received = true',
    { logging: false }
  );
  console.log(
    `Column users.honorability_received to drop (${ticked} users ticked as received will lose that tick).`
  );
  if (apply) {
    await db.transaction(async (transaction) => {
      const run = (sql) => db.query(sql, { transaction, logging: false });
      await run('ALTER TABLE users DROP COLUMN IF EXISTS honorability_received');
      await run(`insert into "SequelizeMeta"(name)
        values ('20261126120000-drop-honorability-received.cjs') on conflict do nothing`);
    });
    console.log('Applied.');
  } else {
    console.log('Dry run only. Add --apply to drop the column.');
  }
}
await db.close();
