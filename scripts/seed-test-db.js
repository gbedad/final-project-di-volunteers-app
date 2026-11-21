// Test database only (local Docker container): two accounts to test the paid
// tutoring space, and one fictitious payer. Refuses to run on any other host.
//   node --env-file=.env.local scripts/seed-test-db.js   (after the env file has TEST_* passwords)
import bcrypt from 'bcrypt';
import db from '../config/database.js';

const host = process.env.AIVEN_HOST;
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.log(`Refusé : hôte ${host}. Ce script ne tourne que sur la base de test locale.`);
  await db.close();
  process.exit(1);
}
const accounts = [
  { email: 'test-superadmin@local.test', role: 'superadmin', password: process.env.TEST_SUPERADMIN_PASSWORD, name: ['Super', 'Admin test'] },
  { email: 'test-gestion-payant@local.test', role: 'gestion_payant', password: process.env.TEST_GESTION_PASSWORD, name: ['Gestion', 'Payant test'] },
  { email: 'test-admin@local.test', role: 'admin', password: process.env.TEST_ADMIN_PASSWORD, name: ['Admin', 'Bénévolat test'] },
  // Fictitious tutor: validated volunteer (no engagements set = tutoring)
  { email: 'test-tuteur@local.test', role: 'volunteer', status: 'Validé', password: process.env.TEST_TUTOR_PASSWORD, name: ['Tuteur', 'Test'] },
];
for (const a of accounts) {
  if (!a.password) throw new Error(`Mot de passe manquant pour ${a.email}`);
  const [[exists]] = await db.query('select id from users where email = :e', { replacements: { e: a.email }, logging: false });
  if (exists) {
    console.log(`Existe déjà : ${a.email}`);
    continue;
  }
  const hash = await bcrypt.hash(a.password, await bcrypt.genSalt());
  await db.query(
    `insert into users (email, password, first_name, last_name, role, status, is_active, is_demo, created_at, updated_at)
     values (:email, :hash, :first, :last, :role, :status, true, true, now(), now())`,
    { replacements: { email: a.email, hash, first: a.name[0], last: a.name[1], role: a.role, status: a.status || 'Actif' }, logging: false }
  );
  console.log(`Créé : ${a.email} (${a.role})`);
}
// One free-tutoring student (activite benevolat, the default) to compare with the paid ones
const [[free]] = await db.query(`select id from students where first_name = 'Élève' and last_name = 'Gratuit'`, { logging: false });
if (!free) {
  await db.query(
    `insert into students (first_name, last_name, status, is_active, created_at, updated_at, email)
     values ('Élève', 'Gratuit', 'Nouvelle demande', true, now(), now(), 'eleve-gratuit@local.test')`,
    { logging: false }
  );
  console.log('Créé : élève bénévole fictif « Élève Gratuit »');
}
const [[payer]] = await db.query(`select id from payeurs where name = 'Famille Test'`, { logging: false });
if (!payer) {
  await db.query(
    `insert into payeurs (type, name, email) values ('famille', 'Famille Test', 'famille-test@local.test')`,
    { logging: false }
  );
  console.log('Créé : payeur fictif « Famille Test »');
}
await db.close();
