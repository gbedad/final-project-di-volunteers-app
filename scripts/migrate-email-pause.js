// One-off migration: pause of the e-mails to the volunteers.
//  app_settings: settings changed from the application (key -> JSON value)
//  withheld_emails: e-mails not sent during a pause (sent later or not)
//   node scripts/migrate-email-pause.js          -> dry run
//   node scripts/migrate-email-pause.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
for (const t of ['app_settings', 'withheld_emails']) {
  const [[{ exists }]] = await db.query(`select to_regclass('public.${t}') is not null as exists`, { logging: false });
  console.log(exists ? `Table ${t} already exists.` : `Table ${t} to create (empty).`);
}
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS withheld_emails (
      id SERIAL PRIMARY KEY,
      recipients TEXT NOT NULL,
      subject TEXT,
      html TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ,
      discarded_at TIMESTAMPTZ
    )`);
    await run(`insert into "SequelizeMeta"(name) values ('20261012100000-email-pause.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
