// One-off migration for cohorts:
//  - adds users.validated_at, empty default for users.cohorte_year
//  - replaces the meaningless default "2023/2024" of every volunteer:
//      Validé + active  -> 2024/2025, 2025/2026, 2026/2027 (up to the current year)
//      Validé, inactive -> 2024/2025
//      not validated    -> no cohort
//   node scripts/migrate-cohorts.js          -> dry run, changes nothing
//   node scripts/migrate-cohorts.js --apply  -> writes the changes
import db from '../config/database.js';
import { academicYear } from '../services/cohorts.js';

const apply = process.argv.includes('--apply');
const q = async (sql, replacements) =>
  (await db.query(sql, { replacements, logging: false }))[0];

const current = Number(academicYear().slice(0, 4));
const since2024 = [];
for (let y = 2024; y <= current; y++) since2024.push(`${y}/${y + 1}`);

const users = await q(
  `select id, status, is_active, cohorte_year from users where role = 'volunteer'`
);
const target = (u) =>
  u.status !== 'Validé' ? [] : u.is_active ? since2024 : ['2024/2025'];
const changes = users
  .map((u) => ({ ...u, next: target(u) }))
  .filter((u) => JSON.stringify(u.cohorte_year || []) !== JSON.stringify(u.next));

const summary = changes.reduce((acc, u) => {
  const key = u.next.length ? u.next.join(', ') : '(aucune)';
  return { ...acc, [key]: (acc[key] || 0) + 1 };
}, {});
console.log(`${changes.length} volunteer(s) to update:`, summary);

if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { replacements, transaction, logging: false });
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ');
    await run(`ALTER TABLE users ALTER COLUMN cohorte_year SET DEFAULT '{}'`);
    for (const u of changes) {
      await run(
        `update users set cohorte_year =
           coalesce(string_to_array(nullif(:years, ''), ','), '{}')::varchar[]
         where id = :id`,
        { years: u.next.join(','), id: u.id }
      );
    }
    await run(
      `insert into "SequelizeMeta"(name) values ('20261005120000-cohorts-validated-at.cjs')
       on conflict do nothing`
    );
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
