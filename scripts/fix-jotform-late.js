// Jotform sessions imported on 2026-11-07 marked "très en retard" on a day
// without a slot of the pair (session moved): not late. Dry run by default.
//   node scripts/fix-jotform-late.js [--apply]
import db from '../config/database.js';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const apply = process.argv.includes('--apply');
const [rows] = await db.query(
  `select s.id, s.date::text as d, b.schedule, st.first_name
     from seances s join binomes b on b.id = s.binome_id join students st on st.id = b.student_id
    where s.source = 'jotform' and s.late`,
  { logging: false }
);
const wrong = rows.filter(
  (x) => !(x.schedule || []).some((sl) => sl.day === DAYS[new Date(`${x.d}T12:00:00Z`).getUTCDay()])
);
wrong.forEach((x) => console.log(`#${x.id} ${x.d} ${x.first_name} (${DAYS[new Date(`${x.d}T12:00:00Z`).getUTCDay()]})`));
if (apply && wrong.length) {
  await db.query(`update seances set late = false where source = 'jotform' and id in (:ids)`, {
    replacements: { ids: wrong.map((x) => x.id) },
    logging: false,
  });
}
console.log(`${wrong.length} séance(s) ${apply ? 'corrigée(s)' : 'à corriger (simulation)'}`);
await db.close();
