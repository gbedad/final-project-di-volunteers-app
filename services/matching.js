// Tutors who fit a student: subjects and level, a common slot, a compatible
// place, and room left (number of students the tutor can follow)
import { Op } from 'sequelize';
import Users from '../models/users.model.js';
import Binomes from '../models/binomes.model.js';
import { LEVELS } from './analytics.js';
import { isPaused } from './availability.js';

// Pairs that use one of the tutor's places
export const OPEN_PAIR_STATUSES = ['proposé', 'actif', 'en pause'];

const parse = (value) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
const SUBJECT_ALIASES = { maths: 'mathematiques', math: 'mathematiques' };
const subjectKey = (s) => SUBJECT_ALIASES[norm(s)] || norm(s);
// "Physique" fits "Physique-Chimie" and the other way round
const subjectFits = (wanted, taught) => {
  const a = subjectKey(wanted);
  const b = subjectKey(taught);
  if (a === b) return true;
  return a.split('-').some((p) => b.split('-').includes(p));
};
const levelIndex = (label) => {
  const l = norm(String(label || '').replace(/^(\d)e$/i, '$1ème'));
  return LEVELS.findIndex((x) => norm(x) === l);
};
const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Places: a tutor or student may work remotely, on given sites, or both
const REMOTE_WORDS = /distance|distanciel/i;
const remoteOk = (how, places = []) =>
  REMOTE_WORDS.test(how || '') || places.some((p) => REMOTE_WORDS.test(p));
const sitesOf = (places = []) =>
  places.filter((p) => p && !REMOTE_WORDS.test(p) && !/^-+$/.test(p));
// "22 rue Gabriel Lamé, Paris 12ème" is in "Paris 12ème"
const sameSite = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};
const studentNeedsSite = (how) => /sur site|hybride/i.test(how || '');
const studentRemoteOk = (how) => /distance/i.test(how || '');

// Common slots of at least one hour, the same day
export const commonSlots = (studentSlots = [], tutorSlots = []) => {
  const result = [];
  for (const s of studentSlots.map(parse).filter(Boolean)) {
    for (const t of tutorSlots.map(parse).filter(Boolean)) {
      if (!s.day || s.day !== t.day) continue;
      const start = Math.max(minutes(s.startTime), minutes(t.startTime));
      const end = Math.min(minutes(s.endTime), minutes(t.endTime));
      if (start !== null && end !== null && end - start >= 60) {
        result.push({ day: s.day, startTime: hhmm(start), endTime: hhmm(end) });
      }
    }
  }
  return result;
};

const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ');

export const findTutors = async (student, { scope = 'active' } = {}) => {
  const where = { role: 'volunteer', status: 'Validé' };
  if (scope === 'active') where.is_active = true;
  const tutors = await Users.findAll({
    where,
    attributes: [
      'id',
      'first_name',
      'last_name',
      'email',
      'is_active',
      'city',
      'unavailable_until',
    ],
    include: ['skill'],
  });
  const openPairs = await Binomes.findAll({
    where: {
      tutor_id: { [Op.in]: tutors.map((t) => t.id) },
      status: { [Op.in]: OPEN_PAIR_STATUSES },
    },
    attributes: ['tutor_id', 'student_id'],
  });
  const studentLevel = levelIndex(student.level);
  const wanted = (student.topics || []).filter((t) => t?.subject);

  // Tutors unavailable for a while are not proposed
  const results = tutors.filter((t) => !isPaused(t)).map((tutor) => {
    const skill = tutor.skill || {};
    const topics = (skill.topics || []).map(parse).filter(Boolean);
    // Subjects: taught by the tutor at the student's level
    const subjects = wanted.map((w) => {
      const fit = topics.some((t) => {
        if (!subjectFits(w.subject, t.subject)) return false;
        if (studentLevel === -1) return true;
        let from = levelIndex(t.classStart);
        let to = levelIndex(t.classEnd);
        if (from === -1) from = to;
        if (to === -1) to = from;
        return from !== -1 && from <= studentLevel && to >= studentLevel;
      });
      return { subject: w.subject, priority: w.priority, fit };
    });
    const slots = commonSlots(student.when_day_slot || [], skill.when_day_slot || []);
    const tutorPlaces = skill.where_location || [];
    const tutorRemote = remoteOk(skill.how_location, tutorPlaces);
    const tutorSites = sitesOf(tutorPlaces);
    const commonSites = sitesOf(student.where_location || []).filter((s) =>
      tutorSites.some((t) => sameSite(s, t))
    );
    const remote = studentRemoteOk(student.how_location) && tutorRemote;
    const place = {
      fit:
        remote ||
        commonSites.length > 0 ||
        (!student.how_location && !studentNeedsSite(student.how_location)),
      remote,
      sites: commonSites,
    };
    const capacity = Number(skill.number_of_students) || 1;
    const used = openPairs.filter((p) => p.tutor_id === tutor.id);
    const alreadyPaired = used.some((p) => p.student_id === student.id);
    const free = Math.max(0, capacity - used.length);

    // Score out of 100: subjects first (priority subjects count double)
    const weight = (s) => (s.priority === 'haute' ? 2 : 1);
    const total = subjects.reduce((n, s) => n + weight(s), 0) || 1;
    const covered = subjects.filter((s) => s.fit).reduce((n, s) => n + weight(s), 0);
    const score = Math.round(
      50 * (covered / total) +
        (slots.length ? 30 : 0) +
        (place.fit ? 15 : 0) +
        (free > 0 ? 5 : 0)
    );
    return {
      tutor: {
        id: tutor.id,
        name: fullName(tutor),
        email: tutor.email,
        is_active: !!tutor.is_active,
      },
      score,
      subjects,
      slots,
      place,
      capacity: { total: capacity, used: used.length, free },
      alreadyPaired,
      profileFilled: topics.length > 0,
    };
  });

  return results
    .filter((r) => r.subjects.some((s) => s.fit) && !r.alreadyPaired)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
};
