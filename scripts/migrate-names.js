// One-off migration: first and last names of volunteers, team members and
// students written the same way (services/names.js)
//   node scripts/migrate-names.js          -> dry run, lists the changes
//   node scripts/migrate-names.js --apply  -> writes them
import db from '../config/database.js';
import { formatName } from '../services/names.js';

const apply = process.argv.includes('--apply');
const changes = [];
for (const table of ['users', 'students']) {
  const [rows] = await db.query(
    `select id, first_name, last_name from ${table} order by id`,
    { logging: false }
  );
  for (const row of rows) {
    const next = {
      first_name: formatName(row.first_name),
      last_name: formatName(row.last_name),
    };
    if (next.first_name !== row.first_name || next.last_name !== row.last_name) {
      changes.push({ table, id: row.id, before: row, next });
    }
  }
}
console.log(`${changes.length} name(s) to change:`);
for (const c of changes) {
  const show = (r) => JSON.stringify(`${r.first_name} | ${r.last_name}`);
  console.log(`  ${c.table} #${c.id}: ${show(c.before)} -> ${show(c.next)}`);
}
if (apply && changes.length) {
  await db.transaction(async (transaction) => {
    for (const c of changes) {
      await db.query(
        `update ${c.table} set first_name = :first_name, last_name = :last_name where id = :id`,
        { replacements: { ...c.next, id: c.id }, transaction, logging: false }
      );
    }
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
