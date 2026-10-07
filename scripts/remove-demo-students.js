// Removes every demo student (is_demo = true) and what belongs to them
//   node scripts/remove-demo-students.js          -> dry run
//   node scripts/remove-demo-students.js --apply  -> deletes them
import db from '../config/database.js';
import Students from '../models/students/students.model.js';

const apply = process.argv.includes('--apply');
const demo = await Students.findAll({
  where: { is_demo: true },
  attributes: ['id', 'first_name', 'last_name'],
});
console.log(`${demo.length} demo student(s) to remove.`);
if (apply && demo.length) {
  await Students.destroy({ where: { is_demo: true } });
  console.log('Removed.');
} else if (!apply) {
  console.log('Dry run only. Add --apply to remove them.');
}
await db.close();
