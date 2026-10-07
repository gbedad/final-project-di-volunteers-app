// One-off migration: creates the binomes table (tutor / student pairs)
//   node scripts/migrate-binomes.js          -> dry run
//   node scripts/migrate-binomes.js --apply  -> creates the table
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [[{ exists }]] = await db.query(
  `select to_regclass('public.binomes') is not null as exists`,
  { logging: false }
);
console.log(exists ? 'Table binomes already exists.' : 'Table binomes to create (empty).');
if (apply && !exists) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS binomes (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      tutor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subjects VARCHAR(255)[] DEFAULT '{}',
      schedule JSONB DEFAULT '[]',
      how_location VARCHAR(255),
      site VARCHAR(255),
      start_date DATE,
      status VARCHAR(255) NOT NULL DEFAULT 'proposé',
      note TEXT,
      proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      proposed_at TIMESTAMPTZ DEFAULT now(),
      responded_at TIMESTAMPTZ,
      decline_reason TEXT,
      ended_at TIMESTAMPTZ,
      end_reason TEXT
    )`);
    await run('CREATE INDEX IF NOT EXISTS binomes_student_id ON binomes (student_id)');
    await run('CREATE INDEX IF NOT EXISTS binomes_tutor_id ON binomes (tutor_id)');
    await run(`insert into "SequelizeMeta"(name)
      values ('20261007140000-binomes.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to create the table.');
}
await db.close();
