// One-off migration: online signature of the volunteer convention.
//  users: charte_read_at + charte_version (the volunteer read the Charte),
//    convention_end_date and convention_other (filled in by the team)
//  convention_signatures: proof of each signature (volunteer, president)
//   node scripts/migrate-convention-signing.js          -> dry run
//   node scripts/migrate-convention-signing.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const COLUMNS = [
  ['charte_read_at', 'TIMESTAMPTZ'],
  ['charte_version', 'VARCHAR(255)'],
  ['convention_end_date', 'DATE'],
  ['convention_other', 'TEXT'],
];
const [cols] = await db.query(
  `select column_name from information_schema.columns where table_name = 'users'`,
  { logging: false }
);
for (const [c] of COLUMNS) {
  console.log(cols.some((x) => x.column_name === c) ? `Column users.${c} already exists.` : `Column users.${c} to add (empty).`);
}
const [[{ exists }]] = await db.query(
  `select to_regclass('public.convention_signatures') is not null as exists`,
  { logging: false }
);
console.log(exists ? 'Table convention_signatures already exists.' : 'Table convention_signatures to create (empty).');
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    for (const [c, type] of COLUMNS) await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${c} ${type}`);
    await run(`CREATE TABLE IF NOT EXISTS convention_signatures (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      signer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(20) NOT NULL,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      consents JSONB,
      fields JSONB,
      charte_version VARCHAR(255),
      template_version VARCHAR(255),
      ip VARCHAR(100),
      user_agent TEXT,
      document_hash CHAR(64),
      file_id INTEGER REFERENCES files(id) ON DELETE SET NULL
    )`);
    await run('CREATE INDEX IF NOT EXISTS convention_signatures_user_id ON convention_signatures (user_id)');
    await run(`insert into "SequelizeMeta"(name) values ('20261011100000-convention-signing.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
