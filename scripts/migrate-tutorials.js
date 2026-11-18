// One-off migration: video tutorials (see services/tutorials.js)
//  - tutorial_videos: the video sent for each tutorial of the catalogue (one
//    row per slug; the video itself is in the private storage)
//   node scripts/migrate-tutorials.js          -> dry run
//   node scripts/migrate-tutorials.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[t]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'tutorial_videos'`);
console.log(`Table tutorial_videos: ${t.n ? 'present' : 'to create'} (no data to move: the videos are sent from the admin screen)`);
if (apply) {
  await db.transaction(async (tr) => {
    await q(
      `CREATE TABLE IF NOT EXISTS tutorial_videos (
         slug TEXT PRIMARY KEY,
         video_key TEXT NOT NULL,
         filename TEXT,
         size BIGINT,
         content_type TEXT,
         uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      tr
    );
    await q(`insert into "SequelizeMeta"(name) values ('20261119090000-tutorials.cjs') on conflict do nothing`, tr);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
