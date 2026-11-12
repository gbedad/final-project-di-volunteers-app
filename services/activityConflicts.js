// Cultural outings at the time of a tutoring session: found for each
// registered student, told to the tutor (a "Pas de séance" for that day and
// an e-mail), withdrawn when the student no longer goes.
import db from '../config/database.js';
import { slotOn } from './pairSchedule.js';
import { offDayFinder } from './schoolCalendar.js';
import { addBreak, breakOn, breaksOf, deleteBreak } from './pairBreaks.js';
import { notifyOutingCancelled, notifyOutingConflict } from './binomesMail.js';

// Travel time around the outing
export const MARGIN_MINUTES = 30;
const IN_PROGRESS = ['actif', 'en pause'];
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
// The note of the "Pas de séance" made for an outing (found again by it)
export const outingNote = (activity) => `Sortie culturelle : ${activity.title}`;
const isOutingBreak = (b) => b.reason === 'eleve' && String(b.note || '').startsWith('Sortie culturelle');

// { student_id: [{ pair_id, tutor, subjects, slot, state }] } for the
// students given; state: 'conflit' (overlap, margin included), 'à vérifier'
// (outing without hours), 'prévenu' (a "Pas de séance" made for an outing),
// 'déjà annulée' (another "Pas de séance" that day)
export const conflictsOf = async (activity, studentIds) => {
  const date = day(activity.date);
  if (!date || !studentIds.length) return {};
  const pairs = await q(
    `select b.*, u.first_name as tutor_first, u.last_name as tutor_last
       from binomes b join users u on u.id = b.tutor_id join students s on s.id = b.student_id
      where b.student_id in (:ids) and b.status in (:statuses)
        -- demonstration tutors only for a demonstration student (tests)
        and (coalesce(u.is_demo, false) = false or coalesce(s.is_demo, false) = true)`,
    { ids: studentIds, statuses: IN_PROGRESS }
  );
  if (!pairs.length) return {};
  let off = () => null;
  try {
    ({ off } = await offDayFinder());
  } catch {}
  const breaks = await breaksOf(pairs.map((p) => p.id), date);
  const start = minutes(activity.start_time);
  const end = minutes(activity.end_time) ?? (start !== null ? start + 180 : null);
  const out = {};
  for (const p of pairs) {
    const slot = slotOn(p, date);
    if (!slot) continue;
    const holiday = off(date);
    if (holiday && (holiday === 'Jour férié' || !p.during_holidays)) continue;
    let state;
    const told = breakOn(breaks[p.id], date);
    if (told) state = isOutingBreak(told) ? 'prévenu' : 'déjà annulée';
    else if (start === null) state = 'à vérifier';
    else {
      const overlap =
        minutes(slot.startTime) < end + MARGIN_MINUTES && minutes(slot.endTime) > start - MARGIN_MINUTES;
      if (!overlap) continue;
      state = 'conflit';
    }
    (out[p.student_id] = out[p.student_id] || []).push({
      pair_id: p.id,
      tutor_id: p.tutor_id,
      tutor: `${p.tutor_first} ${p.tutor_last}`,
      subjects: p.subjects || [],
      slot: { startTime: slot.startTime, endTime: slot.endTime },
      state,
    });
  }
  return out;
};

// The tutors of the student's sessions in conflict are told: a "Pas de
// séance" that day + an e-mail. Returns the number of tutors told.
export const tellTutors = async (activity, studentId, userId) => {
  const found = (await conflictsOf(activity, [studentId]))[studentId] || [];
  const [student] = await q('select id, first_name from students where id = :id', { id: studentId });
  let told = 0;
  for (const c of found.filter((x) => ['conflit', 'à vérifier'].includes(x.state))) {
    const out = await addBreak(
      c.pair_id,
      { from: day(activity.date), to: day(activity.date), reason: 'eleve', note: outingNote(activity) },
      userId
    );
    if (out.error) continue;
    const [tutor] = await q('select id, first_name, email, email2 from users where id = :id', { id: c.tutor_id });
    if (tutor && student) notifyOutingConflict(tutor, student, activity, c.slot);
    told += 1;
  }
  return told;
};

// The student no longer goes (or the outing moved): the "Pas de séance"
// made for it are withdrawn, the tutors told the session takes place
export const releaseTutors = async (activity, studentIds, date = day(activity.date)) => {
  if (!date || !studentIds.length) return 0;
  const pairs = await q(
    `select b.id, b.tutor_id, b.student_id from binomes b where b.student_id in (:ids) and b.status in (:statuses)`,
    { ids: studentIds, statuses: IN_PROGRESS }
  );
  if (!pairs.length) return 0;
  const breaks = await breaksOf(pairs.map((p) => p.id), date);
  let released = 0;
  for (const p of pairs) {
    const b = breakOn(breaks[p.id], date);
    if (!b || !isOutingBreak(b) || b.from !== date || b.to !== date) continue;
    await deleteBreak(b.id);
    if (date >= new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })) {
      const [[tutor], [student]] = await Promise.all([
        q('select id, first_name, email, email2 from users where id = :id', { id: p.tutor_id }),
        q('select id, first_name from students where id = :id', { id: p.student_id }),
      ]);
      if (tutor && student) notifyOutingCancelled(tutor, student, activity, date);
    }
    released += 1;
  }
  return released;
};
