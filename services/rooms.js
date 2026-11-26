// Rooms (salles) of the three sites, and the room of each session. The room
// changes from one week to the next, so it is kept per session (pair, date,
// start time), not on the pair. Tables: salles, session_rooms (see
// scripts/migrate-salles.js).
import db from '../config/database.js';
import { addDays } from './schoolCalendar.js';

const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const roomLabel = (r) => `${r.site} · ${r.name}`;

// Active rooms, by site then name: the choices of the planning
export const activeRooms = async () =>
  (await q('select id, site, name from salles where active order by site, name')).map((r) => ({
    id: r.id,
    site: r.site,
    name: r.name,
    label: roomLabel(r),
  }));

// Rooms of these pairs between two days: { [binome_id]: [{ date, start_time, room_id, room_label }] }
export const roomsOf = async (pairIds, from = '1970-01-01', to = '9999-12-31') => {
  const out = {};
  if (!pairIds.length) return out;
  const rows = await q(
    `select sr.binome_id, sr.date, sr.start_time, sr.salle_id, s.site, s.name
       from session_rooms sr join salles s on s.id = sr.salle_id
      where sr.binome_id in (:ids) and sr.date between :from and :to
      order by sr.date, sr.start_time`,
    { ids: pairIds, from, to }
  );
  for (const r of rows) {
    (out[r.binome_id] = out[r.binome_id] || []).push({
      date: day(r.date),
      start_time: r.start_time,
      room_id: r.salle_id,
      room_label: roomLabel(r),
    });
  }
  return out;
};

// Room of one session: key `${binome_id}|${date}|${start}` => { room_id, room_label }
export const roomIndex = async (pairIds, from, to) => {
  const index = {};
  const byPair = await roomsOf(pairIds, from, to);
  for (const [binomeId, list] of Object.entries(byPair)) {
    for (const r of list) {
      index[`${binomeId}|${r.date}|${r.start_time}`] = { room_id: r.room_id, room_label: r.room_label };
    }
  }
  return index;
};

// Sets the room of one session, or clears it when room_id is null
export const setSessionRoom = async ({ binome_id, date, start_time, room_id }, userId) => {
  if (!DAY_RE.test(String(date || ''))) return { error: 'Date invalide' };
  if (!HHMM.test(String(start_time || ''))) return { error: 'Horaire invalide' };
  if (!binome_id) return { error: 'Binôme manquant' };
  if (room_id === null || room_id === undefined || room_id === '') {
    await q('delete from session_rooms where binome_id = :binome_id and date = :date and start_time = :start_time', {
      binome_id,
      date,
      start_time,
    });
    return { ok: true };
  }
  const [room] = await q('select id from salles where id = :id and active', { id: room_id });
  if (!room) return { error: 'Salle inconnue' };
  await q(
    `insert into session_rooms (binome_id, date, start_time, salle_id, updated_by, updated_at)
     values (:binome_id, :date, :start_time, :room_id, :userId, now())
     on conflict (binome_id, date, start_time)
     do update set salle_id = excluded.salle_id, updated_by = excluded.updated_by, updated_at = now()`,
    { binome_id, date, start_time, room_id, userId }
  );
  return { ok: true };
};

// Copies the rooms of the week before into the week of `from` (a Monday),
// without replacing rooms already set. Returns how many were copied.
export const copyPreviousWeekRooms = async (from, userId) => {
  const to = addDays(from, 6);
  const copied = await q(
    `insert into session_rooms (binome_id, date, start_time, salle_id, updated_by, updated_at)
     select binome_id, date + 7, start_time, salle_id, :userId, now()
       from session_rooms
      where date between :src and :srcTo
     on conflict (binome_id, date, start_time) do nothing
     returning id`,
    { src: addDays(from, -7), srcTo: addDays(to, -7), userId }
  );
  return copied.length;
};

// Two sessions of the same room overlap in time: both are flagged. Rows
// without a room, pauses and remote sessions are left out.
export const markRoomConflicts = (rows) => {
  const used = rows.filter((r) => r.room_id && !r.remote && r.kind !== 'pause');
  for (const r of used) {
    const s = minutesOf(r.start);
    const e = minutesOf(r.end);
    const clash = used.filter(
      (o) =>
        o !== r &&
        o.room_id === r.room_id &&
        minutesOf(o.start) < e &&
        s < minutesOf(o.end)
    );
    r.room_conflict = clash.length > 0;
    r.room_conflict_with = clash.map((o) => o.student);
  }
  return rows;
};
