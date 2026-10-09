// One-off migration: participation of the families to the costs.
//  students: qf (quotient familial), qf_proof (caf / avis / none),
//  qf_file_id (proof in the student's documents), fee_special ("Autres"
//  hourly rate, above tranche 7), fee_override + fee_override_reason
//  parental_consents.fee: the participation the parent accepted (frozen)
//   node scripts/migrate-fees.js          -> dry run
//   node scripts/migrate-fees.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const COLUMNS = [
  ['students', 'qf', 'NUMERIC(10,2)'],
  ['students', 'qf_proof', 'VARCHAR(10)'],
  ['students', 'qf_file_id', 'INTEGER REFERENCES student_files(id) ON DELETE SET NULL'],
  ['students', 'fee_special', 'BOOLEAN NOT NULL DEFAULT false'],
  ['students', 'fee_override', 'NUMERIC(10,2)'],
  ['students', 'fee_override_reason', 'TEXT'],
  ['parental_consents', 'fee', 'JSONB'],
];
const [cols] = await db.query(
  `select table_name, column_name from information_schema.columns
     where table_name in ('students', 'parental_consents')`,
  { logging: false }
);
const has = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);
for (const [t, c] of COLUMNS) {
  console.log(has(t, c) ? `Column ${t}.${c} already exists.` : `Column ${t}.${c} to add (empty).`);
}
if (apply) {
  await db.transaction(async (transaction) => {
    for (const [t, c, type] of COLUMNS) {
      await db.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${type}`, { transaction, logging: false });
    }
    await db.query(
      `insert into "SequelizeMeta"(name) values ('20261009220000-fees.cjs') on conflict do nothing`,
      { transaction, logging: false }
    );
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
