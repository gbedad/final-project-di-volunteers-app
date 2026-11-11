// "Tuteur actif": computed, not set by hand — a tutor is active while they
// have a pair in progress (active or paused; a proposal does not count yet).
// Called after every change of a pair.
import { Op } from 'sequelize';
import Binomes from '../models/binomes.model.js';
import Users from '../models/users.model.js';
import { onMembershipChange } from './cohorts.js';

export const IN_PROGRESS = ['actif', 'en pause'];

export const syncTutorActive = async (tutorId) => {
  if (!tutorId) return null;
  const open = await Binomes.count({ where: { tutor_id: tutorId, status: { [Op.in]: IN_PROGRESS } } });
  const active = open > 0;
  const [changed] = await Users.update(
    { is_active: active },
    { where: { id: tutorId, role: 'volunteer', is_active: { [Op.not]: active } } }
  );
  // Becoming active: validation date and cohort of the year
  if (changed) await onMembershipChange(tutorId);
  return active;
};
