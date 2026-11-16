// One-off migration: the "Chat" tab of an outing
//  - activities.chat: messages of the people in charge of the outings,
//    oldest first ({ at, user_id, by: first name, text })
//   node scripts/migrate-activity-chat.js          -> dry run
//   node scripts/migrate-activity-chat.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[col]] = await q(
  `select count(*)::int n from information_schema.columns where table_name = 'activities' and column_name = 'chat'`
);
console.log(`activities.chat: ${col.n ? 'present' : 'to create'}`);
if (apply) {
  await db.transaction(async (t) => {
    await q(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS chat JSONB NOT NULL DEFAULT '[]'::jsonb`, t);
    await q(`insert into "SequelizeMeta"(name) values ('20261116180000-activity-chat.cjs') on conflict do nothing`, t);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
