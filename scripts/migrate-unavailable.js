// One-off migration: users.unavailable_until (tutor not available for a new
// student until that date; availability itself is computed)
//   node scripts/migrate-unavailable.js          -> dry run
//   node scripts/migrate-unavailable.js --apply  -> adds the column
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'unavailable_until') as has`,
  { logging: false }
);
console.log(has ? 'Column already exists.' : 'Column users.unavailable_until to add (empty).');
if (apply && !has) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS unavailable_until DATE');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261008140000-users-unavailable-until.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the column.');
}
await db.close();
