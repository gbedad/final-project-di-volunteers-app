// "Pas de séance" said in advance (tutor or team), and the new slot told by
// the tutor (applied by the team in the pair's sheet)
import Binomes from '../models/binomes.model.js';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import { addBreak, breaksOf, deleteBreak, findBreak } from '../services/pairBreaks.js';
import { parisToday } from '../services/schoolCalendar.js';
import { notifySlotRequest } from '../services/binomesMail.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);
const DAYS_LIST = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const OPEN = ['actif', 'en pause'];

// The tutor's own pair, in progress
const myPair = async (req, res) => {
  const pair = await Binomes.findByPk(req.params.id);
  if (!pair || pair.tutor_id !== me(req)) {
    res.status(404).json({ error: 'Binôme introuvable' });
    return null;
  }
  if (!OPEN.includes(pair.status)) {
    res.status(409).json({ error: 'Ce binôme n’est pas en cours' });
    return null;
  }
  return pair;
};
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};

// ---- Tutor ----
// Body: { from, to, reason, note }
export const myAddBreak = async (req, res) => {
  try {
    const pair = await myPair(req, res);
    if (!pair) return;
    const out = await addBreak(pair.id, req.body, me(req));
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out.break);
  } catch (err) {
    fail(res, err, "L'information n'a pas pu être enregistrée");
  }
};
export const myDeleteBreak = async (req, res) => {
  try {
    const b = await findBreak(Number(req.params.id));
    const pair = b && (await Binomes.findByPk(b.binome_id, { attributes: ['tutor_id'] }));
    if (!b || !pair || pair.tutor_id !== me(req)) return res.status(404).json({ error: 'Introuvable' });
    if (b.to < parisToday()) return res.status(409).json({ error: 'Ces dates sont passées' });
    await deleteBreak(b.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "La suppression n'a pas pu être enregistrée");
  }
};

// Body: { schedule: [{ day, startTime, endTime }], since, note }
export const mySlotRequest = async (req, res) => {
  try {
    const pair = await myPair(req, res);
    if (!pair) return;
    const schedule = Array.isArray(req.body.schedule) ? req.body.schedule : [];
    const valid =
      schedule.length &&
      schedule.every(
        (s) => DAYS_LIST.includes(s?.day) && HHMM.test(s.startTime || '') && HHMM.test(s.endTime || '') && s.startTime < s.endTime
      );
    if (!valid) return res.status(400).json({ error: 'Créneau incomplet ou heure de fin avant le début' });
    const since = /^\d{4}-\d{2}-\d{2}$/.test(req.body.since || '') ? req.body.since : null;
    const request = {
      schedule: schedule.map(({ day, startTime, endTime }) => ({ day, startTime, endTime })),
      since,
      note: String(req.body.note || '').trim().slice(0, 300) || null,
      at: new Date().toISOString(),
    };
    await pair.update({ schedule_request: request });
    res.json(pair);
    const [tutor, student] = await Promise.all([
      Users.findByPk(pair.tutor_id, { attributes: ['first_name', 'last_name'] }),
      Students.findByPk(pair.student_id, { attributes: ['first_name', 'last_name'] }),
    ]);
    if (tutor && student) notifySlotRequest(tutor, student, pair, request);
  } catch (err) {
    fail(res, err, "Le créneau n'a pas pu être envoyé");
  }
};

// ---- Team ----
export const listBreaks = async (req, res) => {
  try {
    const all = await breaksOf([Number(req.params.id)]);
    res.json(all[req.params.id] || []);
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};
export const teamAddBreak = async (req, res) => {
  try {
    const pair = await Binomes.findByPk(req.params.id, { attributes: ['id'] });
    if (!pair) return res.status(404).json({ error: 'Binôme introuvable' });
    const out = await addBreak(pair.id, req.body, me(req));
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out.break);
  } catch (err) {
    fail(res, err, "L'information n'a pas pu être enregistrée");
  }
};
export const teamDeleteBreak = async (req, res) => {
  try {
    const b = await findBreak(Number(req.params.id));
    if (!b) return res.status(404).json({ error: 'Introuvable' });
    await deleteBreak(b.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "La suppression n'a pas pu être enregistrée");
  }
};
