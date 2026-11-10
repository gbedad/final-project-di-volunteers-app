// Slots of a pair over time: binomes.schedule is the current one;
// schedule_history keeps each slot and the day it applies from, so that a
// change of slot does not rewrite the past
const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const dayOf = (date) => DAYS_FR[new Date(`${String(date).slice(0, 10)}T12:00:00Z`).getUTCDay()];

const sorted = (history) =>
  [...(history || [])].sort((a, b) => String(a.since || '').localeCompare(String(b.since || '')));

// Slots of the pair on that date (YYYY-MM-DD)
export const scheduleOn = (pair, date) => {
  const history = sorted(pair.schedule_history);
  if (!history.length) return pair.schedule || [];
  const day = String(date).slice(0, 10);
  const current = history.filter((h) => !h.since || h.since <= day).pop();
  // Before the first known slot: the oldest one
  return (current || history[0]).schedule || [];
};

// Slot of that date (first one of that day), or null
export const slotOn = (pair, date) => scheduleOn(pair, date).find((s) => s.day === dayOf(date)) || null;

// New slots from a day on: earlier slots are kept for the earlier dates
export const withNewSchedule = (pair, schedule, since) => {
  const history = sorted(pair.schedule_history).filter((h) => !since || !h.since || h.since < since);
  if (!history.length) history.push({ since: null, schedule: pair.schedule || [] });
  if (since) history.push({ since, schedule });
  else history.splice(0, history.length, { since: null, schedule });
  const latest = sorted(history).pop();
  return { schedule: latest.schedule, schedule_history: history };
};
