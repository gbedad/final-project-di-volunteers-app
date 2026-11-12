// School calendar of Paris (zone C) and public holidays: days without
// tutoring expected, and the school returns after the holidays.
import axios from 'axios';

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const HOLIDAYS_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';

// ---- Dates (YYYY-MM-DD strings, no time zone trouble) ----
export const toDate = (s) => new Date(`${s}T12:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const dayOf = (s) => DAYS_FR[toDate(s).getUTCDay()];
export const parisDate = (value) =>
  new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
export const parisToday = () => parisDate(new Date());
// Monday of the week of that day
export const weekOf = (s) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));

// ---- Public holidays (computed) ----
const easter = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
export const publicHolidays = (year) => {
  const e = easter(year);
  return [
    `${year}-01-01`,
    addDays(e, 1), // Lundi de Pâques
    `${year}-05-01`,
    `${year}-05-08`,
    addDays(e, 39), // Ascension
    addDays(e, 50), // Lundi de Pentecôte
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ];
};

// ---- School holidays of Paris (zone C), from the ministry, kept a day ----
let schoolCache = { at: 0, periods: null };
export const schoolHolidays = async () => {
  if (schoolCache.periods && Date.now() - schoolCache.at < 24 * 3600 * 1000) {
    return schoolCache.periods;
  }
  const { data } = await axios.get(HOLIDAYS_URL, {
    params: {
      select: 'description,start_date,end_date,population',
      where: 'location="Paris"',
      limit: 100,
    },
    timeout: 8000,
  });
  // start: first day without school; end: the day school starts again
  // (a one-day bridge has end = start)
  const periods = (data.results || [])
    .filter((r) => r.population !== 'Enseignants')
    .map((r) => {
      const start = parisDate(r.start_date);
      const end = parisDate(r.end_date);
      return { label: r.description, start, end: end > start ? end : addDays(start, 1) };
    });
  schoolCache = { at: Date.now(), periods };
  return periods;
};

// Day without tutoring expected: label of the holiday, or null
export const offDayFinder = async () => {
  let periods = [];
  let calendarOk = true;
  try {
    periods = await schoolHolidays();
  } catch (err) {
    console.log('School holidays not loaded:', err.message);
    calendarOk = false;
  }
  const holidays = new Set();
  const years = new Set();
  return {
    calendarOk,
    off: (s) => {
      const year = Number(s.slice(0, 4));
      if (!years.has(year)) {
        publicHolidays(year).forEach((d) => holidays.add(d));
        years.add(year);
      }
      if (holidays.has(s)) return 'Jour férié';
      const p = periods.find((x) => s >= x.start && s < x.end);
      return p ? p.label : null;
    },
  };
};

// School returns after holidays of a week or more: { label, start, back }
// (back: the day school starts again)
export const schoolReturns = async () =>
  (await schoolHolidays())
    .filter((p) => (toDate(p.end) - toDate(p.start)) / 86400000 >= 7)
    .map((p) => ({ label: p.label, start: p.start, back: p.end }))
    .sort((a, b) => (a.back < b.back ? -1 : 1));
