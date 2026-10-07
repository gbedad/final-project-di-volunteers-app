// One-off migration: archiving of former volunteers (users.archived_at,
// users.archive_reason). Nothing is archived by the migration itself.
//   node scripts/migrate-archive.js          -> dry run
//   node scripts/migrate-archive.js --apply  -> adds the columns
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [cols] = await db.query(
  `select column_name from information_schema.columns
   where table_name = 'users' and column_name in ('archived_at', 'archive_reason')`,
  { logging: false }
);
const missing = ['archived_at', 'archive_reason'].filter(
  (c) => !cols.some((r) => r.column_name === c)
);
console.log('Columns to add:', missing.join(', ') || 'none');
if (apply && missing.length) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ');
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS archive_reason TEXT');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261008120000-users-archive.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to add the columns.');
}
await db.close();
