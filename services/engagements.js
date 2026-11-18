// What a volunteer does for the association: tutoring, and/or going with
// the children on the outings (cultural, scientific activities…). The
// volunteer ticks his wishes; the team decides in the end.
import Users from '../models/users.model.js';

export const ENGAGEMENTS = ['tutorat', 'culture', 'sciences'];
export const OUTING_PERIODS = ['semaine', 'weekend', 'vacances'];

// Only known values, once each; null when nothing valid is given
export const cleanList = (value, allowed) => {
  if (!Array.isArray(value)) return null;
  const list = allowed.filter((x) => value.includes(x));
  return list.length ? list : null;
};

// What counts: the team's choice, else the wishes; before the activities
// existed every volunteer was a tutor
export const engagementsOf = (user) =>
  (user?.engagements?.length && user.engagements) ||
  (user?.engagements_wished?.length && user.engagements_wished) ||
  ['tutorat'];

// Tutor: full application (wishes, CV, convention…), proposed for pairs
export const isTutor = (user) => engagementsOf(user).includes('tutorat');

export const isTutorId = async (id) =>
  isTutor(await Users.findByPk(id, { attributes: ['id', 'engagements', 'engagements_wished'] }));
