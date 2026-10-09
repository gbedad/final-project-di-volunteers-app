// One-off migration: users.last_login_at and users.last_seen_at, to show who
// is connected ("Connexions" page). Empty for everyone at first.
//   node scripts/migrate-last-seen.js          -> dry run
//   node scripts/migrate-last-seen.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [cols] = await db.query(
  `select column_name from information_schema.columns
     where table_name = 'users' and column_name in ('last_login_at', 'last_seen_at')`,
  { logging: false }
);
const existing = cols.map((c) => c.column_name);
for (const c of ['last_login_at', 'last_seen_at']) {
  console.log(existing.includes(c) ? `Column users.${c} already exists.` : `Column users.${c} to add (empty).`);
}
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ');
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ');
    await run('CREATE INDEX IF NOT EXISTS users_last_seen_at ON users (last_seen_at)');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261009200000-last-seen.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
