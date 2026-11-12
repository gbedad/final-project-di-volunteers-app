// One-off migration: what the families pay (simple bookkeeping)
//  - payments: one collection (total, means, date, reference). An AssoConnect
//    link often covers the membership and the participation together.
//  - payment_lines: what it pays for: membership, participation of a term,
//    5-hour package (hourly rate), deposit (with its fate: received, given
//    back, kept), outing
//  - student_memberships.payment_id: a membership paid within a collection
//   node scripts/migrate-payments.js          -> dry run
//   node scripts/migrate-payments.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });
const [tables] = await q(`select table_name from information_schema.tables where table_name in ('payments', 'payment_lines')`);
console.log(`tables present: ${tables.map((t) => t.table_name).join(', ') || 'none'} (2 expected)`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `CREATE TABLE IF NOT EXISTS payments (
         id SERIAL PRIMARY KEY,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         paid_at DATE NOT NULL,
         amount NUMERIC(10,2) NOT NULL,
         method TEXT NOT NULL,
         reference TEXT,
         note TEXT,
         recorded_by INTEGER,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS payment_lines (
         id SERIAL PRIMARY KEY,
         payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
         student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
         -- cotisation, participation, forfait, caution
         nature TEXT NOT NULL,
         school_year TEXT NOT NULL,
         -- participation: "2026-T1"
         term TEXT,
         -- forfait: hours bought
         hours NUMERIC(6,2),
         amount NUMERIC(10,2) NOT NULL,
         -- caution: reçue, rendue, encaissée
         deposit_status TEXT,
         deposit_status_at DATE
       )`,
      transaction
    );
    await q('CREATE INDEX IF NOT EXISTS payment_lines_student ON payment_lines (student_id, school_year)', transaction);
    await q('CREATE INDEX IF NOT EXISTS payments_paid_at ON payments (paid_at)', transaction);
    await q('ALTER TABLE student_memberships ADD COLUMN IF NOT EXISTS payment_id INTEGER', transaction);
    await q(`insert into "SequelizeMeta"(name) values ('20261112220000-payments.cjs') on conflict do nothing`, transaction);
  });
  console.log('Applied.');
} else console.log('Dry run only. Add --apply to write these changes.');
await db.close();
