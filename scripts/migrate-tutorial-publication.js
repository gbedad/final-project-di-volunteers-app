// One-off migration: the team publishes a tutorial to the tutors (switch in
// Documents). A video sent but not published is kept, not shown to tutors.
//  - tutorial_videos.published: false by default; the video already shown to
//    the tutors (slug 'emargement') stays published
//   node scripts/migrate-tutorial-publication.js          -> dry run
//   node scripts/migrate-tutorial-publication.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = async (sql, transaction) => (await db.query(sql, { transaction, logging: false }))[0];

const cols = await q(
  `select column_name from information_schema.columns where table_name = 'tutorial_videos' and column_name = 'published'`
);
const exists = cols.length > 0;
const shown = await q(`select slug from tutorial_videos where slug = 'emargement'`);
console.log(`tutorial_videos.published: ${exists ? 'present' : 'to add'}`);
console.log(`émargement publié aux tuteurs : ${shown.length ? 'à publier (vidéo présente)' : 'pas de vidéo'}`);

if (apply) {
  await db.transaction(async (transaction) => {
    if (!exists) {
      await q(`alter table tutorial_videos add column published boolean not null default false`, transaction);
    }
    await q(`update tutorial_videos set published = true where slug = 'emargement'`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
