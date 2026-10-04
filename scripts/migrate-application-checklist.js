// One-off migration for the automatic application checklist:
//  1. adds files.doc_type and guesses the type of existing files from their name
//  2. recomputes the status of applications still in progress
//   node scripts/migrate-application-checklist.js          -> dry run, changes nothing
//   node scripts/migrate-application-checklist.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = async (sql, replacements) =>
  (await db.query(sql, { replacements, logging: false }))[0];

const guessType = ({ path, filename }) => {
  const name = `${filename} ${path.split('/').pop()}`.toLowerCase();
  if (/(^|\/)conventions\//.test(path) || name.includes('convention')) {
    return 'convention';
  }
  if (/b3|casier|judiciaire/.test(name)) return 'b3';
  if (/(^|[_ .-])cv([_ .-]|$)|curriculum/.test(name)) return 'cv';
  if (/(^|[_ .-])id([_ .\d-]|$)|identit|passeport|passport|cni/.test(name)) {
    return 'id';
  }
  return 'other';
};

const EARLY = ['Compte créé', 'A renseigner', 'Renseigné', 'A télécharger'];
const RANK = {
  'Compte créé': 0,
  Renseigné: 0,
  'A renseigner': 1,
  'A télécharger': 2,
  'A interviewer': 3,
};
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const available = (path) => !path.includes('amazonaws.com');

// 1. Document types
const [{ exists }] = await q(
  `select exists (select 1 from information_schema.columns
   where table_name = 'files' and column_name = 'doc_type') as exists`
);
const files = await q(
  `select id, "userId", filename, path${exists ? ', doc_type' : ''} from files`
);
const typed = files
  .filter((f) => !f.doc_type)
  .map((f) => ({ ...f, doc_type: guessType(f) }));
const count = typed.reduce(
  (acc, f) => ({ ...acc, [f.doc_type]: (acc[f.doc_type] || 0) + 1 }),
  {}
);
console.log(`Document types to set on ${typed.length} file(s):`, count);

// 2. Statuses, using the guessed types
const allTypes = [...files.filter((f) => f.doc_type), ...typed];
const users = await q(
  `select u.id, u.first_name, u.last_name, u.status, u.city, u.zipcode, u.activity,
          s.topics, s.when_day_slot, s.where_location, s.how_location
   from users u left join skills s on s."userId" = u.id
   where u.role = 'volunteer' and u.status in (:early)`,
  { early: EARLY }
);
const changes = users
  .map((u) => {
    const has = (type) =>
      allTypes.some(
        (f) => f.userId === u.id && f.doc_type === type && available(f.path)
      );
    const profile = !!(u.city && u.activity);
    const wishes =
      hasItems(u.topics) &&
      hasItems(u.when_day_slot) &&
      (hasItems(u.where_location) || u.how_location === 'A distance');
    const next =
      profile && wishes && has('cv') && has('id')
        ? 'A interviewer'
        : profile && wishes
        ? 'A télécharger'
        : 'A renseigner';
    return { ...u, next };
  })
  // Only move applications forward
  .filter((u) => RANK[u.next] > RANK[u.status]);

console.log(`\nStatus changes (${changes.length}):`);
changes.forEach((u) =>
  console.log(`  #${u.id} ${u.first_name} ${u.last_name}: ${u.status} -> ${u.next}`)
);

if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { replacements, transaction, logging: false });
    await run('ALTER TABLE files ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20)');
    for (const f of typed) {
      await run('update files set doc_type = :type where id = :id', {
        type: f.doc_type,
        id: f.id,
      });
    }
    for (const u of changes) {
      await run('update users set status = :status where id = :id', {
        status: u.next,
        id: u.id,
      });
    }
    await run(
      `insert into "SequelizeMeta"(name) values ('20261003120000-add-doc-type-to-files.cjs')
       on conflict do nothing`
    );
  });
  console.log('\nApplied.');
} else {
  console.log('\nDry run only. Add --apply to write these changes.');
}
await db.close();
