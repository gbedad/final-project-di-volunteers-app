// Planning of the sessions of one week (page "Binômes", tab "Planning"): for
// each active pair, its slots of the seven days from a Monday on, with the
// school and public holidays, the breaks and the exceptional sessions taken
// into account. Nothing is recorded here: these are the expected sessions.
import Binomes from '../models/binomes.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';
import { scheduleOn, dayOf } from './pairSchedule.js';
import { addDays, offDayFinder, parisToday, weekOf } from './schoolCalendar.js';
import { breaksOf, breakOn } from './pairBreaks.js';
import { extrasOf, extraOn } from './extraSessions.js';
import { activeRooms, roomIndex, markRoomConflicts } from './rooms.js';

const REMOTE = /^\s*(à|a) distance\s*$/i;
const isRemote = (pair) => REMOTE.test(pair.how_location || '');

// Student as shown to the team and to tutors: first name and initial
const studentLabel = (s) => (s ? `${s.first_name} ${(s.last_name || '').charAt(0).toUpperCase()}.`.trim() : '');
const tutorLabel = (u) => (u ? `${u.first_name} ${u.last_name}` : '');

// "Nouveau créneau depuis le …" when the pair's current slots start within
// the week and the day is on or after that start
const newSlotSince = (pair, from, to, date) => {
  const history = [...(pair.schedule_history || [])].filter((h) => h.since).sort((a, b) => a.since.localeCompare(b.since));
  const latest = history.at(-1);
  if (!latest || latest.since < from || latest.since > to || date < latest.since) return null;
  return `Nouveau créneau depuis le ${latest.since.split('-').reverse().join('/')}`;
};

// The Monday of the next week (from today in Paris), or of the week of `from`
export const defaultWeekStart = () => addDays(weekOf(parisToday()), 7);

// from: a Monday (YYYY-MM-DD). Returns { from, to, days: [{ date, day, off, rows }] }
export const weekPlanning = async (from) => {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const to = dates[6];

  const pairs = await Binomes.findAll({ where: { status: 'actif' }, raw: true });
  const ids = pairs.map((p) => p.id);
  const students = await Students.findAll({
    where: { id: [...new Set(pairs.map((p) => p.student_id))] },
    attributes: ['id', 'first_name', 'last_name', 'is_demo'],
    raw: true,
  });
  const tutors = await Users.findAll({
    where: { id: [...new Set(pairs.map((p) => p.tutor_id).filter(Boolean))] },
    attributes: ['id', 'first_name', 'last_name', 'is_demo'],
    raw: true,
  });
  const { off } = await offDayFinder();
  const breaks = await breaksOf(ids, from);
  const extras = await extrasOf(ids, from, to);
  // Room of each session of the week, and the rooms to choose from
  const rooms = await roomIndex(ids, from, to);
  const roomChoices = await activeRooms();

  const days = dates.map((date) => ({ date, day: dayOf(date), off: off(date), rows: [] }));

  for (const pair of pairs) {
    const student = students.find((x) => x.id === pair.student_id) || null;
    const tutor = tutors.find((x) => x.id === pair.tutor_id) || null;
    const isDemo = !!(student?.is_demo || tutor?.is_demo);
    // Demonstration pairs are not planned
    if (isDemo) continue;
    const base = {
      binome_id: pair.id,
      student: studentLabel(student),
      tutor: tutorLabel(tutor),
      subjects: pair.subjects || [],
      is_demo: isDemo,
      // A tutor's slot change waiting for the team
      pending_change: pair.schedule_request ? pair.schedule_request.schedule || null : null,
    };

    for (const d of days) {
      const exceptional = extraOn(extras[pair.id], d.date);
      // A replacement session takes the place of the regular one of its day
      const replaced = exceptional && exceptional.kind === 'remplacement' && exceptional.replaces_date === d.date;
      const regular = scheduleOn(pair, d.date).filter((s) => s.day === d.day);
      const holiday = d.off;
      const skipped = holiday && (holiday === 'Jour férié' || !pair.during_holidays);

      if (regular.length && !replaced) {
        if (skipped) {
          // Nothing expected on a holiday the pair does not go on in
        } else if (breakOn(breaks[pair.id], d.date)) {
          const b = breakOn(breaks[pair.id], d.date);
          d.rows.push({
            ...base,
            kind: 'pause',
            start: regular[0].startTime,
            end: regular[0].endTime,
            remote: isRemote(pair),
            remark: `En pause : ${b.reason_label}`,
          });
        } else {
          d.rows.push({
            ...base,
            kind: 'regular',
            start: regular[0].startTime,
            end: regular[0].endTime,
            remote: isRemote(pair),
            place: pair.site || pair.how_location || '',
            remark: [
              base.pending_change ? 'Changement de créneau demandé, pas encore appliqué' : null,
              // A slot that starts within this week: say so from its first day on
              newSlotSince(pair, from, to, d.date),
            ]
              .filter(Boolean)
              .join(' · '),
          });
        }
      }

      if (exceptional) {
        d.rows.push({
          ...base,
          kind: exceptional.kind === 'remplacement' ? 'remplacement' : 'supplementaire',
          start: exceptional.start_time,
          end: exceptional.end_time,
          remote: exceptional.remote,
          place: exceptional.remote ? 'À distance' : pair.site || pair.how_location || '',
          remark: exceptional.kind === 'remplacement' ? `Remplace la séance du ${d.date}` : exceptional.note || 'Séance exceptionnelle',
        });
      }
    }
  }

  for (const d of days) {
    // Room of each session; a session without one is flagged (not for pauses
    // or remote sessions)
    d.rows = d.rows.map((r) => {
      const room = rooms[`${r.binome_id}|${d.date}|${r.start}`] || null;
      return {
        ...r,
        date: d.date,
        room_id: room?.room_id ?? null,
        room_label: room?.room_label ?? null,
        needs_room: !r.remote && r.kind !== 'pause' && !room,
      };
    });
    d.rows.sort((a, b) => String(a.start).localeCompare(String(b.start)) || a.student.localeCompare(b.student));
    markRoomConflicts(d.rows);
  }

  return { from, to, days, rooms: roomChoices, total: days.reduce((n, d) => n + d.rows.length, 0) };
};

export default weekPlanning;
