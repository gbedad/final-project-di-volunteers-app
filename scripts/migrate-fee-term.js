// One-off migration: students.fee_term, a fixed amount per term agreed with
// the family as an exception (e.g. QF above 2 500 € but a fixed amount)
//   node scripts/migrate-fee-term.js          -> dry run
//   node scripts/migrate-fee-term.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'students' and column_name = 'fee_term') as has`,
  { logging: false }
);
console.log(has ? 'Column students.fee_term already exists.' : 'Column students.fee_term to add (empty).');
if (apply) {
  await db.transaction(async (transaction) => {
    await db.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS fee_term NUMERIC(10,2)', { transaction, logging: false });
    await db.query(`insert into "SequelizeMeta"(name) values ('20261022140000-fee-term.cjs') on conflict do nothing`, { transaction, logging: false });
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
