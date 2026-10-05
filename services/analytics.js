// Figures for the admin "Analyse" page, computed from the volunteers and
// their skills (read only)
import Users from '../models/users.model.js';
import StatusChanges from '../models/statusChanges.model.js';

export const LEVELS = [
  'CP',
  'CE1',
  'CE2',
  'CM1',
  'CM2',
  '6ème',
  '5ème',
  '4ème',
  '3ème',
  'Seconde',
  'Première',
  'Terminale',
  'L1',
  'L2',
  'L3',
];
export const DAYS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];
// Hours shown in the availability grid: 7h-8h ... 21h-22h
export const HOURS = Array.from({ length: 15 }, (_, i) => 7 + i);

// Statuses before the application is sent, and the following ones
const SENT = ['A interviewer', 'A finaliser', 'Validé', 'A conserver'];
const INTERVIEWED = ['A finaliser', 'Validé', 'A conserver'];
const IN_PROGRESS = [
  'Compte créé',
  'A renseigner',
  'Renseigné',
  'A télécharger',
  'A interviewer',
  'A finaliser',
];
// A candidate without any change for this long is listed as stuck
export const STUCK_DAYS = 30;

const parse = (value) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const hasItems = (value) => Array.isArray(value) && value.length > 0;
const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ');

// Spellings found in the data: "Maths", "3e", "6e"…
const SUBJECTS = { maths: 'Mathématiques', math: 'Mathématiques' };
const subjectLabel = (s) => {
  const label = String(s || '').trim();
  return SUBJECTS[label.toLowerCase()] || label;
};
const levelIndex = (label) => {
  const l = String(label || '')
    .trim()
    .replace(/^(\d)e$/i, '$1ème')
    .toLowerCase();
  return LEVELS.findIndex((x) => x.toLowerCase() === l);
};
const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const profileOf = (user) => {
  const skill = user.skill || {};
  return {
    topics: (skill.topics || []).map(parse).filter(Boolean),
    slots: (skill.when_day_slot || []).map(parse).filter(Boolean),
    places: hasItems(skill.where_location)
      ? skill.where_location
      : skill.how_location
        ? [skill.how_location]
        : [],
    students: skill.number_of_students,
  };
};

// Who is concerned: active tutors, every validated volunteer, or everyone
const SCOPES = {
  active: (u) => u.is_active === true,
  validated: (u) => u.status === 'Validé',
  all: () => true,
};

const tutorsSection = (tutors) => {
  const rows = tutors.map((u) => {
    const p = profileOf(u);
    return {
      id: u.id,
      name: fullName(u),
      email: u.email,
      topics: p.topics.length > 0,
      slots: p.slots.length > 0,
      places: p.places.length > 0,
    };
  });
  const complete = rows.filter((r) => r.topics && r.slots && r.places);
  return {
    total: rows.length,
    complete: complete.length,
    missing: {
      topics: rows.filter((r) => !r.topics).length,
      slots: rows.filter((r) => !r.slots).length,
      places: rows.filter((r) => !r.places).length,
    },
    incomplete: rows
      .filter((r) => !(r.topics && r.slots && r.places))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
};

const supplySection = (tutors) => {
  // subject -> level -> Set of tutor ids
  const matrix = {};
  // day -> hour -> Set of tutor ids
  const slots = Object.fromEntries(DAYS.map((d) => [d, {}]));
  const places = {};
  let capacity = 0;
  let withProfile = 0;

  for (const user of tutors) {
    const p = profileOf(user);
    if (p.topics.length || p.slots.length) withProfile += 1;
    for (const t of p.topics) {
      const subject = subjectLabel(t.subject);
      if (!subject) continue;
      let start = levelIndex(t.classStart);
      let end = levelIndex(t.classEnd);
      if (start === -1) start = end;
      if (end === -1) end = start;
      if (start === -1) continue;
      matrix[subject] = matrix[subject] || {};
      for (let i = start; i <= end; i++) {
        (matrix[subject][LEVELS[i]] =
          matrix[subject][LEVELS[i]] || new Set()).add(user.id);
      }
    }
    for (const s of p.slots) {
      const from = minutes(s.startTime);
      const to = minutes(s.endTime);
      if (!slots[s.day] || from === null || to === null) continue;
      for (const h of HOURS) {
        // Free for the whole hour
        if (from <= h * 60 && to >= (h + 1) * 60) {
          (slots[s.day][h] = slots[s.day][h] || new Set()).add(user.id);
        }
      }
    }
    for (const place of new Set(p.places)) {
      places[place] = (places[place] || 0) + 1;
    }
    if (p.topics.length) capacity += Number(p.students) || 1;
  }

  const count = (obj) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.size]));
  return {
    withProfile,
    capacity,
    levels: LEVELS,
    days: DAYS,
    hours: HOURS,
    subjects: Object.keys(matrix).sort((a, b) => a.localeCompare(b, 'fr')),
    matrix: Object.fromEntries(
      Object.entries(matrix).map(([s, levels]) => [s, count(levels)])
    ),
    slots: Object.fromEntries(
      Object.entries(slots).map(([d, hours]) => [d, count(hours)])
    ),
    places: Object.entries(places)
      .map(([label, n]) => ({ label, count: n }))
      .sort((a, b) => b.count - a.count),
  };
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const daysBetween = (a, b) =>
  Math.max(0, (new Date(b) - new Date(a)) / 86400000);

// Time spent between the steps, from the status history (recorded since
// the history exists, so the figures build up over time)
const durationsSection = (volunteers, changes) => {
  const firstReached = {};
  for (const c of changes) {
    const key = `${c.user_id}:${c.to_status}`;
    if (!firstReached[key] || c.changed_at < firstReached[key]) {
      firstReached[key] = c.changed_at;
    }
  }
  const toSent = [];
  const toValidated = [];
  for (const u of volunteers) {
    const sent = firstReached[`${u.id}:A interviewer`];
    const validated = firstReached[`${u.id}:Validé`];
    if (sent) toSent.push(daysBetween(u.created_at, sent));
    if (sent && validated && validated >= sent) {
      toValidated.push(daysBetween(sent, validated));
    }
  }
  const round = (v) => (v === null ? null : Math.round(v));
  return {
    since: changes.length
      ? changes.reduce(
          (min, c) => (c.changed_at < min ? c.changed_at : min),
          changes[0].changed_at
        )
      : null,
    changes: changes.length,
    registrationToSent: { days: round(median(toSent)), count: toSent.length },
    sentToValidated: {
      days: round(median(toValidated)),
      count: toValidated.length,
    },
  };
};

const monthOf = (date) => new Date(date).toISOString().slice(0, 7);

const recruitmentSection = (volunteers, changes) => {
  const funnel = [
    { stage: 'Inscrits', count: volunteers.length },
    {
      stage: 'Dossier envoyé',
      count: volunteers.filter((u) => SENT.includes(u.status)).length,
    },
    {
      stage: 'Entretien passé',
      count: volunteers.filter((u) => INTERVIEWED.includes(u.status)).length,
    },
    {
      stage: 'Validés',
      count: volunteers.filter((u) => u.status === 'Validé').length,
    },
  ];

  // Every month from the first sign-up to now, empty months included
  const byMonth = {};
  for (const u of volunteers) {
    const m = monthOf(u.created_at);
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  const months = [];
  const first = Object.keys(byMonth).sort()[0];
  if (first) {
    const d = new Date(`${first}-01T00:00:00Z`);
    const last = monthOf(new Date());
    while (monthOf(d) <= last) {
      const m = monthOf(d);
      months.push({ month: m, count: byMonth[m] || 0 });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }

  const missions = {};
  for (const u of volunteers) {
    const title = u.mission?.title || 'Sans mission';
    const m = (missions[title] = missions[title] || {
      mission: title,
      registered: 0,
      sent: 0,
      validated: 0,
    });
    m.registered += 1;
    if (SENT.includes(u.status)) m.sent += 1;
    if (u.status === 'Validé') m.validated += 1;
  }

  const now = Date.now();
  const stuck = volunteers
    .filter((u) => IN_PROGRESS.includes(u.status))
    .map((u) => ({
      id: u.id,
      name: fullName(u),
      status: u.status,
      since: u.updated_at,
      days: Math.floor((now - new Date(u.updated_at)) / 86400000),
    }))
    .filter((u) => u.days >= STUCK_DAYS)
    .sort((a, b) => b.days - a.days);

  return {
    funnel,
    declined: volunteers.filter((u) => u.status === 'Déclinée').length,
    byMonth: months,
    byMission: Object.values(missions).sort(
      (a, b) => b.registered - a.registered
    ),
    stuck,
    stuckDays: STUCK_DAYS,
    durations: durationsSection(volunteers, changes),
  };
};

export const computeAnalytics = async ({ scope = 'active' } = {}) => {
  const records = await Users.findAll({
    where: { role: 'volunteer' },
    attributes: [
      'id',
      'first_name',
      'last_name',
      'email',
      'status',
      'is_active',
      'created_at',
      'updated_at',
    ],
    include: ['skill', 'mission'],
  });
  // Plain objects: the timestamps are only readable this way
  const volunteers = records.map((r) => r.toJSON());
  // The history table may not exist yet (before its migration)
  const changes = await StatusChanges.findAll({ raw: true }).catch(() => []);
  const inScope = SCOPES[scope] || SCOPES.active;
  const tutors = volunteers.filter(inScope);
  return {
    scope: SCOPES[scope] ? scope : 'active',
    tutors: tutorsSection(tutors),
    supply: supplySection(tutors),
    recruitment: recruitmentSection(volunteers, changes),
  };
};
