// Paid tutoring: students and pairs (activite 'payant'). Same tables as the
// free tutoring, rows marked 'payant'. Reads and writes go through here only
// from the paid space (routes/payant.route.js); the free space never sees them
// (middlewares/activiteAccess.js).
import db from '../config/database.js';
import { isTutorId } from './engagements.js';

const q = async (sql, replacements = {}, transaction) =>
  (await db.query(sql, { replacements, transaction, logging: false }))[0];

const STUDENT_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'level', 'comment', 'status'];
const PAIR_STATUSES = ['actif', 'en pause', 'terminé'];
const OPEN = ['proposé', 'actif', 'en pause'];

const text = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

// Establishment, as picked in the national directory (same shape as the free
// tutoring: uai, name, type, city, zipcode, sector, rep)
const SCHOOL_FIELDS = ['uai', 'name', 'type', 'city', 'zipcode', 'sector', 'rep'];
const schoolOf = (s) => {
  if (!s || typeof s !== 'object' || !text(s.name)) return null;
  const out = {};
  for (const f of SCHOOL_FIELDS) out[f] = s[f] ?? null;
  return JSON.stringify(out);
};

export const listPaidStudents = () =>
  q(
    `select s.id, s.first_name, s.last_name, s.email, s.phone, s.level, s.school, s.status, s.comment, s.created_at,
       coalesce((
         select json_agg(json_build_object(
           'id', b.id, 'status', b.status, 'subjects', b.subjects, 'start_date', b.start_date,
           'tutor_id', b.tutor_id,
           'tutor', trim(u.first_name || ' ' || u.last_name)
         ) order by b.id)
         from binomes b left join users u on u.id = b.tutor_id
         where b.student_id = s.id and b.activite = 'payant'
       ), '[]'::json) as pairs
     from students s
     where s.activite = 'payant'
     order by s.created_at desc, s.id desc`
  );

export const createPaidStudent = async (body = {}) => {
  const first = text(body.first_name);
  const last = text(body.last_name);
  if (!first || !last) throw new Error('Prénom et nom obligatoires');
  const [row] = await q(
    `insert into students (activite, first_name, last_name, email, phone, level, school, comment, status, is_active, created_at, updated_at)
     values ('payant', :first, :last, :email, :phone, :level, :school::json, :comment, 'Actif', true, now(), now())
     returning id, first_name, last_name, status`,
    {
      first,
      last,
      email: text(body.email),
      phone: text(body.phone),
      level: text(body.level),
      school: schoolOf(body.school),
      comment: text(body.comment),
    }
  );
  return row;
};

export const updatePaidStudent = async (id, body = {}) => {
  const [row] = await q(`select id from students where id = :id and activite = 'payant'`, { id });
  if (!row) throw new Error('Élève introuvable');
  const changes = {};
  for (const f of STUDENT_FIELDS) if (body[f] !== undefined) changes[f] = text(body[f]);
  if (changes.first_name === null || changes.last_name === null) throw new Error('Prénom et nom obligatoires');
  // The establishment is a JSON object (or null to clear it)
  if (body.school !== undefined) changes.school = schoolOf(body.school);
  const keys = Object.keys(changes);
  if (!keys.length) return { saved: [] };
  const set = keys.map((k) => (k === 'school' ? `school = :school::json` : `${k} = :${k}`)).join(', ');
  await q(`update students set ${set}, updated_at = now() where id = :id`, { ...changes, id });
  return { saved: keys };
};

export const listPaidPairs = () =>
  q(
    `select b.id, b.student_id, b.tutor_id, b.status, b.subjects, b.start_date, b.note, b.proposed_at,
       trim(s.first_name || ' ' || s.last_name) as student,
       trim(u.first_name || ' ' || u.last_name) as tutor
     from binomes b
     join students s on s.id = b.student_id
     left join users u on u.id = b.tutor_id
     where b.activite = 'payant'
     order by b.proposed_at desc, b.id desc`
  );

// Tutors who can take a paid student: validated volunteers with the tutoring engagement
export const listTutorsForPaid = async () => {
  const users = await q(
    `select id, first_name, last_name from users
     where role = 'volunteer' and status = 'Validé'
     order by last_name, first_name`
  );
  const out = [];
  for (const u of users) if (await isTutorId(u.id)) out.push(u);
  return out;
};

// A paid pair: the team pairs a paid student with a tutor. Starts 'actif'.
export const createPaidPair = async ({ student_id, tutor_id, subjects, start_date, note, proposed_by }) => {
  if (!student_id || !tutor_id) throw new Error('Élève et tuteur obligatoires');
  const list = (subjects || []).filter(Boolean);
  if (!list.length) throw new Error('Choisissez au moins une matière');
  return db.transaction(async (transaction) => {
    const [student] = await q(
      `select id from students where id = :id and activite = 'payant'`,
      { id: student_id },
      transaction
    );
    if (!student) throw new Error('Élève introuvable');
    const [tutor] = await q(
      `select id from users where id = :id and role = 'volunteer' and status = 'Validé'`,
      { id: tutor_id },
      transaction
    );
    if (!tutor || !(await isTutorId(tutor.id))) throw new Error('Tuteur introuvable');
    const [open] = await q(
      `select count(*)::int as n from binomes
       where student_id = :student_id and tutor_id = :tutor_id and status in (:open)`,
      { student_id, tutor_id, open: OPEN },
      transaction
    );
    if (open.n) throw new Error('Ce tuteur accompagne déjà cet élève');
    const [row] = await q(
      `insert into binomes (activite, student_id, tutor_id, subjects, status, start_date, note, proposed_by,
         proposed_at, responded_at, schedule, during_holidays)
       values ('payant', :student_id, :tutor_id, :subjects::varchar[], 'actif', :start_date, :note, :proposed_by,
         now(), now(), '[]', false)
       returning id, status`,
      {
        student_id,
        tutor_id,
        // Postgres array literal: a JS array would be expanded into a list
        subjects: `{${list.map((x) => `"${x.replace(/["\\]/g, '')}"`).join(',')}}`,
        start_date: start_date || new Date().toISOString().slice(0, 10),
        note: text(note),
        proposed_by: proposed_by ?? null,
      },
      transaction
    );
    return row;
  });
};

export const updatePaidPair = async (id, { status, end_reason }) => {
  if (!PAIR_STATUSES.includes(status)) throw new Error('Statut de binôme invalide');
  const [row] = await q(`select id from binomes where id = :id and activite = 'payant'`, { id });
  if (!row) throw new Error('Binôme introuvable');
  const ended = status === 'terminé';
  await q(
    `update binomes set status = :status,
       ended_at = case when :ended then now() else ended_at end,
       end_reason = case when :ended then :end_reason else end_reason end
     where id = :id`,
    { status, ended, end_reason: text(end_reason), id }
  );
  return { id, status };
};
