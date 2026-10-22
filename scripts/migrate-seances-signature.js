// One-off migration: the student signs the attendance sheet at the end of
// an on-site session.
//  seances.student_signature: key of the image in the private storage
//  seances.student_signed_at: time of the signature (server)
//  seances.no_signature: the tutor said the student could not sign
//   node scripts/migrate-seances-signature.js          -> dry run
//   node scripts/migrate-seances-signature.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const COLUMNS = [
  ['student_signature', 'VARCHAR(255)'],
  ['student_signed_at', 'TIMESTAMPTZ'],
  ['no_signature', 'BOOLEAN NOT NULL DEFAULT false'],
];
const [cols] = await db.query(
  `select column_name from information_schema.columns where table_name = 'seances'`,
  { logging: false }
);
for (const [c] of COLUMNS) {
  console.log(cols.some((x) => x.column_name === c) ? `Column seances.${c} already exists.` : `Column seances.${c} to add (empty).`);
}
if (apply) {
  await db.transaction(async (transaction) => {
    for (const [c, type] of COLUMNS) {
      await db.query(`ALTER TABLE seances ADD COLUMN IF NOT EXISTS ${c} ${type}`, { transaction, logging: false });
    }
    await db.query(`insert into "SequelizeMeta"(name) values ('20261022120000-seances-signature.cjs') on conflict do nothing`, { transaction, logging: false });
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
