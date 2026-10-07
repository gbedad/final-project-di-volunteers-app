// Follow-up of the pairs: figures and alerts from the session reports
import { Op } from 'sequelize';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import { notifySessionReminder } from './binomesMail.js';

// A report is expected at least once a month
export const REPORT_DAYS = 31;
// A proposal should be answered within a week
export const ANSWER_DAYS = 7;
export const ATTENDANCES = ['présent', 'absent', 'annulé'];

const DAY = 86400000;
const daysSince = (date) => (date ? Math.floor((Date.now() - new Date(date)) / DAY) : null);

// Figures and alerts of one pair, from its reports (any order)
export const pairStats = (pair, sessions) => {
  const sorted = [...sessions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const held = sorted.filter((s) => s.attendance === 'présent');
  const last = sorted[sorted.length - 1];
  // The month starts when the pair began (answer or start date)
  const since = last?.date || pair.start_date || pair.responded_at;
  const alerts = [];
  if (pair.status === 'actif' && since && daysSince(since) > REPORT_DAYS) {
    alerts.push({ type: 'no_report', label: `Pas de compte-rendu depuis ${daysSince(since)} jours` });
  }
  const lastTwo = sorted.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((s) => s.attendance === 'absent')) {
    alerts.push({ type: 'absences', label: 'Deux absences de suite' });
  }
  const marks = sorted.filter((s) => s.progress).map((s) => s.progress);
  if (marks.length >= 2) {
    const lastMark = marks[marks.length - 1];
    const before = marks.slice(-4, -1);
    const average = before.reduce((a, b) => a + b, 0) / before.length;
    if (lastMark <= 2 && lastMark < average) {
      alerts.push({ type: 'progress_down', label: 'Ressenti en baisse' });
    }
  }
  if (pair.status === 'proposé' && daysSince(pair.proposed_at) > ANSWER_DAYS) {
    alerts.push({ type: 'no_answer', label: `Sans réponse depuis ${daysSince(pair.proposed_at)} jours` });
  }
  return {
    sessions: sorted.length,
    held: held.length,
    hours: Math.round(held.reduce((n, s) => n + (s.duration_minutes || 0), 0) / 6) / 10,
    last_report: last?.date || null,
    last_progress: marks[marks.length - 1] || null,
    alerts,
  };
};

// Monthly reminder to the tutors of active pairs without a recent report
// (at most one email a week per pair)
export const remindTutors = async () => {
  const pairs = await Binomes.findAll({ where: { status: 'actif' }, raw: true });
  if (!pairs.length) return 0;
  const sessions = await Seances.findAll({
    where: { binome_id: { [Op.in]: pairs.map((p) => p.id) } },
    attributes: ['binome_id', 'date', 'attendance', 'progress', 'duration_minutes'],
    raw: true,
  });
  let sent = 0;
  for (const pair of pairs) {
    const stats = pairStats(pair, sessions.filter((s) => s.binome_id === pair.id));
    const late = stats.alerts.some((a) => a.type === 'no_report');
    if (!late || (pair.reminded_at && daysSince(pair.reminded_at) < 7)) continue;
    const tutor = await Users.findByPk(pair.tutor_id, {
      attributes: ['id', 'first_name', 'email', 'email2'],
    });
    const student = await Students.findByPk(pair.student_id, {
      attributes: ['id', 'first_name'],
    });
    if (!tutor || !student) continue;
    notifySessionReminder(tutor, student, stats.last_report);
    await Binomes.update({ reminded_at: new Date() }, { where: { id: pair.id } });
    sent += 1;
  }
  return sent;
};

// Checked every 6 hours (first run 1 minute after start)
export const scheduleSessionReminders = () => {
  const run = () =>
    remindTutors()
      .then((n) => n && console.log(`Session reminders sent: ${n}`))
      .catch((err) => console.log('Session reminders failed:', err.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
};
