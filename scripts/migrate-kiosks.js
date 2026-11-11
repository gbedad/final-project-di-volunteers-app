// One-off migration: kiosks — the attendance tablets on site ("borne
// d'émargement"). A tablet is activated once by a link from the team; it is
// recognised by a secret kept in the tablet (only its hash is stored here).
// Sessions signed in on a tablet have the source 'borne'.
//   node scripts/migrate-kiosks.js          -> dry run
//   node scripts/migrate-kiosks.js --apply  -> writes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.tables where table_name = 'kiosks') as has`,
  { logging: false }
);
console.log(has ? 'Table kiosks already exists.' : 'Table kiosks to create.');
if (apply) {
  await db.transaction(async (transaction) => {
    await db.query(
      `CREATE TABLE IF NOT EXISTS kiosks (
         id SERIAL PRIMARY KEY,
         name TEXT NOT NULL,
         site TEXT,
         token_hash TEXT UNIQUE NOT NULL,
         created_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         last_seen_at TIMESTAMPTZ,
         revoked_at TIMESTAMPTZ
       )`,
      { transaction, logging: false }
    );
    await db.query(`insert into "SequelizeMeta"(name) values ('20261111150000-kiosks.cjs') on conflict do nothing`, { transaction, logging: false });
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
