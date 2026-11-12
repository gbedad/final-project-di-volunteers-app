// One-off migration: the family convention ("Convention d'engagement
// réciproque … bénéficiaire"), one per student and school year, signed
// online by one legal guardian, countersigned automatically
//   node scripts/migrate-family-conventions.js          -> dry run
//   node scripts/migrate-family-conventions.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const [[t]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'family_conventions'`);
console.log(`table family_conventions: ${t.n ? 'present' : 'to create'}`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `CREATE TABLE IF NOT EXISTS family_conventions (
         id SERIAL PRIMARY KEY,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         school_year TEXT NOT NULL,
         -- envoyée, signée, papier, annulée
         status TEXT NOT NULL DEFAULT 'envoyée',
         token_hash TEXT UNIQUE,
         channel TEXT,
         sent_to TEXT,
         requested_by INTEGER,
         requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         expires_at TIMESTAMPTZ,
         -- what the team set (participation, deposit, other, obligations)
         team_values JSONB NOT NULL DEFAULT '{}',
         -- what the parent gave (contact, address, choices)
         parent_values JSONB,
         signer_name TEXT,
         signer_relation TEXT,
         signed_at TIMESTAMPTZ,
         ip TEXT,
         user_agent TEXT,
         document_hash TEXT,
         file_id INTEGER,
         cancelled_at TIMESTAMPTZ,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      transaction
    );
    await q('CREATE INDEX IF NOT EXISTS family_conventions_student ON family_conventions (student_id, school_year)', transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261112200000-family-conventions.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
