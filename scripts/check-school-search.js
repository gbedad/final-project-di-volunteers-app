// Checks the school search as it is typed: each text is sent letter by
// letter (from the 3rd one, as the field does) and every answer that is not
// a success (500, 502, 503…) is listed. Read only: nothing is written.
//   node scripts/check-school-search.js                       -> local API (port 3030)
//   node scripts/check-school-search.js https://mycogniverse-api.onrender.com
//   node scripts/check-school-search.js <url> "lycée saint" "jean jaurès"
// Signed as the superadmin (#1) with the secret of server/.env.
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const args = process.argv.slice(2);
const base = (args[0]?.startsWith('http') ? args.shift() : 'http://localhost:3030').replace(/\/$/, '');
const TEXTS = args.length
  ? args
  : [
      'saint',
      'sainte',
      'saint-denis',
      "saint l'",
      'lycée saint louis',
      'lycee',
      'collège jean jaurès',
      'ste marie',
      'paris 18',
      'école',
      'henri iv',
      'l"école',
      'lycée 100%',
    ];
const token = jwt.sign({ userid: 1 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });

const failures = [];
let calls = 0;
for (const text of TEXTS) {
  for (let n = 3; n <= text.length; n += 1) {
    const q = text.slice(0, n);
    if (!q.trim() || q.trim().length < 3) continue;
    calls += 1;
    const started = Date.now();
    let status;
    let body = '';
    try {
      const res = await fetch(`${base}/admin/schools?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      status = `réseau (${err.cause?.code || err.message})`;
    }
    const ms = Date.now() - started;
    const ok = status === 200;
    let found = '';
    if (ok) {
      try {
        found = `${JSON.parse(body).length} résultat(s)`;
      } catch {
        found = 'réponse illisible';
      }
    }
    console.log(`${ok ? 'ok ' : 'ERR'} ${String(status).padEnd(4)} ${String(ms).padStart(5)} ms  "${q}"  ${ok ? found : body.slice(0, 120)}`);
    if (!ok) failures.push({ q, status, body: body.slice(0, 200) });
  }
}

console.log(`\n${calls} recherches sur ${base}, ${failures.length} en erreur.`);
for (const f of failures) console.log(`  "${f.q}" -> ${f.status} ${f.body}`);
process.exit(failures.length ? 1 : 0);
