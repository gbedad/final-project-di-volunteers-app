// Volunteer cohorts: one per academic year (1 September -> 31 August).
// A volunteer joins the cohort of the year they are validated, then every
// year they are still a member (status "Validé" and active tutor) the new
// year is added. Past years are never removed automatically.
import Users from '../models/users.model.js';

// First academic year offered in the admin list
export const FIRST_YEAR = 2021;

// Academic year of a date: from 1 September, e.g. 2026-10-10 -> "2026/2027"
export const academicYear = (date = new Date()) => {
  const d = new Date(date);
  const start = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}/${start + 1}`;
};

export const isAcademicYear = (value) => {
  const m = /^(\d{4})\/(\d{4})$/.exec(value || '');
  return !!m && Number(m[2]) === Number(m[1]) + 1;
};

// All years an admin can choose, oldest first, up to the current one
export const availableYears = () => {
  const current = Number(academicYear().slice(0, 4));
  const years = [];
  for (let y = FIRST_YEAR; y <= current; y++) years.push(`${y}/${y + 1}`);
  return years;
};

export const sortYears = (years) => [...new Set(years)].sort();

export const isMember = (user) =>
  user.status === 'Validé' && user.is_active === true;

// Adds the current academic year to a volunteer who is a member
export const addCurrentYear = async (user) => {
  const year = academicYear();
  const years = user.cohorte_year || [];
  if (years.includes(year)) return false;
  await Users.update(
    { cohorte_year: sortYears([...years, year]) },
    { where: { id: user.id } }
  );
  return true;
};

// Called when the status or the "active" switch changes; justValidated
// when an admin has just set the status to "Validé"
export const onMembershipChange = async (userId, { justValidated } = {}) => {
  const user = await Users.findByPk(userId, {
    attributes: ['id', 'status', 'is_active', 'cohorte_year', 'validated_at'],
  });
  if (!user) return;
  if (justValidated && user.status === 'Validé' && !user.validated_at) {
    await Users.update(
      { validated_at: new Date() },
      { where: { id: user.id } }
    );
  }
  if (isMember(user)) await addCurrentYear(user);
};

// Yearly renewal: run daily, only adds what is missing (safe to repeat)
export const renewCohorts = async () => {
  const year = academicYear();
  const members = await Users.findAll({
    where: { role: 'volunteer', status: 'Validé', is_active: true },
    attributes: ['id', 'cohorte_year'],
  });
  let added = 0;
  for (const user of members) {
    if (!(user.cohorte_year || []).includes(year)) {
      await addCurrentYear(user);
      added++;
    }
  }
  if (added) console.log(`Cohorts: ${added} volunteer(s) renewed for ${year}`);
  return added;
};

export const scheduleCohortRenewal = () => {
  const run = () =>
    renewCohorts().catch((err) =>
      console.log('Cohort renewal failed:', err.message)
    );
  setTimeout(run, 30 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
};

