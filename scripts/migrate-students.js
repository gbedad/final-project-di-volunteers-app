// One-off migration for the students module (step 1):
//  - new columns on students (needs, referral, modality, consent, demo flag)
//  - status "Nouvelle demande" by default
//  - removes the old test students (created in 2024, never filled in)
//   node scripts/migrate-students.js          -> dry run
//   node scripts/migrate-students.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = async (sql, options = {}) =>
  (await db.query(sql, { logging: false, ...options }))[0];

const COLUMNS = [
  ['referral_source', 'VARCHAR(255)'],
  ['referral_contact', 'VARCHAR(255)'],
  ['goals', "VARCHAR(255)[] DEFAULT '{}'"],
  ['needs', 'TEXT'],
  ['special_needs', 'TEXT'],
  ['how_location', 'VARCHAR(255)'],
  ['track', 'VARCHAR(255)'],
  ['parental_consent_at', 'TIMESTAMPTZ'],
  ['is_demo', 'BOOLEAN DEFAULT false'],
];
const existing = new Set(
  (
    await q(
      `select column_name from information_schema.columns where table_name = 'students'`
    )
  ).map((r) => r.column_name)
);
const toAdd = COLUMNS.filter(([name]) => !existing.has(name));
console.log('Columns to add:', toAdd.map(([n]) => n).join(', ') || 'none');

// Old test students: created before this module, still "Compte créé"
const oldTests = await q(
  `select id, first_name, last_name, created_at from students
   where status = 'Compte créé' and created_at < '2026-01-01' order by id`
);
console.log(
  `Old test students to delete: ${oldTests
    .map((s) => `#${s.id} ${s.first_name} ${s.last_name}`)
    .join(', ') || 'none'}`
);

if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { replacements, transaction, logging: false });
    for (const [name, type] of toAdd) {
      await run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    }
    await run(
      `ALTER TABLE students ALTER COLUMN status SET DEFAULT 'Nouvelle demande'`
    );
    if (oldTests.length) {
      await run('delete from students where id in (:ids)', {
        ids: oldTests.map((s) => s.id),
      });
    }
    await run(`insert into "SequelizeMeta"(name)
      values ('20261007120000-students-needs.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
