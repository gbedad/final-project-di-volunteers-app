// Figures of the students module for the "Analyse" page: requests, waiting
// times, demand versus the tutors' offer, pairs and sessions
import { Op } from 'sequelize';
import Students from '../models/students/students.model.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { computeAnalytics, LEVELS } from './analytics.js';
import { STUDENT_STATUSES } from './students.js';
import { consentOverview, CONSENT_STATUSES } from './parentalConsent.js';
import { feeOf, termOf, TRANCHES } from './fees.js';

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
        'parental_consent_at',
        'qf',
        'qf_proof',
        'fee_special',
        'fee_override',
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
  // Demo students are matched against demo tutors too
  const { supply } = await computeAnalytics({ scope: 'active', includeDemo });
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

  // ---- Parental consent of the current requests ----
  const overview = Object.values(await consentOverview(students)).filter(
    (c) => c.needed
  );
  const consent = {
    signed: overview.filter((c) => c.state === 'signed' || c.state === 'paper').length,
    pending: overview.filter((c) => c.state === 'pending').length,
    missing: overview.filter((c) => c.state === 'missing').length,
    // A tutor proposed or working with the student, without the consent
    pairsWithout: overview.filter(
      (c) => c.open_pair && c.state !== 'signed' && c.state !== 'paper'
    ).length,
  };

  // ---- Participation to the costs (current requests, current term) ----
  const term = termOf(new Date());
  const currentStudents = students.filter((s) => CONSENT_STATUSES.includes(s.status));
  const feeLabel = (f) =>
    !f
      ? 'Non renseigné'
      : f.mode === 'term'
      ? `Tranche ${f.tranche}`
      : f.tranche
      ? 'Tranche 8 et plus (à l’heure)'
      : 'QF non communiqué (à l’heure)';
  const ORDER = [1, 2, 3, 4, 5, 6, 7].map((n) => `Tranche ${n}`).concat([
    'Tranche 8 et plus (à l’heure)',
    'QF non communiqué (à l’heure)',
    'Non renseigné',
  ]);
  const withFee = currentStudents.map((s) => ({ s, fee: feeOf(s) }));
  const tranches = countBy(withFee, ({ fee }) => feeLabel(fee));
  const pairStudent = Object.fromEntries(pairs.map((p) => [p.id, p.student_id]));
  const termHours = {};
  for (const x of held) {
    if (termOf(x.date).key !== term.key) continue;
    const sid = pairStudent[x.binome_id];
    termHours[sid] = (termHours[sid] || 0) + (x.duration_minutes || 0) / 60;
  }
  const round = (n) => Math.round(n * 100) / 100;
  const fees = {
    term: term.label,
    byTranche: ORDER.filter((l) => tranches[l]).map((label) => ({ label, count: tranches[label] })),
    // Every tranche, even empty: QF range, students, amounts of the term
    table: [
      ...TRANCHES.map((t, i) => ({
        key: `T${t.tranche}`,
        label: `Tranche ${t.tranche}`,
        range: i === 0 ? `QF ≤ ${t.max} €` : `${TRANCHES[i - 1].max},01 à ${t.max} €`,
        rate: `${t.term} € / trimestre · caution ${t.deposit} €`,
        count: tranches[`Tranche ${t.tranche}`] || 0,
        total: round(
          withFee
            .filter(({ fee }) => fee?.mode === 'term' && fee.tranche === t.tranche)
            .reduce((n, { fee }) => n + fee.amount, 0)
        ),
      })),
      {
        key: 'T8',
        label: 'Tranche 8 et plus',
        range: 'QF > 2 500 €',
        rate: "à l'heure, selon le niveau",
        count: tranches['Tranche 8 et plus (à l’heure)'] || 0,
      },
      {
        key: 'none',
        label: 'QF non communiqué',
        range: '—',
        rate: "à l'heure, selon le niveau",
        count: tranches['QF non communiqué (à l’heure)'] || 0,
      },
      {
        key: 'unknown',
        label: 'Non renseigné',
        range: '—',
        rate: '—',
        count: tranches['Non renseigné'] || 0,
      },
    ],
    // Fixed amounts of the term (tranches 1-7) of the students with a pair
    termTotal: round(
      withFee
        .filter(({ s, fee }) => fee?.mode === 'term' && s.status === 'Binôme en cours')
        .reduce((n, { fee }) => n + fee.amount, 0)
    ),
    deposits: round(
      withFee
        .filter(({ s, fee }) => fee?.mode === 'term' && s.status === 'Binôme en cours')
        .reduce((n, { fee }) => n + fee.deposit, 0)
    ),
    // Hourly families: hours of the session reports of this term x rate
    hourlyDue: round(
      withFee
        .filter(({ fee }) => fee?.mode === 'hourly' && fee.amount !== undefined)
        .reduce((n, { s, fee }) => n + (termHours[s.id] || 0) * fee.amount, 0)
    ),
    hourlyHours: round(
      withFee
        .filter(({ fee }) => fee?.mode === 'hourly')
        .reduce((n, { s }) => n + (termHours[s.id] || 0), 0)
    ),
    missing: withFee.filter(({ fee }) => !fee || fee.missing).length,
  };

  return { requests, gap, pairs: pairsSection, profile, consent, fees };
};
