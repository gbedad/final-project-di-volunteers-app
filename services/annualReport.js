// Annual report for the funders: one school year (1 September - 31 August,
// up to today for the current one), demonstration people left out.
import { Op } from 'sequelize';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { feeOf } from './fees.js';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const round1 = (n) => Math.round(n * 10) / 10;
const hoursOf = (sessions) => round1(sessions.reduce((n, s) => n + (s.duration_minutes || 0), 0) / 60);
const countBy = (items, key) => {
  const out = {};
  for (const i of items) {
    const k = key(i);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
};
const list = (counts, order) =>
  (order || Object.keys(counts).sort((a, b) => counts[b] - counts[a]))
    .filter((k) => counts[k])
    .map((label) => ({ label, count: counts[label] }));

const CYCLES = [
  ['Primaire', ['CP', 'CE1', 'CE2', 'CM1', 'CM2']],
  ['Collège', ['6ème', '5ème', '4ème', '3ème']],
  ['Lycée', ['Seconde', 'Première', 'Terminale']],
  ['Supérieur', ['L1', 'L2', 'L3']],
];
const LEVEL_ORDER = CYCLES.flatMap(([, l]) => l);
const cycleOf = (level) => CYCLES.find(([, l]) => l.includes(level))?.[0] || 'Non renseigné';
const QF_ORDER = [1, 2, 3, 4, 5, 6, 7].map((n) => `Tranche ${n}`).concat([
  'Tranche 8 et plus',
  'QF non communiqué',
  'Non renseigné',
]);
const qfLabel = (s) => {
  const fee = feeOf(s);
  if (s.qf_proof === 'none') return 'QF non communiqué';
  if (!fee || fee.tranche === undefined || fee.tranche === null) return 'Non renseigné';
  return fee.tranche <= 7 ? `Tranche ${fee.tranche}` : 'Tranche 8 et plus';
};

// Directory names of primary schools ("E.E.PU GERTY ARCHIMEDE 5 rue
// Gerty Archimède") as people say them ("École élémentaire Gerty Archimède")
const SCHOOL_KINDS = { 'E.E.PU': 'École élémentaire', 'E.E.A.PU': 'École élémentaire', 'E.M.PU': 'École maternelle', 'E.P.PU': 'École primaire', 'E.P.PR': 'École primaire privée' };
const schoolName = (name) => {
  const m = /^(E\.[A-Z.]+)\s+(.+?)(?:\s+\d.*)?$/.exec(name || '');
  if (!m || !SCHOOL_KINDS[m[1]]) return name;
  const words = m[2].toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (x, a, b) => a + b.toUpperCase());
  return `${SCHOOL_KINDS[m[1]]} ${words}`;
};

// "2026-2027" -> { from, to } (to: today at most)
export const yearRange = (year) => {
  const y = Number(String(year).slice(0, 4));
  const from = `${y}-09-01`;
  const end = `${y + 1}-08-31`;
  return { year: `${y}-${y + 1}`, from, to: end < today() ? end : today(), complete: end < today() };
};
export const currentYear = () => {
  const [y, m] = today().split('-').map(Number);
  return `${m >= 9 ? y : y - 1}-${m >= 9 ? y + 1 : y}`;
};

export const annualReport = async (year = currentYear()) => {
  const { from, to, complete, year: label } = yearRange(year);

  const students = await Students.findAll({
    where: { is_demo: { [Op.not]: true } },
    attributes: ['id', 'level', 'school', 'qf', 'qf_proof', 'fee_special', 'fee_override', 'fee_term', 'created_at', 'zipcode', 'city', 'status'],
    raw: true,
  });
  const studentOf = Object.fromEntries(students.map((s) => [s.id, s]));
  const tutors = await Users.findAll({
    where: { role: 'volunteer', is_demo: { [Op.not]: true } },
    attributes: ['id', 'validated_at', 'status'],
    raw: true,
  });
  const tutorOf = Object.fromEntries(tutors.map((t) => [t.id, t]));

  // Pairs that ran during the year (from their start to their end)
  const day = (d) => (d ? new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) : null);
  const pairs = (
    await Binomes.findAll({ where: { status: { [Op.in]: ['actif', 'en pause', 'terminé'] } }, raw: true })
  ).filter((p) => {
    if (!studentOf[p.student_id] || !tutorOf[p.tutor_id]) return false;
    const start = String(p.start_date || day(p.responded_at) || day(p.proposed_at));
    const end = p.ended_at ? day(p.ended_at) : null;
    return start <= to && (!end || end >= from);
  });
  const pairOf = Object.fromEntries(pairs.map((p) => [p.id, p]));
  const sessions = (
    await Seances.findAll({
      where: { date: { [Op.between]: [from, to] }, binome_id: { [Op.in]: pairs.map((p) => p.id) } },
      raw: true,
    })
  ).filter((s) => pairOf[s.binome_id]);
  const held = sessions.filter((s) => s.attendance === 'présent');
  const absent = sessions.filter((s) => s.attendance === 'absent');

  const served = [...new Set(pairs.map((p) => p.student_id))].map((id) => studentOf[id]);
  const tutorIds = [...new Set(pairs.map((p) => p.tutor_id))];
  const remote = held.filter((s) => s.zoom_key || /^\s*(à|a) distance\s*$/i.test(pairOf[s.binome_id].how_location || ''));

  // Hours by subject: a pair's hours shared between its subjects
  const bySubject = {};
  for (const s of held) {
    const subjects = pairOf[s.binome_id].subjects?.length ? pairOf[s.binome_id].subjects : ['Non renseigné'];
    for (const sub of subjects) bySubject[sub] = (bySubject[sub] || 0) + (s.duration_minutes || 0) / 60 / subjects.length;
  }
  const byMonth = {};
  for (const s of held) {
    const m = String(s.date).slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (s.duration_minutes || 0) / 60;
  }

  const schools = served.filter((s) => s.school?.name);
  const qfs = served.filter((s) => s.qf !== null && s.qf !== undefined && s.qf_proof !== 'none').map((s) => Number(s.qf)).sort((a, b) => a - b);
  const median = qfs.length ? (qfs.length % 2 ? qfs[(qfs.length - 1) / 2] : (qfs[qfs.length / 2 - 1] + qfs[qfs.length / 2]) / 2) : null;

  return {
    year: label,
    from,
    to,
    complete,
    figures: {
      students: served.length,
      tutors: tutorIds.length,
      tutors_with_sessions: new Set(held.map((s) => pairOf[s.binome_id].tutor_id)).size,
      pairs: pairs.length,
      sessions: held.length,
      hours: hoursOf(held),
      remote_hours: hoursOf(remote),
      absences: absent.length,
      absence_rate: held.length + absent.length ? Math.round((absent.length * 100) / (held.length + absent.length)) : null,
      waiting_now: students.filter((s) => ['Nouvelle demande', 'En attente de tuteur'].includes(s.status)).length,
    },
    cycles: list(countBy(served, (s) => cycleOf(s.level)), [...CYCLES.map(([c]) => c), 'Non renseigné']),
    levels: list(countBy(served, (s) => s.level || 'Non renseigné'), [...LEVEL_ORDER, 'Non renseigné']),
    schools: {
      count: new Set(schools.map((s) => s.school.uai || s.school.name)).size,
      priority: list(
        countBy(served, (s) =>
          !s.school?.name ? 'Établissement non renseigné' : s.school.rep ? s.school.rep : 'Hors éducation prioritaire'
        ),
        ['REP+', 'REP', 'Hors éducation prioritaire', 'Établissement non renseigné']
      ),
      sector: list(countBy(served, (s) => s.school?.sector || 'Non renseigné'), ['Public', 'Privé', 'Non renseigné']),
      top: list(countBy(schools, (s) => schoolName(s.school.name))).slice(0, 8),
    },
    qf: {
      tranches: list(countBy(served, qfLabel), QF_ORDER),
      median,
      known: qfs.length,
    },
    subjects: Object.entries(bySubject)
      .map(([label, h]) => ({ label, hours: round1(h) }))
      .sort((a, b) => b.hours - a.hours),
    months: Object.entries(byMonth)
      .sort()
      .map(([month, h]) => ({ month, hours: round1(h) })),
  };
};
