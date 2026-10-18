// One-off fix: file names stored garbled ("signÃ©e" for "signée") before
// the upload decoded them (config/aws.config.js, fixFileName)
//   node scripts/fix-file-names.js          -> dry run
//   node scripts/fix-file-names.js --apply  -> writes the changes
import db from '../config/database.js';
import { fixFileName } from '../config/aws.config.js';

const apply = process.argv.includes('--apply');
const changes = [];
for (const table of ['files', 'student_files']) {
  const [rows] = await db.query(`select id, filename from ${table} where filename ~ '[ÃÂ]'`, { logging: false });
  for (const r of rows) {
    const fixed = fixFileName({ originalname: r.filename }).originalname;
    if (fixed !== r.filename) changes.push({ table, id: r.id, from: r.filename, to: fixed });
  }
}
for (const c of changes) console.log(`  ${c.table} #${c.id}: ${c.from}  ->  ${c.to}`);
console.log(`${changes.length} file name(s) to fix.`);
if (apply && changes.length) {
  await db.transaction(async (transaction) => {
    for (const c of changes) {
      await db.query(`update ${c.table} set filename = :to where id = :id`, { replacements: c, transaction, logging: false });
    }
  });
  console.log('Applied.');
} else if (!apply) console.log('Dry run only. Add --apply to write these changes.');
await db.close();
