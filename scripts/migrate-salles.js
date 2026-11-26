// One-off migration: rooms of the three sites (salles) and the room of each
// session (session_rooms). The room changes from one week to the next, so it
// is kept per session: pair, date and start time.
//   node scripts/migrate-salles.js          -> dry run
//   node scripts/migrate-salles.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = (sql, transaction) => db.query(sql, { transaction, logging: false });

const ROOMS = [
  ['MdA', 'Bureau 1'],
  ['MdA', 'Bureau 2'],
  ['MdA', 'Bureau 3'],
  ['MdA', 'Bureau 4'],
  ['MdA', 'Salle Haute'],
  ['MdA', 'Salle Basse'],
  ['MdA', 'Espace Coworking'],
  ['Gerty', 'Salle de Musique (1er)'],
  ['Gerty', 'Open Space Enseignants (1er)'],
  ['Gerty', "Salle d'Activités (rdc)"],
  ['Bibliothèque', 'Hélène Berr'],
];

const [found] = await q(
  `select table_name from information_schema.tables where table_name in ('salles', 'session_rooms')`
);
const has = (t) => found.some((r) => r.table_name === t);
console.log(`salles: ${has('salles') ? 'present' : 'to create'}`);
console.log(`session_rooms: ${has('session_rooms') ? 'present' : 'to create'}`);
console.log(`rooms to seed: ${ROOMS.length}`);

if (apply) {
  await db.transaction(async (transaction) => {
    await q(
      `CREATE TABLE IF NOT EXISTS salles (
         id SERIAL PRIMARY KEY,
         site TEXT NOT NULL,
         name TEXT NOT NULL,
         active BOOLEAN NOT NULL DEFAULT true,
         UNIQUE (site, name)
       )`,
      transaction
    );
    await q(
      `CREATE TABLE IF NOT EXISTS session_rooms (
         id SERIAL PRIMARY KEY,
         binome_id INTEGER NOT NULL REFERENCES binomes(id) ON DELETE CASCADE,
         date DATE NOT NULL,
         start_time TEXT NOT NULL,
         salle_id INTEGER NOT NULL REFERENCES salles(id) ON DELETE RESTRICT,
         updated_by INTEGER,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         UNIQUE (binome_id, date, start_time)
       )`,
      transaction
    );
    await q(`CREATE INDEX IF NOT EXISTS session_rooms_date_idx ON session_rooms (date)`, transaction);
    for (const [site, name] of ROOMS) {
      await db.query(
        `INSERT INTO salles (site, name) VALUES (:site, :name) ON CONFLICT (site, name) DO NOTHING`,
        { replacements: { site, name }, transaction, logging: false }
      );
    }
  });
  console.log('Applied.');
} else {
  console.log('Dry run: nothing written. Use --apply to write.');
}

process.exit(0);
