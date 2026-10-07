// Figures of the students module for the "Analyse" page: requests, waiting
// times, demand versus the tutors' offer, pairs and sessions
import { Op } from 'sequelize';
import Students from '../models/students/students.model.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { computeAnalytics, LEVELS } from './analytics.js';
import { STUDENT_STATUSES } from './students.js';

const DAY = 86400000;
const WAITING = ['Nouvelle demande', 'En attente de tuteur'];
const days = (from, to = new Date()) => (new Date(to) - new Date(from)) / DAY;
const average = (values) =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const countBy = (items, key) =>
  items.reduce((acc, item) => {
    const k = key(item) || 'Non renseigné';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
const toList = (counts) =>
  Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
const monthOf = (date) => String(date).slice(0, 7);

export const computeStudentAnalytics = async ({ includeDemo = false } = {}) => {
  const students = (
    await Students.findAll({
      where: includeDemo ? {} : { is_demo: { [Op.not]: true } },
      attributes: [
        'id',
        'status',
        'priority',
        'level',
        'school',
        'topics',
        'referral_source',
        'created_at',
        'is_demo',
      ],
    })
  ).map((s) => s.toJSON());
  const ids = students.map((s) => s.id);
  const pairs = ids.length
    ? await Binomes.findAll({ where: { student_id: { [Op.in]: ids } }, raw: true })
    : [];
  const sessions = pairs.length
    ? await Seances.findAll({
        where: { binome_id: { [Op.in]: pairs.map((p) => p.id) } },
        raw: true,
      })
    : [];

  // ---- Requests ----
  const waiting = students.filter((s) => WAITING.includes(s.status));
  const firstAnswer = {};
  for (const p of pairs.filter((x) => x.responded_at && x.status !== 'refusé')) {
    const prev = firstAnswer[p.student_id];
    if (!prev || p.responded_at < prev) firstAnswer[p.student_id] = p.responded_at;
  }
  const requests = {
    total: students.length,
    demo: students.filter((s) => s.is_demo).length,
    byStatus: STUDENT_STATUSES.map((status) => ({
      label: status,
      count: students.filter((s) => s.status === status).length,
    })),
    byPriority: toList(countBy(waiting, (s) => s.priority)),
    waiting: waiting.length,
    // Students still waiting: for how long, on average
    waitingDays: average(waiting.map((s) => days(s.created_at))),
    // Request to the tutor's "yes", for the students who have a tutor
    daysToTutor: average(
      students
        .filter((s) => firstAnswer[s.id])
        .map((s) => days(s.created_at, firstAnswer[s.id]))
    ),
  };

  // ---- Demand (waiting students) versus offer (active tutors) ----
  const { supply } = await computeAnalytics({ scope: 'active' });
  const demand = {};
  for (const s of waiting) {
    if (!LEVELS.includes(s.level)) continue;
    for (const t of s.topics || []) {
      if (!t?.subject) continue;
      demand[t.subject] = demand[t.subject] || {};
      demand[t.subject][s.level] = (demand[t.subject][s.level] || 0) + 1;
    }
  }
  const demandSubjects = Object.keys(demand).sort((a, b) => a.localeCompare(b, 'fr'));
  const demandLevels = LEVELS.filter((l) =>
    demandSubjects.some((subject) => demand[subject][l])
  );
  const gap = {
    subjects: demandSubjects,
    levels: demandLevels,
    cells: Object.fromEntries(
      demandSubjects.map((subject) => [
        subject,
        Object.fromEntries(
          demandLevels.map((level) => [
            level,
            {
              students: demand[subject][level] || 0,
              tutors: supply.matrix[subject]?.[level] || 0,
            },
          ])
        ),
      ])
    ),
  };

  // ---- Pairs and sessions ----
  const held = sessions.filter((s) => s.attendance === 'présent');
  const absent = sessions.filter((s) => s.attendance === 'absent');
  const marks = sessions.filter((s) => s.progress);
  const hoursByMonth = {};
  for (const s of held) {
    const m = monthOf(s.date);
    hoursByMonth[m] = (hoursByMonth[m] || 0) + (s.duration_minutes || 0) / 60;
  }
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    months.push({ month: key, hours: Math.round((hoursByMonth[key] || 0) * 10) / 10 });
  }
  const pairsSection = {
    byStatus: toList(countBy(pairs, (p) => p.status)),
    active: pairs.filter((p) => p.status === 'actif').length,
    sessions: sessions.length,
    hours: Math.round(held.reduce((n, s) => n + (s.duration_minutes || 0), 0) / 6) / 10,
    // Sessions held out of the planned ones (cancelled ones not counted)
    attendance: held.length + absent.length
      ? Math.round((held.length / (held.length + absent.length)) * 100)
      : null,
    progress: marks.length
      ? Math.round((marks.reduce((n, s) => n + s.progress, 0) / marks.length) * 10) / 10
      : null,
    hoursByMonth: months,
    endReasons: pairs
      .filter((p) => p.status === 'terminé' && p.end_reason)
      .map((p) => p.end_reason),
    declineReasons: pairs
      .filter((p) => p.status === 'refusé' && p.decline_reason)
      .map((p) => p.decline_reason),
  };

  // ---- Who the students are ----
  const profile = {
    byLevel: LEVELS.map((level) => ({
      label: level,
      count: students.filter((s) => s.level === level).length,
    })).filter((x) => x.count),
    byRep: toList(
      countBy(students, (s) =>
        s.school ? s.school.rep || 'Hors éducation prioritaire' : null
      )
    ),
    bySchool: toList(countBy(students, (s) => s.school?.name)).slice(0, 10),
    byReferral: toList(countBy(students, (s) => s.referral_source)),
  };

  return { requests, gap, pairs: pairsSection, profile };
};
