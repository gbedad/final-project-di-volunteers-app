// "Tuteur actif" becomes computed: active while the tutor has a pair in
// progress (active or paused). Puts every tutor in line once. Dry run by
// default.   node scripts/sync-tutor-active.js [--apply]
import db from '../config/database.js';
import '../models/users.model.js';
import { syncTutorActive } from '../services/tutorActivity.js';

const apply = process.argv.includes('--apply');
const [rows] = await db.query(
  `select u.id, u.first_name || ' ' || u.last_name as name, u.is_active, u.status, u.is_demo,
          count(b.id) filter (where b.status in ('actif', 'en pause'))::int as open
     from users u left join binomes b on b.tutor_id = u.id
    where u.role = 'volunteer'
    group by u.id order by u.last_name`,
  { logging: false }
);
const wrong = rows.filter((r) => !!r.is_active !== r.open > 0);
for (const r of wrong) {
  console.log(`#${r.id} ${r.name}${r.is_demo ? ' [démo]' : ''} (${r.status}) : ${r.is_active ? 'actif' : 'inactif'} -> ${r.open > 0 ? 'actif' : 'inactif'} (${r.open} binôme(s) en cours)`);
  if (apply) await syncTutorActive(r.id);
}
console.log(`${wrong.length} tuteur(s) ${apply ? 'mis à jour' : 'à mettre à jour (simulation)'}`);
await db.close();
