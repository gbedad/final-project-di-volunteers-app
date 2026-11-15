// Incidents of a student, declared by the team on the student's page by
// type (Charte: a late arrival of 15 minutes or more is an incident), and
// shown in "Contrôles" until they are marked as dealt with.
import db from '../config/database.js';

export const INCIDENT_TYPES = {
  retard: 'Retard (15 min ou plus)',
  absence: 'Absence non prévenue',
  comportement: 'Comportement de l’élève',
  travail: 'Travail ou matériel non apporté',
  famille: 'Difficulté avec la famille',
  tuteur: 'Difficulté avec le tuteur',
  preoccupant: 'Situation préoccupante',
  autre: 'Autre',
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const name = (first, last) => [first, last].filter(Boolean).join(' ') || null;

const row = (i) => ({
  id: i.id,
  student_id: i.student_id,
  binome_id: i.binome_id || null,
  date: day(i.date),
  type: i.type,
  type_label: INCIDENT_TYPES[i.type] || i.type,
  note: i.note || null,
  created_by: i.created_by,
  created_by_name: name(i.author_first, i.author_last),
  created_at: i.created_at,
  resolved_at: i.resolved_at || null,
  resolved_by_name: name(i.resolver_first, i.resolver_last),
  resolution: i.resolution || null,
  tutor: name(i.tutor_first, i.tutor_last),
  student: name(i.s_first, i.s_last),
});
const SELECT = `
  select i.*, a.first_name as author_first, a.last_name as author_last,
         r.first_name as resolver_first, r.last_name as resolver_last,
         t.first_name as tutor_first, t.last_name as tutor_last,
         s.first_name as s_first, s.last_name as s_last, s.is_demo as s_demo
    from student_incidents i
    join students s on s.id = i.student_id
    left join users a on a.id = i.created_by
    left join users r on r.id = i.resolved_by
    left join binomes b on b.id = i.binome_id
    left join users t on t.id = b.tutor_id`;

export const incidentsOf = async (studentId) =>
  (await q(`${SELECT} where i.student_id = :studentId order by i.date desc, i.id desc`, { studentId })).map(row);
export const findIncident = async (id) => {
  const [i] = await q(`${SELECT} where i.id = :id`, { id });
  return i ? row(i) : null;
};

// Body: { date, type, note, binome_id }; error: a message for the user
export const addIncident = async (studentId, body, userId) => {
  const date = String(body.date || '');
  if (!DAY_RE.test(date)) return { error: 'Date invalide' };
  if (!INCIDENT_TYPES[body.type]) return { error: 'Choisissez le type d’incident' };
  const note = String(body.note || '').trim().slice(0, 1000) || null;
  if (body.type === 'autre' && !note) return { error: 'Précisez ce qui s’est passé' };
  // The pair concerned, only one of this student
  let pairId = Number(body.binome_id) || null;
  if (pairId) {
    const [pair] = await q('select id from binomes where id = :pairId and student_id = :studentId', { pairId, studentId });
    if (!pair) pairId = null;
  }
  const [i] = await q(
    `insert into student_incidents (student_id, binome_id, date, type, note, created_by)
     values (:studentId, :pairId, :date, :type, :note, :userId) returning id`,
    { studentId, pairId, date, type: body.type, note, userId }
  );
  return { incident: await findIncident(i.id) };
};

// Dealt with (or opened again: resolved false)
export const resolveIncident = async (id, { resolved = true, resolution }, userId) => {
  if (resolved) {
    await q(
      `update student_incidents set resolved_at = now(), resolved_by = :userId, resolution = :resolution where id = :id`,
      { id, userId, resolution: String(resolution || '').trim().slice(0, 500) || null }
    );
  } else {
    await q(
      `update student_incidents set resolved_at = null, resolved_by = null, resolution = null where id = :id`,
      { id }
    );
  }
  return findIncident(id);
};
export const deleteIncident = (id) => q('delete from student_incidents where id = :id', { id });

// Incidents not dealt with yet (page "Contrôles"); demonstration students
// left out
export const openIncidents = async () =>
  (
    await q(
      `${SELECT} where i.resolved_at is null and coalesce(s.is_demo, false) = false
        order by i.date desc, i.id desc`
    )
  ).map(row);
