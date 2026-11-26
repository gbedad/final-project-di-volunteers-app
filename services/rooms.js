// Rooms (salles) of the three sites, and the room of each session. The room
// changes from one week to the next, so it is kept per session (pair, date,
// start time), not on the pair. Tables: salles, session_rooms (see
// scripts/migrate-salles.js and scripts/migrate-salles-capacite.js).
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
  (await q('select id, site, name, capacite, seuil_alerte from salles where active order by site, name')).map((r) => ({
    id: r.id,
    site: r.site,
    name: r.name,
    label: roomLabel(r),
    capacite: r.capacite,
    seuil_alerte: r.seuil_alerte,
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

// Sessions of the same room that overlap in time. A session is in conflict
// when more sessions than the room's capacity are there at the same time;
// it gets a warning from the room's alert threshold (3 for Salle Haute, whose
// capacity is 4). A room of capacity 1 therefore refuses any overlap.
// capacityOf(room_id) => { capacite, seuil_alerte }. Rows without a room,
// pauses and remote sessions are left out.
export const markRoomConflicts = (rows, capacityOf) => {
  const used = rows.filter((r) => r.room_id && !r.remote && r.kind !== 'pause');
  for (const r of used) {
    const s = minutesOf(r.start);
    const e = minutesOf(r.end);
    const clash = used.filter(
      (o) => o !== r && o.room_id === r.room_id && minutesOf(o.start) < e && s < minutesOf(o.end)
    );
    const { capacite = 1, seuil_alerte = null } = capacityOf(r.room_id) || {};
    const count = clash.length + 1;
    const names = clash.map((o) => o.student);
    r.room_count = count;
    r.room_conflict = count > capacite;
    r.room_conflict_with = names;
    r.room_warning = !r.room_conflict && !!seuil_alerte && count >= seuil_alerte;
  }
  return rows;
};

// Management of the list (team): every room, active or not
export const SITES = ['MdA', 'Gerty', 'Bibliothèque'];

const roomRow = (r) => ({
  id: r.id,
  site: r.site,
  name: r.name,
  active: !!r.active,
  capacite: r.capacite,
  seuil_alerte: r.seuil_alerte ?? null,
  label: roomLabel(r),
});

const ROOM_COLUMNS = 'id, site, name, active, capacite, seuil_alerte';

export const allRooms = async () =>
  (await q(`select ${ROOM_COLUMNS} from salles order by site, name`)).map(roomRow);

const checkRoom = ({ site, name, capacite, seuil_alerte }) => {
  if (!SITES.includes(site)) return 'Site inconnu';
  const clean = String(name || '').trim();
  if (!clean || clean.length > 80) return 'Nom de salle invalide (1 à 80 caractères)';
  if (!Number.isInteger(capacite) || capacite < 1 || capacite > 10) return 'Capacité : un nombre entre 1 et 10';
  if (seuil_alerte !== null && (!Number.isInteger(seuil_alerte) || seuil_alerte < 1 || seuil_alerte > capacite)) {
    return 'Seuil d’alerte : vide, ou un nombre entre 1 et la capacité';
  }
  return null;
};

const DUPLICATE = /duplicate key|unique/i;

// { site, name, capacite?, seuil_alerte? } => { room } or { error }
export const createRoom = async ({ site, name, capacite = 1, seuil_alerte = null }) => {
  const error = checkRoom({ site, name, capacite, seuil_alerte });
  if (error) return { error };
  try {
    const [r] = await q(
      `insert into salles (site, name, active, capacite, seuil_alerte) values (:site, :name, true, :capacite, :seuil_alerte)
       returning ${ROOM_COLUMNS}`,
      { site, name: String(name).trim(), capacite, seuil_alerte }
    );
    return { room: roomRow(r) };
  } catch (err) {
    if (DUPLICATE.test(err.message || '')) return { error: 'Cette salle existe déjà sur ce site' };
    throw err;
  }
};

// Partial update: site, name, active, capacite, seuil_alerte. Rooms used by
// sessions are not deleted, only deactivated.
export const updateRoom = async (id, body) => {
  const [current] = await q(`select ${ROOM_COLUMNS} from salles where id = :id`, { id });
  if (!current) return { error: 'Salle introuvable' };
  const next = {
    site: body.site ?? current.site,
    name: body.name !== undefined ? String(body.name).trim() : current.name,
    active: typeof body.active === 'boolean' ? body.active : current.active,
    capacite: body.capacite !== undefined ? Number(body.capacite) : current.capacite,
    seuil_alerte:
      body.seuil_alerte !== undefined
        ? body.seuil_alerte === null || body.seuil_alerte === ''
          ? null
          : Number(body.seuil_alerte)
        : current.seuil_alerte ?? null,
  };
  const error = checkRoom(next);
  if (error) return { error };
  try {
    const [r] = await q(
      `update salles set site = :site, name = :name, active = :active, capacite = :capacite, seuil_alerte = :seuil_alerte
        where id = :id returning ${ROOM_COLUMNS}`,
      { id, ...next }
    );
    return { room: roomRow(r) };
  } catch (err) {
    if (DUPLICATE.test(err.message || '')) return { error: 'Cette salle existe déjà sur ce site' };
    throw err;
  }
};
