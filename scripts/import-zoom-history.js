// Remote sessions held on Zoom since 2026-09-01 (or --from=YYYY-MM-DD),
// read from the Zoom API. Dry run by default.
//   node scripts/import-zoom-history.js [--from=2026-09-01] [--apply]
import db from '../config/database.js';
import '../models/users.model.js';
import { syncZoom, ZOOM_SINCE } from '../services/zoom.js';

const apply = process.argv.includes('--apply');
const from = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7) || ZOOM_SINCE;
const report = await syncZoom({ from, apply });
for (const k of ['créée', 'complétée', 'mise à jour', 'absence', 'ignorée', 'doublon']) {
  console.log(`Séances ${k}s : ${report[k].length}`);
  report[k].forEach((l) => console.log('  ' + l));
}
console.log(`À rattacher par l'équipe : ${report.en_attente.length}`);
report.en_attente.forEach((l) => console.log('  ' + l));
console.log(apply ? 'Appliqué.' : 'Simulation : ajoutez --apply pour écrire.');
await db.close();
