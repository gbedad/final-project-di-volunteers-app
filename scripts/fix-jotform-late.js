// Jotform sessions marked "très en retard" by the import of 2026-11-07: the
// time on Jotform is when the form was filled in (often at the end of the
// session), not the student's arrival, so it says nothing about lateness.
// Dry run by default.   node scripts/fix-jotform-late.js [--apply]
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const [rows] = await db.query(
  `select s.id, s.date::text as d, st.first_name
     from seances s join binomes b on b.id = s.binome_id join students st on st.id = b.student_id
    where s.source = 'jotform' and s.late order by s.date`,
  { logging: false }
);
rows.forEach((x) => console.log(`#${x.id} ${x.d} ${x.first_name}`));
if (apply && rows.length) {
  await db.query(`update seances set late = false where source = 'jotform' and id in (:ids)`, {
    replacements: { ids: rows.map((x) => x.id) },
    logging: false,
  });
}
console.log(`${rows.length} séance(s) ${apply ? 'corrigée(s)' : 'à corriger (simulation)'}`);
await db.close();
