// Can a tutor take a new student now? Computed, never entered by hand:
// validated, "Mes disponibilités" filled in, a place left, and not
// unavailable for a while (date chosen by the tutor or the team)
import { Op } from 'sequelize';
import Binomes from '../models/binomes.model.js';
import { placesFilled } from './application.js';
import { OPEN_PAIR_STATUSES } from './matching.js';

const hasItems = (v) => Array.isArray(v) && v.length > 0;
const today = () => new Date().toISOString().slice(0, 10);

// Number of pairs using a place, per tutor: { [tutorId]: n }
export const usedPlaces = async (tutorIds) => {
  if (!tutorIds.length) return {};
  const rows = await Binomes.findAll({
    where: { tutor_id: { [Op.in]: tutorIds }, status: { [Op.in]: OPEN_PAIR_STATUSES } },
    attributes: ['tutor_id'],
    raw: true,
  });
  return rows.reduce((acc, r) => {
    acc[r.tutor_id] = (acc[r.tutor_id] || 0) + 1;
    return acc;
  }, {});
};

// user: { status, unavailable_until, skill }; used: pairs in progress
// state: available | full | incomplete | paused | not_validated | archived
export const availabilityOf = (user, used = 0) => {
  const skill = user.skill || {};
  const total = Number(skill.number_of_students) || 1;
  const free = Math.max(0, total - used);
  const base = { total, used, free, until: null };
  if (user.status === 'Archivé') return { ...base, state: 'archived' };
  if (user.status !== 'Validé') return { ...base, state: 'not_validated' };
  const missing = [
    !hasItems(skill.topics) && 'matières',
    !hasItems(skill.when_day_slot) && 'créneaux',
    !placesFilled(skill) && 'lieux',
  ].filter(Boolean);
  if (missing.length) return { ...base, state: 'incomplete', missing };
  if (user.unavailable_until && String(user.unavailable_until) >= today()) {
    return { ...base, state: 'paused', until: user.unavailable_until };
  }
  if (!free) return { ...base, state: 'full' };
  return { ...base, state: 'available' };
};

export const isPaused = (user) =>
  !!user.unavailable_until && String(user.unavailable_until) >= today();
