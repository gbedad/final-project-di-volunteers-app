// Cultural activities (outings), apart from the tutoring: the outing, its
// registrations (students of the base), the adults who go, the budget, and
// the presences ticked by the adults through their own link.
import crypto from 'crypto';
import db from '../config/database.js';

export const ACTIVITY_STATUSES = ['brouillon', 'ouverte', 'complète', 'passée', 'annulée'];
export const REGISTRATION_STATUSES = ['inscrit', 'attente', 'désisté'];
export const PAYMENT_METHODS = ['espèces', 'chèque', 'virement', 'carte', 'autre'];
const STAFF_ROLES = ['responsable', 'accompagnateur'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// The adults' link works from the day before to two days after the outing
const LINK_DAYS_BEFORE = 1;
const LINK_DAYS_AFTER = 2;

const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const one = async (sql, replacements) => (await q(sql, replacements))[0] || null;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const parisToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const newToken = () => crypto.randomBytes(18).toString('hex');

// ---- Activity ----
const cleanCosts = (costs) =>
  (Array.isArray(costs) ? costs : [])
    .map((c) => ({ label: String(c?.label || '').trim().slice(0, 80), amount: num(c?.amount) }))
    .filter((c) => c.label && c.amount !== null && c.amount >= 0);

// Fields from the team's form; error: a message for the user
export const activityFields = (body, { partial = false } = {}) => {
  const out = {};
  const has = (k) => k in body;
  if (!partial || has('title')) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'Donnez un titre à l’activité' };
    out.title = title.slice(0, 120);
  }
  for (const k of ['kind', 'description', 'place', 'meeting_point']) {
    if (has(k)) out[k] = String(body[k] || '').trim().slice(0, k === 'description' ? 4000 : 200) || null;
  }
  for (const k of ['date', 'deadline']) {
    if (has(k)) {
      if (body[k] && !DAY_RE.test(body[k])) return { error: 'Date invalide' };
      out[k] = body[k] || null;
    }
  }
  for (const k of ['start_time', 'end_time']) {
    if (has(k)) {
      if (body[k] && !TIME_RE.test(body[k])) return { error: 'Heure invalide' };
      out[k] = body[k] || null;
    }
  }
  if (out.start_time && out.end_time && out.end_time <= out.start_time) {
    return { error: 'L’heure de fin doit suivre l’heure de début' };
  }
  if (has('image')) {
    const image = String(body.image || '');
    if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 700000)) {
      return { error: 'Image illisible ou trop lourde' };
    }
    out.image = image || null;
  }
  // Postgres array literal (replacements would spread a JS array)
  if (has('levels')) {
    const levels = (Array.isArray(body.levels) ? body.levels : []).map(String).slice(0, 20);
    out.levels = `{${levels.map((l) => `"${l.replace(/["\\]/g, '')}"`).join(',')}}`;
  }
  if (has('places')) {
    const places = num(body.places);
    if (places !== null && (!Number.isInteger(places) || places < 1)) return { error: 'Nombre de places invalide' };
    out.places = places;
  }
  if (has('status')) {
    if (!ACTIVITY_STATUSES.includes(body.status)) return { error: 'Statut inconnu' };
    out.status = body.status;
  }
  if (has('fee')) {
    const fee = num(body.fee) ?? 0;
    if (fee < 0) return { error: 'Participation invalide' };
    out.fee = fee;
  }
  if (has('costs')) out.costs = JSON.stringify(cleanCosts(body.costs));
  if (has('adults_per_students')) {
    const n = num(body.adults_per_students);
    out.adults_per_students = n && n > 0 ? Math.round(n) : 8;
  }
  return { fields: out };
};

const columns = (fields) => Object.keys(fields);
const CASTS = { costs: 'jsonb', levels: 'text[]' };
const value = (c) => (CASTS[c] ? `cast(:${c} as ${CASTS[c]})` : `:${c}`);
export const createActivity = async (fields, userId) => {
  const cols = columns(fields);
  return one(
    `insert into activities (${cols.join(', ')}, created_by)
     values (${cols.map(value).join(', ')}, :userId) returning *`,
    { ...fields, userId }
  );
};
export const updateActivity = async (id, fields) => {
  const cols = columns(fields);
  if (!cols.length) return one('select * from activities where id = :id', { id });
  return one(
    `update activities set ${cols.map((c) => `${c} = ${value(c)}`).join(', ')},
       updated_at = now() where id = :id returning *`,
    { ...fields, id }
  );
};
export const deleteActivity = (id) => q('delete from activities where id = :id', { id });

// Expected participation of a registration
const dueOf = (r, activity) => (r.fee_override !== null && r.fee_override !== undefined ? Number(r.fee_override) : Number(activity.fee || 0));

// Budget: costs, participations expected (registered) and received
export const budgetOf = (activity, registrations) => {
  const costs = (activity.costs || []).reduce((n, c) => n + Number(c.amount || 0), 0);
  const registered = registrations.filter((r) => r.status === 'inscrit');
  const expected = registered.reduce((n, r) => n + dueOf(r, activity), 0);
  const received = registrations.reduce((n, r) => n + Number(r.paid_amount || 0), 0);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    costs: round(costs),
    expected: round(expected),
    received: round(received),
    still_due: round(Math.max(0, expected - received)),
    // What the association pays: once everything is paid, and as of today
    left_planned: round(costs - expected),
    left_now: round(costs - received),
    per_student: registered.length ? round(costs / registered.length) : null,
  };
};

// Status shown: "passée" once the day is over, "complète" when full
const shownStatus = (a, registered) => {
  if (['brouillon', 'annulée'].includes(a.status)) return a.status;
  if (a.date && day(a.date) < parisToday()) return 'passée';
  if (a.places && registered >= a.places) return 'complète';
  return a.status;
};

export const listActivities = async () => {
  const rows = await q(
    `select a.id, a.title, a.kind, a.date, a.start_time, a.end_time, a.place, a.image, a.levels, a.places,
            a.deadline, a.status, a.fee, a.costs, a.adults_per_students,
            (select count(*)::int from activity_registrations r where r.activity_id = a.id and r.status = 'inscrit') as registered,
            (select count(*)::int from activity_registrations r where r.activity_id = a.id and r.status = 'attente') as waiting,
            (select count(*)::int from activity_staff s where s.activity_id = a.id) as staff
       from activities a
      order by a.date nulls last, a.id`
  );
  return rows.map((a) => ({ ...a, date: day(a.date), deadline: day(a.deadline), shown_status: shownStatus(a, a.registered) }));
};

export const getActivity = async (id) => {
  const a = await one('select * from activities where id = :id', { id });
  if (!a) return null;
  const registrations = await q(
    `select r.*, s.first_name, s.last_name, s.level, s.status as student_status, s.is_demo,
            s.parent1_firstname, s.parent1_phone, s.parent2_phone, s.phone as student_phone,
            s.parental_consent_at
       from activity_registrations r join students s on s.id = r.student_id
      where r.activity_id = :id
      order by case r.status when 'inscrit' then 0 when 'attente' then 1 else 2 end, r.created_at, r.id`,
    { id }
  );
  const staff = await q('select * from activity_staff where activity_id = :id order by role desc, id', { id });
  const registered = registrations.filter((r) => r.status === 'inscrit').length;
  return {
    ...a,
    date: day(a.date),
    deadline: day(a.deadline),
    shown_status: shownStatus(a, registered),
    registrations: registrations.map((r) => ({
      ...r,
      consent_at: day(r.consent_at),
      paid_at: day(r.paid_at),
      due: dueOf(r, a),
    })),
    staff,
    budget: budgetOf(a, registrations),
  };
};

// ---- Registrations ----
// A student registered, or waiting when the outing is full
export const register = async (activityId, studentId, userId) => {
  const a = await one('select * from activities where id = :activityId', { activityId });
  if (!a) return { error: 'Activité introuvable', status: 404 };
  if (a.status === 'annulée') return { error: 'Activité annulée' };
  const student = await one('select id from students where id = :studentId', { studentId });
  if (!student) return { error: 'Élève introuvable', status: 404 };
  const existing = await one(
    'select * from activity_registrations where activity_id = :activityId and student_id = :studentId',
    { activityId, studentId }
  );
  if (existing && existing.status !== 'désisté') return { error: 'Élève déjà inscrit ou en attente', status: 409 };
  const [{ n }] = await q(
    `select count(*)::int as n from activity_registrations where activity_id = :activityId and status = 'inscrit'`,
    { activityId }
  );
  const status = a.places && n >= a.places ? 'attente' : 'inscrit';
  if (existing) {
    return {
      registration: await one(
        `update activity_registrations set status = :status, created_at = now() where id = :id returning *`,
        { status, id: existing.id }
      ),
    };
  }
  return {
    registration: await one(
      `insert into activity_registrations (activity_id, student_id, status, created_by)
       values (:activityId, :studentId, :status, :userId) returning *`,
      { activityId, studentId, status, userId }
    ),
  };
};

export const findRegistration = (id) => one('select * from activity_registrations where id = :id', { id });

// Team's changes: status, authorisation, participation, payment, presence
export const updateRegistration = async (id, body) => {
  const set = {};
  if ('status' in body) {
    if (!REGISTRATION_STATUSES.includes(body.status)) return { error: 'Statut inconnu' };
    set.status = body.status;
  }
  for (const k of ['consent_at', 'paid_at']) {
    if (k in body) {
      if (body[k] && !DAY_RE.test(body[k])) return { error: 'Date invalide' };
      set[k] = body[k] || null;
    }
  }
  for (const k of ['fee_override', 'paid_amount']) {
    if (k in body) {
      const v = num(body[k]);
      if (v !== null && v < 0) return { error: 'Montant invalide' };
      set[k] = v;
    }
  }
  if ('paid_method' in body) {
    if (body.paid_method && !PAYMENT_METHODS.includes(body.paid_method)) return { error: 'Moyen de paiement inconnu' };
    set.paid_method = body.paid_method || null;
  }
  if ('attendance' in body) {
    if (body.attendance && !['présent', 'absent'].includes(body.attendance)) return { error: 'Présence inconnue' };
    set.attendance = body.attendance || null;
    set.attendance_at = body.attendance ? new Date() : null;
    set.attendance_by = body.attendance ? 'équipe' : null;
  }
  if ('note' in body) set.note = String(body.note || '').trim().slice(0, 300) || null;
  const cols = Object.keys(set);
  if (!cols.length) return { registration: await findRegistration(id) };
  return {
    registration: await one(
      `update activity_registrations set ${cols.map((c) => `${c} = :${c}`).join(', ')} where id = :id returning *`,
      { ...set, id }
    ),
  };
};
export const deleteRegistration = (id) => q('delete from activity_registrations where id = :id', { id });

// ---- Adults ----
export const addStaff = async (activityId, body) => {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Indiquez le nom de l’accompagnateur' };
  const role = STAFF_ROLES.includes(body.role) ? body.role : 'accompagnateur';
  return {
    staff: await one(
      `insert into activity_staff (activity_id, user_id, name, phone, email, role, token)
       values (:activityId, :userId, :name, :phone, :email, :role, :token) returning *`,
      {
        activityId,
        userId: num(body.user_id),
        name: name.slice(0, 120),
        phone: String(body.phone || '').trim().slice(0, 30) || null,
        email: String(body.email || '').trim().slice(0, 120) || null,
        role,
        token: newToken(),
      }
    ),
  };
};
export const deleteStaff = (id) => q('delete from activity_staff where id = :id', { id });
// A new link (the old one stops working)
export const renewStaffToken = (id) =>
  one('update activity_staff set token = :token where id = :id returning *', { id, token: newToken() });

// ---- The adults' page (public: the link is the access) ----
const linkOpen = (a) => {
  if (!a.date) return true;
  const today = parisToday();
  return today >= addDays(day(a.date), -LINK_DAYS_BEFORE) && today <= addDays(day(a.date), LINK_DAYS_AFTER);
};
export const attendancePage = async (token) => {
  const staff = await one('select * from activity_staff where token = :token', { token });
  if (!staff) return { error: 'Lien inconnu ou remplacé', status: 404 };
  const a = await one('select * from activities where id = :id', { id: staff.activity_id });
  if (!a || a.status === 'annulée') return { error: 'Activité annulée', status: 410 };
  const open = linkOpen(a);
  const students = open
    ? await q(
        `select r.id, r.attendance, s.first_name, s.last_name, s.level, s.parent1_firstname, s.parent1_phone, s.parent2_phone
           from activity_registrations r join students s on s.id = r.student_id
          where r.activity_id = :id and r.status = 'inscrit'
          order by s.first_name, s.last_name`,
        { id: a.id }
      )
    : [];
  return {
    page: {
      staff: { name: staff.name, role: staff.role },
      activity: {
        title: a.title,
        date: day(a.date),
        start_time: a.start_time,
        end_time: a.end_time,
        place: a.place,
        meeting_point: a.meeting_point,
      },
      open,
      students: students.map((s) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name ? `${s.last_name[0]}.` : ''}`.trim(),
        level: s.level,
        attendance: s.attendance,
        // Who to call if needed
        parent: s.parent1_phone || s.parent2_phone ? { name: s.parent1_firstname, phone: s.parent1_phone || s.parent2_phone } : null,
      })),
    },
  };
};
export const tickAttendance = async (token, registrationId, attendance) => {
  if (attendance && !['présent', 'absent'].includes(attendance)) return { error: 'Présence inconnue' };
  const staff = await one('select * from activity_staff where token = :token', { token });
  if (!staff) return { error: 'Lien inconnu ou remplacé', status: 404 };
  const a = await one('select * from activities where id = :id', { id: staff.activity_id });
  if (!a || a.status === 'annulée' || !linkOpen(a)) return { error: 'Le lien n’est pas ouvert ce jour-là', status: 409 };
  const r = await one(
    `update activity_registrations set attendance = :attendance, attendance_at = :at, attendance_by = :by
      where id = :id and activity_id = :activityId and status = 'inscrit' returning id, attendance`,
    {
      attendance: attendance || null,
      at: attendance ? new Date() : null,
      by: attendance ? staff.name : null,
      id: registrationId,
      activityId: a.id,
    }
  );
  if (!r) return { error: 'Élève introuvable', status: 404 };
  return { registration: r };
};

// ---- A student's outings (student's page) ----
export const activitiesOfStudent = async (studentId) =>
  (
    await q(
      `select r.id, r.status, r.attendance, r.paid_amount, r.fee_override, a.id as activity_id, a.title, a.date, a.fee
         from activity_registrations r join activities a on a.id = r.activity_id
        where r.student_id = :studentId order by a.date desc nulls last`,
      { studentId }
    )
  ).map((r) => ({ ...r, date: day(r.date) }));

// ---- Students, for the people in charge of the outings ----
// Only what registering needs (no file, fee or family details)
export const studentsToRegister = () =>
  q(
    `select id, first_name, last_name, level, status, is_demo from students
      where coalesce(status, '') not in ('Abandon', 'Terminé')
      order by first_name, last_name`
  );
// A student of the outings only (no tutoring asked); phone: +33 form
const frPhone = (v) => {
  const d = String(v || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (/^0\d{9}$/.test(d)) return `+33${d.slice(1)}`;
  return d;
};
export const createOutingStudent = async (body) => {
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  if (!first || !last) return { error: 'Prénom et nom obligatoires' };
  const twin = await one(
    `select id from students where lower(first_name) = lower(:first) and lower(last_name) = lower(:last)`,
    { first, last }
  );
  if (twin) return { error: 'Cet élève existe déjà : cherchez-le dans la liste', status: 409 };
  return {
    student: await one(
      `insert into students (first_name, last_name, level, status, parent1_firstname, parent1_phone, created_at, updated_at)
       values (:first, :last, :level, 'Activités culturelles seulement', :parent, :phone, now(), now())
       returning id, first_name, last_name, level, status, is_demo`,
      {
        first: first.slice(0, 80),
        last: last.slice(0, 80),
        level: String(body.level || '').trim() || null,
        parent: String(body.parent1_firstname || '').trim() || null,
        phone: frPhone(body.parent1_phone),
      }
    ),
  };
};
