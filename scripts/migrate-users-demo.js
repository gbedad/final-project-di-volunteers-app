// One-off migration: users.is_demo, to label the fake volunteers used for
// trials (shown "Démo" in the tutors list, like the demo students)
//   node scripts/migrate-users-demo.js          -> dry run
//   node scripts/migrate-users-demo.js --apply  -> writes the changes
// Volunteers to label are given by id: --ids=147,148
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const ids = (process.argv.find((a) => a.startsWith('--ids=')) || '--ids=')
  .slice(6)
  .split(',')
  .map(Number)
  .filter(Boolean);
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'is_demo') as has`,
  { logging: false }
);
console.log(has ? 'Column users.is_demo already exists.' : 'Column users.is_demo to add (false for everyone).');
if (ids.length) {
  const [rows] = await db.query(
    `select id, first_name, last_name, email, status from users where id in (:ids)`,
    { replacements: { ids }, logging: false }
  );
  console.log('Volunteers to label "Démo":');
  rows.forEach((r) => console.log(`  #${r.id} ${r.first_name} ${r.last_name} <${r.email}> (${r.status})`));
}
if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { transaction, logging: false, replacements });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false');
    if (ids.length) await run('UPDATE users SET is_demo = true WHERE id IN (:ids)', { ids });
    await run(`insert into "SequelizeMeta"(name)
      values ('20261009180000-users-demo.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
