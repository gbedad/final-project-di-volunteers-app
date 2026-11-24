// Preparation and return sessions of an outing: the children who come (not
// all the registered ones, others may join), their presence, and the check
// of their tutoring sessions that day (same check as for the outing itself).
import db from '../config/database.js';
import { conflictsOf, releaseTutors, tellTutors } from './activityConflicts.js';
import { SESSION_ATTENDANCES, getActivity } from './activities.js';

export const KINDS = {
  prep: { label: 'séance préparatoire' },
  debrief: { label: 'séance de retour' },
};
export const isKind = (kind) => Object.prototype.hasOwnProperty.call(KINDS, kind);

const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const one = async (sql, replacements) => (await q(sql, replacements))[0] || null;

// { date, start_time, end_time, place, by } of the session, if it has a date
const sessionOf = (a, kind) => (a[kind]?.date ? a[kind] : null);
// The session seen as an outing (date and hours of the session): what the
// tutoring check and the e-mail to the tutor work with
const asOuting = (a, kind) => {
  const s = sessionOf(a, kind);
  return s && { ...a, title: `${a.title} (${KINDS[kind].label})`, date: s.date, start_time: s.start_time || null, end_time: s.end_time || null };
};
// The tutor's name is for the team (managers) only
const shownConflicts = (list, manager) =>
  (list || []).map((c) => ({ ...c, tutor: manager ? c.tutor : null, tutor_id: undefined }));

export const sessionCounts = async (activityId) => {
  let rows = [];
  try {
    rows = await q(
      `select kind, count(*)::int as n from activity_session_participants where activity_id = :id group by kind`,
      { id: activityId }
    );
  } catch (err) {
    // Before the migration the table does not exist: no child yet
    if (err.parent?.code !== '42P01') throw err;
  }
  return { prep: rows.find((r) => r.kind === 'prep')?.n || 0, debrief: rows.find((r) => r.kind === 'debrief')?.n || 0 };
};

// The children of a session, and the registered ones who could be added
export const listSession = async (activityId, kind, manager) => {
  const a = await getActivity(activityId);
  if (!a) return { error: 'Activité introuvable', status: 404 };
  const session = sessionOf(a, kind);
  const participants = await q(
    `select p.id, p.student_id, p.attendance, s.first_name, s.last_name, s.level, s.school->>'name' as school_name,
            s.phone as student_phone, s.parent1_firstname, s.parent1_lastname, s.parent1_phone,
            s.parent2_firstname, s.parent2_lastname, s.parent2_phone
       from activity_session_participants p join students s on s.id = p.student_id
      where p.activity_id = :id and p.kind = :kind
      order by lower(s.first_name), lower(s.last_name)`,
    { id: activityId, kind }
  );
  const inside = new Set(participants.map((p) => p.student_id));
  const candidates = a.registrations
    .filter((r) => r.status === 'inscrit' && !inside.has(r.student_id))
    .map((r) => ({
      student_id: r.student_id,
      first_name: r.first_name,
      last_name: r.last_name,
      level: r.level,
      outing_attendance: r.attendance || null,
    }));
  const outing = asOuting(a, kind);
  const found = outing
    ? await conflictsOf(outing, [...inside, ...candidates.map((c) => c.student_id)], { sameDay: true })
    : {};
  return {
    kind,
    session,
    participants: participants.map((p) => ({ ...p, conflicts: shownConflicts(found[p.student_id], manager) })),
    candidates: candidates.map((c) => ({ ...c, conflicts: shownConflicts(found[c.student_id], manager) })),
  };
};

// Before adding: the tutoring sessions of these students that day
export const conflictsFor = async (activityId, kind, studentIds, manager) => {
  const a = await getActivity(activityId);
  const outing = a && asOuting(a, kind);
  if (!outing) return {};
  const found = await conflictsOf(outing, studentIds, { sameDay: true });
  return Object.fromEntries(studentIds.map((id) => [id, shownConflicts(found[id], manager)]));
};

export const addChildren = async (activityId, kind, studentIds, userId) => {
  const a = await getActivity(activityId);
  if (!a) return { error: 'Activité introuvable', status: 404 };
  if (!sessionOf(a, kind)) return { error: `Indiquez d'abord la date de la ${KINDS[kind].label} (onglet Infos)` };
  const ids = [...new Set((studentIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return { error: 'Choisissez au moins un enfant' };
  const known = await q('select id from students where id in (:ids)', { ids });
  if (known.length !== ids.length) return { error: 'Élève introuvable' };
  for (const id of ids) {
    await q(
      `insert into activity_session_participants (activity_id, kind, student_id, created_by)
       values (:activityId, :kind, :id, :userId) on conflict do nothing`,
      { activityId, kind, id, userId }
    );
  }
  return { ok: true, added: ids.length };
};

export const setPresence = async (participantId, attendance) => {
  if (attendance && !SESSION_ATTENDANCES.includes(attendance)) return { error: 'Émargement inconnu' };
  const row = await one(
    'update activity_session_participants set attendance = :attendance where id = :id returning id, attendance',
    { id: participantId, attendance: attendance || null }
  );
  return row ? { participant: row } : { error: 'Enfant introuvable', status: 404 };
};

export const removeChild = async (participantId) => {
  const row = await one('select * from activity_session_participants where id = :id', { id: participantId });
  if (!row) return { error: 'Enfant introuvable', status: 404 };
  await q('delete from activity_session_participants where id = :id', { id: participantId });
  // No longer there: the tutoring session told to be cancelled takes place
  // again (unless the same day is also the outing's, where he still goes)
  const a = await getActivity(row.activity_id);
  const outing = a && asOuting(a, row.kind);
  if (outing) {
    const goesToOuting = a.date === outing.date && a.registrations.some((r) => r.student_id === row.student_id && r.status === 'inscrit');
    if (!goesToOuting) await releaseTutors(outing, [row.student_id], outing.date);
  }
  return { ok: true };
};

// The tutors of this child told: "Pas de séance" that day and an e-mail
export const tellChildTutors = async (participantId, userId) => {
  const row = await one('select * from activity_session_participants where id = :id', { id: participantId });
  if (!row) return { error: 'Enfant introuvable', status: 404 };
  const a = await getActivity(row.activity_id);
  const outing = a && asOuting(a, row.kind);
  if (!outing) return { error: 'La séance n’a pas de date' };
  return { told: await tellTutors(outing, row.student_id, userId) };
};
