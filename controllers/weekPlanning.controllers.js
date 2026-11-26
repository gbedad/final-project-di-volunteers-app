import { weekPlanning, defaultWeekStart } from '../services/weekPlanning.js';
import { weekOf, toDate } from '../services/schoolCalendar.js';
import { setSessionRoom, copyPreviousWeekRooms, allRooms, createRoom, updateRoom, SITES } from '../services/rooms.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);

// Room of one session of the planning (team). Body: { binome_id, date,
// start_time, room_id } ; room_id null clears it
export const setRoom = async (req, res) => {
  try {
    const out = await setSessionRoom(req.body || {}, me(req));
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La salle n’a pas pu être enregistrée' });
  }
};

// The list of rooms, active or not, and the sites (team)
export const listRooms = async (req, res) => {
  try {
    res.json({ rooms: await allRooms(), sites: SITES });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les salles n’ont pas pu être chargées' });
  }
};

export const addRoom = async (req, res) => {
  try {
    const out = await createRoom(req.body || {});
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La salle n’a pas pu être ajoutée' });
  }
};

export const editRoom = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Salle invalide' });
  try {
    const out = await updateRoom(id, req.body || {});
    if (out.error) return res.status(out.error === 'Salle introuvable' ? 404 : 400).json({ error: out.error });
    res.json(out);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La salle n’a pas pu être modifiée' });
  }
};

// Rooms of the week before copied into this week (body: { from }, a Monday)
export const copyRooms = async (req, res) => {
  const given = req.body?.from;
  if (!given || !/^\d{4}-\d{2}-\d{2}$/.test(given) || Number.isNaN(toDate(given).getTime())) {
    return res.status(400).json({ error: 'Date invalide' });
  }
  try {
    const copied = await copyPreviousWeekRooms(weekOf(given), me(req));
    res.json({ copied });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les salles n’ont pas pu être reprises' });
  }
};

// Planning of a week: ?from=YYYY-MM-DD (any day of the week, moved to its
// Monday); by default the next week
export const getWeekPlanning = async (req, res) => {
  const given = req.query.from;
  if (given && (!/^\d{4}-\d{2}-\d{2}$/.test(given) || Number.isNaN(toDate(given).getTime()))) {
    return res.status(400).json({ error: 'Date invalide' });
  }
  try {
    const from = given ? weekOf(given) : defaultWeekStart();
    res.json(await weekPlanning(from));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Le planning de la semaine n\'a pas pu être chargé' });
  }
};
