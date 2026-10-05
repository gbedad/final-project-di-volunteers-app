// One-off migration: creates the status_changes table (history of the
// volunteers' statuses, starting now: past changes are unknown)
//   node scripts/migrate-status-history.js          -> dry run, changes nothing
//   node scripts/migrate-status-history.js --apply  -> creates the table
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select to_regclass('public.status_changes') is not null as exists`,
  { logging: false }
);
console.log(exists ? 'Table status_changes already exists.' : 'Table status_changes to create (empty).');

if (apply && !exists) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS status_changes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_status VARCHAR(255),
      to_status VARCHAR(255) NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`CREATE INDEX IF NOT EXISTS status_changes_user_id_changed_at
      ON status_changes (user_id, changed_at)`);
    await run(`insert into "SequelizeMeta"(name)
      values ('20261005140000-status-changes.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to create the table.');
}
await db.close();
