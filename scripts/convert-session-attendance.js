// One-off: the attendance of the preparation and post-activité sessions
// (activity_session_participants) moves to the new émargement list:
//   présent -> à l'heure, absent -> non excusé(e), excusé -> excusé(e)
//   node scripts/convert-session-attendance.js          -> dry run
//   node scripts/convert-session-attendance.js --apply  -> writes the changes
import db from '../config/database.js';

const MAP = [
  ['présent', "à l'heure"],
  ['absent', 'non excusé(e)'],
  ['excusé', 'excusé(e)'],
];
const apply = process.argv.includes('--apply');
const q = (sql, replacements = {}) => db.query(sql, { replacements, logging: false }).then(([rows]) => rows);

for (const [from, to] of MAP) {
  const [{ n }] = await q(
    'select count(*)::int as n from activity_session_participants where attendance = :from',
    { from }
  );
  console.log(`${from} -> ${to} : ${n}`);
  if (apply && n) {
    await q('update activity_session_participants set attendance = :to where attendance = :from', { from, to });
  }
}
console.log(apply ? 'Modifications écrites.' : 'Dry run : rien n’a été écrit (ajouter --apply pour écrire).');
process.exit(0);
