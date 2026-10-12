// Live demonstration of the platform: a fictitious tutor to fill in during
// the demo, and a demo student whose parent is the presenter (parental
// consent shown live). Everything is marked "Démo"; e-mails go to the
// presenter's address.
//   node scripts/demo.js prepare   -> creates the tutor (prints the password)
//   node scripts/demo.js reset     -> deletes what the demo produced, then
//                                     the same as prepare
//   node scripts/demo.js clean     -> deletes what the demo produced
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import db from '../config/database.js';
import { deleteStoredFile } from '../config/aws.config.js';

const TUTOR_EMAIL = 'gerald.berrebi+demo@gmail.com';
const PARENT_EMAIL = 'gerald.berrebi+demo-parent@gmail.com';
const STUDENT_ID = 8; // Mehdi Haddad (demo), 5ème, maths + français
// What the student had before the demo (put back by clean)
const STUDENT_BEFORE = {
  parent1_email: 'parent.haddad@example.invalid',
  parental_consent_at: '2026-10-07T08:27:27.522Z',
};

const q = (sql, replacements, transaction) =>
  db.query(sql, { replacements, transaction, logging: false });

const clean = async () => {
  const [[tutor]] = await q('select id from users where email = :e and is_demo', { e: TUTOR_EMAIL });
  const tutorId = tutor?.id || null;
  // Stored files: tutor's documents and conventions, student's consents
  const [files] = await q(
    `select path from files where "userId" = :t
     union all
     select path from student_files where "studentId" = :s and path like '%consentement-parental%'`,
    { t: tutorId, s: STUDENT_ID }
  );
  for (const f of files) await deleteStoredFile(f.path).catch(() => {});
  await db.transaction(async (t) => {
    await q('delete from parental_consents where student_id = :s', { s: STUDENT_ID }, t);
    await q(`delete from student_files where "studentId" = :s and path like '%consentement-parental%'`, { s: STUDENT_ID }, t);
    await q(
      'update students set parent1_email = :email, parental_consent_at = :at where id = :s',
      { email: STUDENT_BEFORE.parent1_email, at: STUDENT_BEFORE.parental_consent_at, s: STUDENT_ID },
      t
    );
    if (tutorId) {
      await q('delete from seances where binome_id in (select id from binomes where tutor_id = :t)', { t: tutorId }, t);
      // Students paired with the tutor go back to waiting
      await q(
        `update students set status = 'En attente de tuteur'
          where id in (select student_id from binomes where tutor_id = :t) and is_demo`,
        { t: tutorId },
        t
      );
      await q('delete from binomes where tutor_id = :t', { t: tutorId }, t);
      await q('delete from convention_signatures where user_id = :t', { t: tutorId }, t);
      await q('delete from files where "userId" = :t', { t: tutorId }, t);
      await q('delete from status_changes where user_id = :t', { t: tutorId }, t);
      await q('delete from internal_messages where subject_id = :t', { t: tutorId }, t);
      await q('delete from thread_reads where subject_id = :t', { t: tutorId }, t);
      await q('delete from skills where "userId" = :t', { t: tutorId }, t);
      await q('delete from users where id = :t and is_demo', { t: tutorId }, t);
    }
  });
  console.log(tutorId ? `Tuteur de démo #${tutorId} supprimé, avec ce qu'il a produit.` : 'Pas de tuteur de démo.');
  console.log(`Élève #${STUDENT_ID} remis comme avant la démo.`);
};

const prepare = async () => {
  const [[exists]] = await q('select id from users where email = :e', { e: TUTOR_EMAIL });
  if (exists) {
    console.log(`Le tuteur de démo existe déjà (#${exists.id}) : lancez "reset" pour repartir de zéro.`);
    return;
  }
  // Easy to type during the demo, hard to guess
  const password = `Demo-${crypto.randomInt(1000, 9999)}-${crypto.randomBytes(2).toString('hex')}`;
  const hash = await bcrypt.hash(password, await bcrypt.genSalt());
  const [[tutor]] = await q(
    `insert into users (email, password, first_name, last_name, role, status, is_active,
                        mission_id, is_demo, created_at, updated_at)
     values (:e, :h, 'Léa', 'Démo', 'volunteer', 'Compte créé', false, 1, true, now(), now())
     returning id`,
    { e: TUTOR_EMAIL, h: hash }
  );
  // Parent of the demo student = the presenter; no consent yet
  await q(
    'update students set parent1_email = :p, parental_consent_at = null where id = :s',
    { p: PARENT_EMAIL, s: STUDENT_ID }
  );
  console.log(`Tuteur de démo #${tutor.id} : Léa Démo`);
  console.log(`  e-mail       : ${TUTOR_EMAIL}`);
  console.log(`  mot de passe : ${password}`);
  console.log(`Élève de démo #${STUDENT_ID} (Mehdi Haddad) : parent = ${PARENT_EMAIL}, pas encore d'accord.`);
};

const command = process.argv[2];
if (command === 'prepare') await prepare();
else if (command === 'clean') await clean();
else if (command === 'reset') {
  await clean();
  await prepare();
} else console.log('Usage : node scripts/demo.js prepare | reset | clean');
await db.close();
