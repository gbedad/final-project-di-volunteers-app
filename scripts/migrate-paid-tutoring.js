// One-off migration: tables of paid tutoring (payeurs, factures, paiements,
// remunerations_tuteurs). See migrations/20261121140000-paid-tutoring-tables.cjs
//   node scripts/migrate-paid-tutoring.js          -> dry run (reads only)
//   node scripts/migrate-paid-tutoring.js --apply  -> creates the tables
import db from '../config/database.js';

const TABLES = ['payeurs', 'factures', 'paiements', 'remunerations_tuteurs'];
const apply = process.argv.includes('--apply');

const [rows] = await db.query(
  `select table_name from information_schema.tables
     where table_schema = 'public' and table_name in (:tables)`,
  { replacements: { tables: TABLES }, logging: false }
);
const existing = new Set(rows.map((r) => r.table_name));
const todo = TABLES.filter((t) => !existing.has(t));
console.log(todo.length ? `Tables to create: ${todo.join(', ')}` : 'Tables already exist.');

if (apply && todo.length) {
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { transaction, logging: false });
    await run(`CREATE TABLE payeurs (
      id SERIAL PRIMARY KEY,
      type VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      address TEXT,
      accounting_tiers_id VARCHAR(255),
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`CREATE TABLE factures (
      id SERIAL PRIMARY KEY,
      numero VARCHAR(255) NOT NULL UNIQUE,
      payeur_id INTEGER NOT NULL REFERENCES payeurs(id),
      binome_id INTEGER REFERENCES binomes(id) ON DELETE SET NULL,
      issued_on DATE NOT NULL,
      label VARCHAR(255) NOT NULL,
      amount_cents INTEGER NOT NULL,
      status VARCHAR(255) NOT NULL DEFAULT 'emise',
      cancels_facture_id INTEGER REFERENCES factures(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`CREATE TABLE paiements (
      id SERIAL PRIMARY KEY,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
      paid_on DATE NOT NULL,
      amount_cents INTEGER NOT NULL,
      method VARCHAR(255),
      reference VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`CREATE TABLE remunerations_tuteurs (
      id SERIAL PRIMARY KEY,
      tuteur_id INTEGER NOT NULL REFERENCES users(id),
      period VARCHAR(255) NOT NULL,
      amount_cents INTEGER NOT NULL,
      tutor_invoice_ref VARCHAR(255),
      status VARCHAR(255) NOT NULL DEFAULT 'a_payer',
      paid_on DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`insert into "SequelizeMeta"(name)
      values ('20261121140000-paid-tutoring-tables.cjs') on conflict do nothing`);
  });
  console.log('Applied.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to create the tables.');
}
await db.close();
