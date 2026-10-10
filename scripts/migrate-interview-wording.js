// One-off migration (RGPD):
//  - users.data_purged_at: date the interview notes were erased (2 years
//    after a declined application or the archiving)
//  - neutral wording of the interview assessments (services/interviewWording)
//   node scripts/migrate-interview-wording.js          -> dry run
//   node scripts/migrate-interview-wording.js --apply  -> writes the changes
import db from '../config/database.js';
import { modernizeInterview } from '../services/interviewWording.js';

const apply = process.argv.includes('--apply');
const [[{ has }]] = await db.query(
  `select exists (select 1 from information_schema.columns
     where table_name = 'users' and column_name = 'data_purged_at') as has`,
  { logging: false }
);
console.log(has ? 'Column users.data_purged_at already exists.' : 'Column users.data_purged_at to add (empty).');

// interviews: array of JSON strings (sometimes encoded twice)
const decode = (s) => {
  let v = s;
  let depth = 0;
  while (typeof v === 'string' && depth < 3) {
    try {
      v = JSON.parse(v);
      depth += 1;
    } catch {
      break;
    }
  }
  return { value: v, depth };
};
const encode = (v, depth) => {
  let out = v;
  for (let i = 0; i < depth; i += 1) out = JSON.stringify(out);
  return out;
};

const [rows] = await db.query(
  `select id, first_name, last_name, interviews from users
    where interviews is not null and array_length(interviews, 1) > 0`,
  { logging: false }
);
const updates = [];
for (const r of rows) {
  let changed = false;
  const next = r.interviews.map((s) => {
    const { value, depth } = decode(s);
    const modern = modernizeInterview(value);
    if (JSON.stringify(modern) !== JSON.stringify(value)) {
      changed = true;
      console.log(
        `  #${r.id} ${r.first_name} ${r.last_name}: recommandation « ${value.recommendation} » → « ${modern.recommendation} », suivi « ${value.followup} » → « ${modern.followup} », français « ${value.test} » → « ${modern.test} »`
      );
      return encode(modern, depth);
    }
    return s;
  });
  if (changed) updates.push({ id: r.id, interviews: next });
}
console.log(`${updates.length} volunteer(s) with interview values to reword.`);

if (apply) {
  await db.transaction(async (transaction) => {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS data_purged_at TIMESTAMPTZ', {
      transaction,
      logging: false,
    });
    for (const u of updates) {
      // Each element stays a JSON string (as written by add-interviews)
      await db.query(
        `UPDATE users SET interviews = (
           select array_agg(to_jsonb(x) order by n)
             from unnest(ARRAY[:iv]::text[]) with ordinality as t(x, n))
         WHERE id = :id`,
        {
        replacements: { iv: u.interviews, id: u.id },
        transaction,
        logging: false,
      });
    }
    await db.query(
      `insert into "SequelizeMeta"(name) values ('20261010100000-interview-wording.cjs') on conflict do nothing`,
      { transaction, logging: false }
    );
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
