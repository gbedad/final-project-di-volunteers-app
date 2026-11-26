// Sessions not held, said in advance ("Pas de séance", by the tutor or the
// team), and the school holidays: what is expected of a pair, the return
// after the holidays (e-mail the day before, "Reprise non constatée").
import { Op } from 'sequelize';
import db from '../config/database.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';
import { scheduleOn } from './pairSchedule.js';
import { addDays, dayOf, offDayFinder, parisToday, schoolReturns } from './schoolCalendar.js';
import { notifyResumeNotice } from './binomesMail.js';

export const BREAK_REASONS = {
  vacances: 'Vacances',
  eleve: 'Élève indisponible',
  tuteur: 'Tuteur indisponible',
  autre: 'Autre',
};
// A break longer than this is a pause of the pair (status "en pause")
const MAX_BREAK_DAYS = 120;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const row = (b) => ({
  id: b.id,
  binome_id: b.binome_id,
  from: day(b.date_from),
  to: day(b.date_to),
  reason: b.reason,
  reason_label: BREAK_REASONS[b.reason] || b.reason,
  note: b.note || null,
  created_by: b.created_by,
  created_at: b.created_at,
});

// Breaks of these pairs ({ id: [break] }), those ending on or after since
export const breaksOf = async (pairIds, since = '1970-01-01') => {
  const out = {};
  if (!pairIds.length) return out;
  const [rows] = await db.query(
    `select * from pair_breaks where binome_id in (:ids) and date_to >= :since order by date_from`,
    { replacements: { ids: pairIds, since }, logging: false }
  );
  for (const b of rows) (out[b.binome_id] = out[b.binome_id] || []).push(row(b));
  return out;
};
export const breakOn = (list, date) => (list || []).find((b) => date >= b.from && date <= b.to) || null;

// Body: { from, to, reason, note }; error: a message for the user.
// allowPast: the team says afterwards that a session was not due
export const addBreak = async (pairId, body, userId, { allowPast = false } = {}) => {
  const from = String(body.from || '');
  const to = String(body.to || body.from || '');
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from) return { error: 'Dates invalides' };
  if (!allowPast && to < parisToday()) {
    return { error: 'Ces dates sont passées : prévenez l’association, qui le renseignera' };
  }
  if (await Seances.count({ where: { binome_id: pairId, date: { [Op.between]: [from, to] } } })) {
    return { error: 'Une séance est déjà enregistrée sur ces dates' };
  }
  if ((new Date(to) - new Date(from)) / 86400000 > MAX_BREAK_DAYS) {
    return { error: 'Plus de 4 mois : demandez plutôt à l’association de mettre le binôme en pause' };
  }
  if (!BREAK_REASONS[body.reason]) return { error: 'Choisissez un motif' };
  const [[b]] = await db.query(
    `insert into pair_breaks (binome_id, date_from, date_to, reason, note, created_by)
     values (:pairId, :from, :to, :reason, :note, :userId) returning *`,
    {
      replacements: { pairId, from, to, reason: body.reason, note: String(body.note || '').trim().slice(0, 300) || null, userId },
      logging: false,
    }
  );
  return { break: row(b) };
};
export const findBreak = async (id) => {
  const [[b]] = await db.query('select * from pair_breaks where id = :id', { replacements: { id }, logging: false });
  return b ? row(b) : null;
};
export const deleteBreak = (id) =>
  db.query('delete from pair_breaks where id = :id', { replacements: { id }, logging: false });

// The pair's next n slot days from a day on (included), up to `days` later:
// holidays (unless the pair goes on), public holidays and breaks skipped
export const nextSlots = (pair, from, n, { off, breaks, days = 21 }) => {
  const out = [];
  for (let d = from; d <= addDays(from, days) && out.length < n; d = addDays(d, 1)) {
    const slots = scheduleOn(pair, d).filter((s) => s.day === dayOf(d));
    if (!slots.length || breakOn(breaks, d)) continue;
    const holiday = off(d);
    if (holiday && (holiday === 'Jour férié' || !pair.during_holidays)) continue;
    out.push({ date: d, slot: slots[0] });
  }
  return out;
};

const started = (p) => {
  const s = p.start_date || p.responded_at || p.proposed_at;
  return s ? day(s instanceof Date ? s.toISOString() : s) : null;
};

// "Reprise non constatée": active pairs (not going on in the holidays) with
// nothing recorded since the last school return, once its first two slots
// have passed. pairs: active pairs, demonstration ones left out.
export const RESUME_SLOTS = 2;
export const resumeProblems = async (pairs) => {
  const today = parisToday();
  let returns;
  try {
    returns = await schoolReturns();
  } catch (err) {
    console.log('School returns not loaded:', err.message);
    return [];
  }
  const back = returns.filter((r) => r.back <= today).pop();
  // Only after a recent return (the next holidays take over)
  if (!back || back.back < addDays(today, -60)) return [];
  const watched = pairs.filter((p) => !p.during_holidays && started(p) && started(p) < back.back);
  if (!watched.length) return [];
  const { off } = await offDayFinder();
  const breaks = await breaksOf(watched.map((p) => p.id), back.back);
  const recorded = new Set(
    (
      await Seances.findAll({
        where: { binome_id: { [Op.in]: watched.map((p) => p.id) }, date: { [Op.gte]: back.back } },
        attributes: ['binome_id'],
        raw: true,
      })
    ).map((s) => s.binome_id)
  );
  return watched
    .filter((p) => !recorded.has(p.id))
    .map((p) => ({ pair: p, slots: nextSlots(p, back.back, RESUME_SLOTS, { off, breaks: breaks[p.id], days: 60 }) }))
    .filter(({ slots }) => slots.length === RESUME_SLOTS && slots[RESUME_SLOTS - 1].date < today)
    .map(({ pair, slots }) => ({ pair, back, slots }));
};

// The day before a school return: the tutor is told their next session,
// with a link to say the slot changed or that there is no session for now
const MAIL_HOUR = 10;
export const sendResumeNotices = async () => {
  const today = parisToday();
  const hour = Number(new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit' }).slice(0, 2));
  if (hour < MAIL_HOUR) return 0;
  const back = (await schoolReturns()).find((r) => r.back === addDays(today, 1));
  if (!back) return 0;
  const pairs = await Binomes.findAll({
    where: {
      status: 'actif',
      during_holidays: false,
      [Op.or]: [{ resume_notice: null }, { resume_notice: { [Op.ne]: back.back } }],
    },
    raw: true,
  });
  if (!pairs.length) return 0;
  const { off } = await offDayFinder();
  const breaks = await breaksOf(pairs.map((p) => p.id), back.back);
  let sent = 0;
  for (const pair of pairs) {
    const [tutor, student] = await Promise.all([
      Users.findByPk(pair.tutor_id, { attributes: ['id', 'first_name', 'email', 'email2', 'is_demo'] }),
      Students.findByPk(pair.student_id, { attributes: ['id', 'first_name', 'is_demo'] }),
    ]);
    // Marked even when nothing is sent: one look per return
    await Binomes.update({ resume_notice: back.back }, { where: { id: pair.id } });
    if (!tutor || !student || tutor.is_demo || student.is_demo) continue;
    const [next] = nextSlots(pair, back.back, 1, { off, breaks: breaks[pair.id], days: 14 });
    notifyResumeNotice(tutor, student, pair, next || null);
    sent += 1;
  }
  return sent;
};

// Checked every 3 hours (first run 2 minutes after start)
export const scheduleResumeNotices = () => {
  const run = () =>
    sendResumeNotices()
      .then((n) => n && console.log(`Back-to-school e-mails sent: ${n}`))
      .catch((err) => console.log('Back-to-school e-mails failed:', err.message));
  setTimeout(run, 2 * 60 * 1000);
  setInterval(run, 3 * 60 * 60 * 1000);
};
