// Exceptional sessions: a session out of the pair's slot, set by the team
// (any date, holidays included), or declared afterwards by the tutor (a
// past session in addition). Two kinds:
//  - 'supplementaire': expected in addition to the regular sessions
//  - 'remplacement': instead of a regular session, which becomes a "Pas de
//    séance" (reason 'autre', note "Remplacée par la séance du …")
import db from '../config/database.js';
import { addBreak, deleteBreak } from './pairBreaks.js';
import { slotOn } from './pairSchedule.js';
import { parisToday } from './schoolCalendar.js';

export const EXTRA_KINDS = {
  supplementaire: 'Séance supplémentaire',
  remplacement: 'Séance de remplacement',
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const frDay = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const extraMinutes = (e) => minutesOf(e.end_time) - minutesOf(e.start_time);

export const extraRow = (e) => ({
  id: e.id,
  binome_id: e.binome_id,
  kind: e.kind,
  kind_label: EXTRA_KINDS[e.kind] || e.kind,
  date: day(e.date),
  start_time: e.start_time,
  end_time: e.end_time,
  remote: !!e.remote,
  replaces_date: day(e.replaces_date),
  break_id: e.break_id || null,
  note: e.note || null,
  created_by: e.created_by,
  created_at: e.created_at,
});

// Exceptional sessions of these pairs ({ id: [extra] }), between two days
export const extrasOf = async (pairIds, from = '1970-01-01', to = '9999-12-31') => {
  const out = {};
  if (!pairIds.length) return out;
  const rows = await q(
    `select * from extra_sessions where binome_id in (:ids) and date between :from and :to order by date`,
    { ids: pairIds, from, to }
  );
  for (const e of rows) (out[e.binome_id] = out[e.binome_id] || []).push(extraRow(e));
  return out;
};
export const extraOn = (list, date) => (list || []).find((e) => e.date === date) || null;
export const findExtra = async (id) => {
  const [e] = await q('select * from extra_sessions where id = :id', { id });
  return e ? extraRow(e) : null;
};

// Body: { kind, date, start_time, end_time, remote, replaces_date, note }.
// pair: the pair (schedule, schedule_history). byTutor: a past session in
// addition only. Returns { extra } or { error }.
export const addExtra = async (pair, body, userId, { byTutor = false } = {}) => {
  const kind = EXTRA_KINDS[body.kind] ? body.kind : null;
  if (!kind) return { error: 'Choisissez : séance supplémentaire ou remplacement' };
  const date = String(body.date || '');
  if (!DAY_RE.test(date)) return { error: 'Date invalide' };
  const start = String(body.start_time || '');
  const end = String(body.end_time || '');
  if (!HHMM.test(start) || !HHMM.test(end) || end <= start) {
    return { error: 'Horaire incomplet ou heure de fin avant le début' };
  }
  // Tutor: a past or today session in addition, or today's session moved
  // (replacing today's slot). Anything else is set by the association.
  if (byTutor) {
    const today = parisToday();
    const inAddition = kind === 'supplementaire' && date <= today;
    const moved = kind === 'remplacement' && date === today;
    if (!inAddition && !moved) {
      return { error: 'Seule l’association programme une séance exceptionnelle à venir' };
    }
  }
  const [taken] = await q('select id from extra_sessions where binome_id = :id and date = :date', { id: pair.id, date });
  if (taken) return { error: 'Une séance exceptionnelle existe déjà ce jour-là' };
  const note = String(body.note || '').trim().slice(0, 300) || null;
  let replaces = null;
  let breakId = null;
  if (kind === 'remplacement') {
    replaces = String(body.replaces_date || '');
    if (!DAY_RE.test(replaces)) return { error: 'Choisissez la séance remplacée' };
    if (replaces === date) return { error: 'La séance remplacée et la nouvelle séance sont le même jour' };
    if (!slotOn(pair, replaces)) return { error: 'Pas de séance prévue au créneau ce jour-là' };
    const out = await addBreak(
      pair.id,
      { from: replaces, to: replaces, reason: 'autre', note: `Remplacée par la séance du ${frDay(date)}` },
      userId,
      { allowPast: true }
    );
    if (out.error) return { error: out.error };
    breakId = out.break.id;
  }
  try {
    const [e] = await q(
      `insert into extra_sessions (binome_id, kind, date, start_time, end_time, remote, replaces_date, break_id, note, created_by)
       values (:pair, :kind, :date, :start, :end, :remote, :replaces, :breakId, :note, :userId) returning *`,
      { pair: pair.id, kind, date, start, end, remote: body.remote === true, replaces, breakId, note, userId }
    );
    return { extra: extraRow(e) };
  } catch (err) {
    if (breakId) await deleteBreak(breakId);
    throw err;
  }
};

// Cancelled: the regular session it replaced is due again
export const removeExtra = async (extra) => {
  await q('delete from extra_sessions where id = :id', { id: extra.id });
  if (extra.break_id) await deleteBreak(extra.break_id);
};
