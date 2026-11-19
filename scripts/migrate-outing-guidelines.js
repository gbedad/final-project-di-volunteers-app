// One-off migration: the "Consignes" text of the cultural outings (one text
// for all the outings, written in the WhatsApp format and copied into the
// messages to the families)
//  - outing_guidelines: a single row (id = 1): the text, who changed it last
//    and when
//   node scripts/migrate-outing-guidelines.js          -> dry run
//   node scripts/migrate-outing-guidelines.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [[t]] = await q(`select count(*)::int n from information_schema.tables where table_name = 'outing_guidelines'`);
console.log(`Table outing_guidelines: ${t.n ? 'present' : 'to create'} (one empty row, the text is written from the page)`);
if (apply) {
  await db.transaction(async (tr) => {
    await q(
      `CREATE TABLE IF NOT EXISTS outing_guidelines (
         id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
         body TEXT NOT NULL DEFAULT '',
         updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
         updated_at TIMESTAMPTZ
       )`,
      tr
    );
    await q(`insert into outing_guidelines (id, body) values (1, '') on conflict do nothing`, tr);
    await q(`insert into "SequelizeMeta"(name) values ('20261120090000-outing-guidelines.cjs') on conflict do nothing`, tr);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
