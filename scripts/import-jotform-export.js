// Import of a Jotform export (attendance form) already read into JSON rows
// { jot_id, date, time, tutor, first, last, signature } — sessions since
// 2026-09-01 only. Names matched by the team are remembered first.
//   node scripts/import-jotform-export.js rows.json          -> dry run
//   node scripts/import-jotform-export.js rows.json --apply  -> writes
import fs from 'fs';
import db from '../config/database.js';
import '../models/users.model.js';
import { addAlias, importJotformRows, studentKey, tutorKey } from '../services/jotform.js';

const apply = process.argv.includes('--apply');
const file = process.argv[2];
const SINCE = '2026-09-01';

// Matched by the team (2026-11-07)
const ALIASES = [
  { first: 'Dalia', last: 'Y.', tutor: 'Sylviane Ly', binome: 27 },
  { first: 'Dalia', last: 'Y', tutor: 'Sylviane Ly', binome: 27 },
  { first: 'Soon angel', last: 'Metiemdjo babou', tutor: 'Catherine Millien', binome: 18 },
  { first: 'Nora', last: 'Meite', tutor: 'Pascale Caine', binome: 31 },
];

const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  .filter((r) => r.date >= SINCE)
  .map((r) => ({
    // Answers without a signature have no Jotform id in the export
    jot_id: r.jot_id || `sans-signature:${r.date}:${r.first}:${r.last}:${r.time}`,
    date: r.date,
    arrival: r.time,
    tutor: r.tutor,
    first: r.first,
    last: r.last,
    signature_url: r.signature_url || null,
  }));

const aliases = ALIASES.map((a) => ({
  student_key: studentKey(a.first, a.last),
  tutor_key: tutorKey(a.tutor),
  binome_id: a.binome,
}));
if (apply) for (const a of ALIASES) await addAlias(a, a.binome, 1);
const report = await importJotformRows(rows, { apply, aliases });

console.log(`${rows.length} lignes depuis le ${SINCE}`);
for (const k of ['créée', 'complétée', 'doublon']) {
  console.log(`Séances ${k}s : ${report[k].length}`);
  if (k !== 'créée') report[k].forEach((l) => console.log('  ' + l));
}
console.log(`Déjà importées : ${report.déjà}`);
console.log(`À rattacher par l'équipe : ${report.en_attente.length}`);
report.en_attente.forEach((l) => console.log('  ' + l));
console.log(apply ? 'Appliqué.' : 'Simulation : ajoutez --apply pour écrire.');
await db.close();
