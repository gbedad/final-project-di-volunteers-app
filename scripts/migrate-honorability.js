// One-off migration: adds users.honorability_received (attestation
// d'honorabilité received, like cv_received / b3_received); false for all
//   node scripts/migrate-honorability.js          -> dry run, changes nothing
//   node scripts/migrate-honorability.js --apply  -> adds the column
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'honorability_received')`,
  { logging: false }
);
const [[{ count }]] = await db.query('select count(*) from users', {
  logging: false,
});
console.log(
  exists
    ? 'Column users.honorability_received already exists.'
    : `Column users.honorability_received to add (false for the ${count} users).`
);

if (apply && !exists) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS honorability_received BOOLEAN DEFAULT false'
    );
    await run(`insert into "SequelizeMeta"(name)
      values ('20261006120000-honorability-received.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the column.');
}
await db.close();
