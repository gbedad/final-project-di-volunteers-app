// One-off migration: who is in charge of each outing (owner_id). The
// "culture" role can only change the outings it is in charge of; "super
// culture" and the admins change them all. Filled with who created it.
// --owner=<email>: the existing outings given to that person instead
//   node scripts/migrate-activity-owner.js          -> dry run
//   node scripts/migrate-activity-owner.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const ownerEmail = (process.argv.find((a) => a.startsWith('--owner=')) || '').slice(8).toLowerCase();
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[col]] = await q(`select count(*)::int as n from information_schema.columns where table_name = 'activities' and column_name = 'owner_id'`);
console.log(`activities.owner_id present: ${col.n ? 'yes' : 'no'}`);
const [rows] = await q(
  `select a.id, a.title, a.created_by, u.first_name, u.last_name, u.role from activities a left join users u on u.id = a.created_by order by a.id`
);
let owner = null;
if (ownerEmail) {
  [[owner]] = await q(`select id, first_name, last_name, role from users where lower(email) = '${ownerEmail.replace(/'/g, '')}'`);
  if (!owner) throw new Error(`Aucun compte ${ownerEmail}`);
  console.log(`responsable de toutes les sorties existantes : ${owner.first_name} ${owner.last_name} (#${owner.id}, ${owner.role})`);
}
if (!owner) for (const r of rows) console.log(`  #${r.id} ${r.title} -> responsable : ${r.first_name || '?'} ${r.last_name || ''} (${r.role || 'inconnu'})`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q('ALTER TABLE activities ADD COLUMN IF NOT EXISTS owner_id INTEGER', transaction);
    await q(`UPDATE activities SET owner_id = ${owner ? Number(owner.id) : 'created_by'} WHERE owner_id IS NULL`, transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261116100000-activity-owner.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
