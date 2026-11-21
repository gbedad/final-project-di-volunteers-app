// Export of paid tutoring to the accounting software's import file.
//   node scripts/export-compta-payant.js --from 2026-09-01 --to 2026-12-31
//       -> dry run: counts and the third parties still to create (reads only)
//   … --out /chemin/export.xlsx
//       -> writes the file (sheets "Données" and "Tiers" to create)
import db from '../config/database.js';
import { loadExport, EXPORT_COLUMNS } from '../services/accountingExport.js';
import { writeXlsx } from '../services/xlsxWriter.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const from = arg('from');
const to = arg('to');
const out = arg('out');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
if (!from || !to || !DAY.test(from) || !DAY.test(to)) {
  console.log('Usage: --from AAAA-MM-JJ --to AAAA-MM-JJ [--out fichier.xlsx]');
  await db.close();
  process.exit(1);
}

try {
  const { rows, toCreate } = await loadExport({ from, to });
  const pieces = new Set(rows.map((r) => r['Numéro de pièce'])).size;
  console.log(`Période ${from} → ${to} : ${rows.length} lignes, ${pieces} pièces équilibrées.`);
  if (toCreate.length) {
    console.log('Tiers à créer dans le logiciel de compta avant import :');
    for (const t of toCreate) console.log(`  - ${t.type} ${t.name}`);
  } else {
    console.log('Tous les tiers ont leur identifiant.');
  }
  if (out) {
    const tiersRows = toCreate.map((t) => ['', t.type, t.name]);
    writeXlsx(out, [
      { name: 'Données', headers: EXPORT_COLUMNS, rows: rows.map((r) => EXPORT_COLUMNS.map((c) => r[c] ?? '')) },
      { name: 'Tiers', headers: ['ID', 'Type', 'Nom du tiers'], rows: tiersRows },
    ]);
    console.log(`Fichier écrit : ${out}`);
  } else {
    console.log('Simulation : aucun fichier écrit. Ajoutez --out pour l’écrire.');
  }
} catch (err) {
  console.log(`Erreur : ${err.message}`);
  process.exitCode = 1;
}
await db.close();
