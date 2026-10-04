// One-off migration: adds users.paper_documents (documents received on
// paper, ticked by an admin) and fills it so that no "reçu" box changes:
// a box already ticked without a matching uploaded file becomes "paper".
//   node scripts/migrate-paper-documents.js          -> dry run, changes nothing
//   node scripts/migrate-paper-documents.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = async (sql, replacements) =>
  (await db.query(sql, { replacements, logging: false }))[0];

const FLAGS = {
  cv: 'cv_received',
  id: 'id_received',
  b3: 'b3_received',
  convention: 'convention_received',
};

const users = await q(
  `select id, ${Object.values(FLAGS).join(', ')} from users
   where ${Object.values(FLAGS).map((f) => `${f} = true`).join(' or ')}`
);
const files = await q(
  `select "userId", doc_type from files where path not like '%amazonaws.com%'`
);

const updates = users
  .map((u) => ({
    id: u.id,
    paper: Object.entries(FLAGS)
      .filter(([type, flag]) => u[flag])
      .filter(
        ([type]) =>
          !files.some((f) => f.userId === u.id && f.doc_type === type)
      )
      .map(([type]) => type),
  }))
  .filter((u) => u.paper.length > 0);

const count = updates
  .flatMap((u) => u.paper)
  .reduce((acc, type) => ({ ...acc, [type]: (acc[type] || 0) + 1 }), {});
console.log(
  `${users.length} user(s) with at least one box ticked; ${updates.length} will keep them as "received on paper":`,
  count
);

if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { replacements, transaction, logging: false });
    await run(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_documents JSONB DEFAULT '[]'::jsonb`
    );
    for (const u of updates) {
      await run('update users set paper_documents = :paper where id = :id', {
        paper: JSON.stringify(u.paper),
        id: u.id,
      });
    }
    await run(
      `insert into "SequelizeMeta"(name) values ('20261004120000-add-paper-documents-to-users.cjs')
       on conflict do nothing`
    );
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
