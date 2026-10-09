// One-off migration: online parental consent requests (table
// parental_consents). Each row is one link sent to a parent; the link's key
// is stored hashed.
//   node scripts/migrate-parental-consents.js          -> dry run
//   node scripts/migrate-parental-consents.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select to_regclass('public.parental_consents') is not null as exists`,
  { logging: false }
);
console.log(
  exists
    ? 'Table parental_consents already exists.'
    : 'Table parental_consents to create (empty).'
);
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS parental_consents (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      channel VARCHAR(20),
      sent_to VARCHAR(255),
      parent_name VARCHAR(255),
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      cancelled_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      signer_name VARCHAR(255),
      signer_relation VARCHAR(50),
      choices JSONB,
      texts_version VARCHAR(20),
      ip VARCHAR(100),
      user_agent TEXT,
      document_hash CHAR(64),
      file_id INTEGER REFERENCES student_files(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )`);
    await run(
      'CREATE INDEX IF NOT EXISTS parental_consents_student_id ON parental_consents (student_id)'
    );
    await run(`insert into "SequelizeMeta"(name)
      values ('20261009120000-parental-consents.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
