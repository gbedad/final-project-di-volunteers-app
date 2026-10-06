// One-off migration for the two-signature convention: conventions uploaded
// before it are considered countersigned (doc_type "convention" ->
// "convention_final"), then the "convention reçue" boxes are recomputed.
//   node scripts/migrate-conventions-final.js          -> dry run
//   node scripts/migrate-conventions-final.js --apply  -> writes the changes
import db from '../config/database.js';
import { updateReceivedFlag } from '../services/application.js';

const apply = process.argv.includes('--apply');
// Up to the deployment of the new convention process
const before = process.argv.find((a) => a.startsWith('--before='))?.slice(9);
const [files] = await db.query(
  `select f.id, f."userId", f.path, f.uploaded_at, u.first_name, u.last_name
   from files f left join users u on u.id = f."userId"
   where f.doc_type = 'convention'
   ${before ? 'and (f.uploaded_at < :before or f.uploaded_at is null)' : ''}
   order by f."userId", f.id`,
  { replacements: { before }, logging: false }
);
console.log(`${files.length} convention file(s) to mark as countersigned:`);
for (const f of files) {
  console.log(
    `  #${f.userId} ${f.first_name} ${f.last_name} | ${String(f.uploaded_at).slice(0, 10)} | ${
      f.path.includes('amazonaws') ? 'fichier perdu (AWS)' : f.path
    }`
  );
}
if (apply && files.length) {
  await db.transaction(async (transaction) => {
    await db.query(
      `update files set doc_type = 'convention_final' where id in (:ids)`,
      { replacements: { ids: files.map((f) => f.id) }, transaction, logging: false }
    );
  });
  for (const userId of new Set(files.map((f) => f.userId))) {
    if (userId) await updateReceivedFlag(userId, 'convention_final');
  }
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
