// Sessions log of the team (page "Binômes", tab "Séances"): every session
// recorded in a period, and the sessions expected from the pairs' slots
// with nothing recorded (school holidays of Paris and public holidays
// excluded).
import { Op } from 'sequelize';
import db from '../config/database.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';
import { changedSince, scheduleOn, slotOn } from './pairSchedule.js';
import { addDays, dayOf, offDayFinder, parisDate, parisToday, weekOf } from './schoolCalendar.js';
import { breakOn, breaksOf } from './pairBreaks.js';
import { extraOn, extrasOf } from './extraSessions.js';

export { parisToday };

// ---- The log ----
// Minutes after the end of today's slot before it shows as not signed in
const SIGN_IN_GRACE = 60;
const REMOTE = /^\s*(à|a) distance\s*$/i;
const isRemote = (pair) => REMOTE.test(pair.how_location || '');
const hasReport = (s) => !!(s.work || s.remark || s.progress);

// The student's signature exists since then: nothing is missing before
const SIGNATURE_SINCE = '2026-10-22';
const signatureOf = (s, remote) => {
  if (s.attendance !== 'présent') return null;
  // Signed on Jotform (on-site sessions, before or besides the application)
  if (s.jotform_signature_url) return 'signée';
  // Held on Zoom: no signature (the Zoom report is the proof)
  if (remote || s.zoom_key) return null;
  if (String(s.date).slice(0, 10) < SIGNATURE_SINCE) return null;
  if (s.student_signed_at) return 'signée';
  if (s.no_signature) return 'impossible';
  return 'manquante';
};

// from, to: YYYY-MM-DD, both included. activites: the activities read (free
// tutoring by default, see middlewares/activiteAccess.js)
export const sessionLog = async (from, to, activites = ['benevolat']) => {
  const sessions = await Seances.findAll({
    where: { date: { [Op.between]: [from, to] }, activite: activites },
    order: [['date', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  // Pairs of these sessions, and the pairs in progress (expected sessions)
  const pairs = await Binomes.findAll({
    where: {
      activite: activites,
      [Op.or]: [
        { id: [...new Set(sessions.map((s) => s.binome_id))] },
        { status: 'actif' },
      ],
    },
    raw: true,
  });
  const students = await Students.findAll({
    where: { id: [...new Set(pairs.map((p) => p.student_id))] },
    attributes: ['id', 'first_name', 'last_name', 'level', 'is_demo'],
    raw: true,
  });
  const tutors = await Users.findAll({
    where: { id: [...new Set(pairs.map((p) => p.tutor_id).filter(Boolean))] },
    attributes: ['id', 'first_name', 'last_name', 'is_demo'],
    raw: true,
  });
  // Team members who confirmed sessions
  const teamIds = [...new Set(sessions.filter((s) => s.source === 'equipe').map((s) => s.author_id).filter(Boolean))];
  const teamNames = Object.fromEntries(
    (teamIds.length
      ? await Users.findAll({ where: { id: teamIds }, attributes: ['id', 'first_name', 'last_name'], raw: true })
      : []
    ).map((u) => [u.id, `${u.first_name} ${u.last_name}`])
  );
  const pairOf = Object.fromEntries(
    pairs.map((p) => [
      p.id,
      {
        ...p,
        student: students.find((x) => x.id === p.student_id) || null,
        tutor: tutors.find((x) => x.id === p.tutor_id) || null,
      },
    ])
  );
  // Exceptional sessions of the period (in addition, or replacing one)
  const extras = await extrasOf(Object.keys(pairOf).map(Number), from, to);
  const extraInfo = (e) =>
    e ? { id: e.id, kind: e.kind, kind_label: e.kind_label, replaces_date: e.replaces_date, note: e.note } : null;
  const common = (pair, date) => ({
    binome_id: pair.id,
    date,
    day: dayOf(date),
    // Slot in force on that date (a change of slot does not rewrite the past)
    slot: slotOn(pair, date),
    // An earlier slot: the current one applies from that day
    slot_changed_since: changedSince(pair, date),
    current_schedule: pair.schedule || [],
    remote: isRemote(pair),
    subjects: pair.subjects || [],
    student: pair.student,
    tutor: pair.tutor,
    // Student or tutor of the demonstration
    is_demo: !!(pair.student?.is_demo || pair.tutor?.is_demo),
    pair,
  });

  const rows = sessions
    .filter((s) => pairOf[s.binome_id])
    .map((s) => {
      const pair = pairOf[s.binome_id];
      const date = String(s.date).slice(0, 10);
      const extra = extraOn(extras[pair.id], date);
      const remote = extra ? extra.remote : isRemote(pair);
      return {
        ...common(pair, date),
        ...(extra && { slot: { day: dayOf(date), startTime: extra.start_time, endTime: extra.end_time }, remote }),
        extra: extraInfo(extra),
        kind: 'session',
        id: s.id,
        signed_in_at: s.signed_in_at || null,
        attendance: s.attendance,
        late: !!s.late,
        cancelled_by: s.cancelled_by || null,
        duration_minutes: s.duration_minutes,
        signature: signatureOf(s, remote),
        // Application, Jotform, or both (signed in here, signed there)
        // Application, Jotform, Zoom, or the application completed by one
        source:
          ['jotform', 'zoom', 'equipe', 'borne'].includes(s.source)
            ? s.source
            : s.jotform_id
            ? 'app+jotform'
            : s.zoom_key
            ? 'app+zoom'
            : 'app',
        // Held on Zoom (even for a pair set as on-site)
        zoom: !!s.zoom_key,
        jotform_signature_url: s.jotform_signature_url || null,
        // Confirmed by the team: how, and who
        confirmation: s.confirmation || null,
        confirmed_by: s.source === 'equipe' ? teamNames[s.author_id] || null : null,
        // A report is expected when the session took place
        report: hasReport(s) ? 'fait' : s.attendance === 'présent' ? 'manquant' : null,
        work: s.work,
        remark: s.remark,
        progress: s.progress,
      };
    });

  // Expected: each week, the pair's slots (holidays excluded) not covered by
  // a session of that week; only past days, from the start of the pair
  const { off, calendarOk } = await offDayFinder();
  const today = parisToday();
  // Today counts once a slot of the day ended an hour ago (time left to the
  // tutor to sign in): "pas encore émargée" until tomorrow
  const last = to < today ? to : today;
  const nowMinutes = (() => {
    const [h, m] = new Date()
      .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
      .split(':')
      .map(Number);
    return h * 60 + m;
  })();
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return h * 60 + (m || 0);
  };
  // "Pas de séance" said in advance by the tutor or the team
  const breaks = await breaksOf(
    Object.values(pairOf).filter((p) => p.status === 'actif').map((p) => p.id),
    from
  );
  // Sessions of an exceptional day do not stand for a regular session
  const byPairWeek = {};
  for (const s of sessions) {
    if (extraOn(extras[s.binome_id], String(s.date).slice(0, 10))) continue;
    const key = `${s.binome_id}|${weekOf(String(s.date).slice(0, 10))}`;
    (byPairWeek[key] = byPairWeek[key] || new Set()).add(String(s.date).slice(0, 10));
  }
  for (const pair of Object.values(pairOf)) {
    if (pair.status !== 'actif') continue;
    const started = pair.start_date || pair.responded_at || pair.proposed_at;
    // start_date is a day; responded_at / proposed_at are times
    const begin = !started
      ? from
      : started instanceof Date
      ? parisDate(started)
      : String(started).slice(0, 10);
    const first = begin > from ? begin : from;
    const planned = {};
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const daySlots = scheduleOn(pair, d).filter((sl) => sl.day === dayOf(d));
      if (!daySlots.length) continue;
      // An exceptional session that day: expected as such (below)
      if (extraOn(extras[pair.id], d)) continue;
      // Holidays: nothing expected, unless the pair goes on (public
      // holidays always off)
      const holiday = off(d);
      if (holiday && (holiday === 'Jour férié' || !pair.during_holidays)) continue;
      // Said in advance: shown as such, not expected
      const told = breakOn(breaks[pair.id], d);
      if (told) {
        const held = byPairWeek[`${pair.id}|${weekOf(d)}`];
        if (!held?.has(d)) rows.push({ ...common(pair, d), kind: 'prevenue', id: `prevenue-${pair.id}-${d}`, break: told });
        continue;
      }
      if (d === today && !daySlots.some((sl) => nowMinutes >= toMinutes(sl.endTime) + SIGN_IN_GRACE)) continue;
      (planned[weekOf(d)] = planned[weekOf(d)] || []).push(d);
    }
    for (const [week, days] of Object.entries(planned)) {
      const held = byPairWeek[`${pair.id}|${week}`] || new Set();
      // A session on another day of the week counts (session moved)
      let missing = days.length - held.size;
      for (const d of days) {
        if (missing <= 0) break;
        if (held.has(d)) continue;
        rows.push({
          ...common(pair, d),
          kind: 'attendue',
          id: `attendue-${pair.id}-${d}`,
          // Today: not signed in yet (the tutor can still do it tonight)
          today: d === today,
        });
        missing -= 1;
      }
    }
  }
  // Exceptional sessions with nothing recorded: expected whatever the
  // holidays (set on purpose), unless a "Pas de séance" covers the day
  const heldOn = new Set(sessions.map((s) => `${s.binome_id}|${String(s.date).slice(0, 10)}`));
  for (const [pairId, list] of Object.entries(extras)) {
    const pair = pairOf[pairId];
    if (!pair || pair.status !== 'actif') continue;
    for (const e of list) {
      if (e.date > last || heldOn.has(`${pair.id}|${e.date}`)) continue;
      const base = {
        ...common(pair, e.date),
        slot: { day: dayOf(e.date), startTime: e.start_time, endTime: e.end_time },
        remote: e.remote,
        extra: extraInfo(e),
      };
      const told = breakOn(breaks[pair.id], e.date);
      if (told) {
        rows.push({ ...base, kind: 'prevenue', id: `prevenue-x${e.id}`, break: told });
        continue;
      }
      if (e.date === today && nowMinutes < toMinutes(e.end_time) + SIGN_IN_GRACE) continue;
      rows.push({ ...base, kind: 'attendue', id: `attendue-x${e.id}`, today: e.date === today });
    }
  }
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  for (const r of rows) r.holiday = off(r.date);
  const [[{ n, z }]] = await db.query(
    `select (select count(*)::int from jotform_pending where resolved_at is null) as n,
            (select count(*)::int from zoom_pending where resolved_at is null) as z`,
    { logging: false }
  );
  return { from, to, calendar_ok: calendarOk, jotform_pending: n, zoom_pending: z, rows };
};
