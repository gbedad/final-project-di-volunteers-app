// One-off migration: users.accounting_tiers_id (tutor's third-party identifier
// in the accounting software). See migrations/20261121160000-users-accounting-tiers.cjs
//   node scripts/migrate-users-accounting-tiers.js          -> dry run (reads only)
//   node scripts/migrate-users-accounting-tiers.js --apply  -> adds the column
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'accounting_tiers_id') as has`,
  { logging: false }
);
console.log(has ? 'Column already exists.' : 'Column users.accounting_tiers_id to add.');
if (apply && !has) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS accounting_tiers_id VARCHAR(255)');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261121160000-users-accounting-tiers.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the column.');
}
await db.close();
