// Cultural activities: the team's pages, and the adults' attendance link
import {
  activityFields,
  createActivity,
  updateActivity,
  deleteActivity,
  listActivities,
  getActivity,
  register,
  findRegistration,
  updateRegistration,
  deleteRegistration,
  addStaff,
  deleteStaff,
  renewStaffToken,
  attendancePage,
  tickAttendance,
  activitiesOfStudent,
  studentsToRegister,
  createOutingStudent,
} from '../services/activities.js';
import { conflictsOf, releaseTutors, tellTutors } from '../services/activityConflicts.js';
import { MANAGER_ROLES } from '../middlewares/authAdmin.js';

// Tutoring sessions at the time of the outing, on each registered student;
// the tutor's name only for the managers (the people in charge of the
// outings see the session, not who gives it)
const withConflicts = async (a, req) => {
  const ids = a.registrations.filter((r) => r.status === 'inscrit').map((r) => r.student_id);
  const found = await conflictsOf(a, ids);
  const manager = MANAGER_ROLES.includes(req.user?.role);
  return {
    ...a,
    registrations: a.registrations.map((r) => ({
      ...r,
      tutoring: (found[r.student_id] || []).map((c) => ({ ...c, tutor: manager ? c.tutor : null, tutor_id: undefined })),
    })),
  };
};
const registeredIds = (a) => a.registrations.filter((r) => r.status === 'inscrit').map((r) => r.student_id);

const me = (req) => Number(req.user?.userid ?? req.user?.userId);
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};
// Service answers: { error, status } or the value
const answer = (res, out, key, code = 200) =>
  out.error ? res.status(out.status || 400).json({ error: out.error }) : res.status(code).json(out[key]);

export const list = async (req, res) => {
  try {
    res.json(await listActivities());
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};
export const show = async (req, res) => {
  try {
    const a = await getActivity(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activité introuvable' });
    res.json(await withConflicts(a, req));
  } catch (err) {
    fail(res, err, 'Activité indisponible');
  }
};
export const create = async (req, res) => {
  try {
    const { fields, error } = activityFields(req.body);
    if (error) return res.status(400).json({ error });
    res.status(201).json(await createActivity(fields, me(req)));
  } catch (err) {
    fail(res, err, "L'activité n'a pas pu être créée");
  }
};
export const update = async (req, res) => {
  try {
    const { fields, error } = activityFields(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const before = await getActivity(Number(req.params.id));
    if (!before) return res.status(404).json({ error: 'Activité introuvable' });
    const a = await updateActivity(before.id, fields);
    // Another day: the sessions said cancelled for the old one take place
    const moved = 'date' in fields && (fields.date || null) !== (before.date || null);
    if (moved || fields.status === 'annulée') await releaseTutors(before, registeredIds(before), before.date);
    res.json(await withConflicts(await getActivity(a.id), req));
  } catch (err) {
    fail(res, err, "L'activité n'a pas pu être enregistrée");
  }
};
export const remove = async (req, res) => {
  try {
    await deleteActivity(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'activité n'a pas pu être supprimée");
  }
};

// Before registering: the student's sessions at the time of the outing
export const checkConflicts = async (req, res) => {
  try {
    const a = await getActivity(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Activité introuvable' });
    const studentId = Number(req.query.student_id);
    const manager = MANAGER_ROLES.includes(req.user?.role);
    const found = ((await conflictsOf(a, [studentId]))[studentId] || []).filter((c) =>
      ['conflit', 'à vérifier'].includes(c.state)
    );
    res.json(found.map((c) => ({ ...c, tutor: manager ? c.tutor : null, tutor_id: undefined })));
  } catch (err) {
    fail(res, err, 'Vérification impossible');
  }
};

// Body: { student_id, tell_tutor }: tell_tutor = the sessions at that time
// are cancelled and the tutors told
export const addRegistration = async (req, res) => {
  try {
    const out = await register(Number(req.params.id), Number(req.body.student_id), me(req));
    if (!out.error && out.registration.status === 'inscrit' && req.body.tell_tutor) {
      const a = await getActivity(Number(req.params.id));
      out.registration.tutors_told = await tellTutors(a, out.registration.student_id, me(req));
    }
    answer(res, out, 'registration', 201);
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être enregistrée");
  }
};
export const changeRegistration = async (req, res) => {
  try {
    const before = await findRegistration(Number(req.params.id));
    if (!before) return res.status(404).json({ error: 'Inscription introuvable' });
    const out = await updateRegistration(before.id, req.body);
    // No longer going: the sessions take place again
    if (!out.error && before.status === 'inscrit' && out.registration.status !== 'inscrit') {
      await releaseTutors(await getActivity(before.activity_id), [before.student_id]);
    }
    answer(res, out, 'registration');
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être modifiée");
  }
};
export const removeRegistration = async (req, res) => {
  try {
    const before = await findRegistration(Number(req.params.id));
    if (before?.status === 'inscrit') await releaseTutors(await getActivity(before.activity_id), [before.student_id]);
    await deleteRegistration(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être supprimée");
  }
};

// The tutors of a registered student told (sessions cancelled that day)
export const tellRegistrationTutors = async (req, res) => {
  try {
    const r = await findRegistration(Number(req.params.id));
    if (!r || r.status !== 'inscrit') return res.status(404).json({ error: 'Inscription introuvable' });
    const told = await tellTutors(await getActivity(r.activity_id), r.student_id, me(req));
    res.json({ told });
  } catch (err) {
    fail(res, err, "Le tuteur n'a pas pu être prévenu");
  }
};

export const addAdult = async (req, res) => {
  try {
    answer(res, await addStaff(Number(req.params.id), req.body), 'staff', 201);
  } catch (err) {
    fail(res, err, "L'accompagnateur n'a pas pu être ajouté");
  }
};
export const removeAdult = async (req, res) => {
  try {
    await deleteStaff(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'accompagnateur n'a pas pu être retiré");
  }
};
export const renewAdultLink = async (req, res) => {
  try {
    const s = await renewStaffToken(Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Accompagnateur introuvable' });
    res.json(s);
  } catch (err) {
    fail(res, err, "Le lien n'a pas pu être renouvelé");
  }
};

export const studentActivities = async (req, res) => {
  try {
    res.json(await activitiesOfStudent(Number(req.params.id)));
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};

export const studentsForActivities = async (req, res) => {
  try {
    res.json(await studentsToRegister());
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};
// Body: { first_name, last_name, level, parent1_firstname, parent1_phone }
export const createActivityStudent = async (req, res) => {
  try {
    answer(res, await createOutingStudent(req.body), 'student', 201);
  } catch (err) {
    fail(res, err, "L'élève n'a pas pu être créé");
  }
};

// ---- Public: the adult's link ----
export const attendance = async (req, res) => {
  try {
    answer(res, await attendancePage(String(req.params.token)), 'page');
  } catch (err) {
    fail(res, err, 'Page indisponible');
  }
};
// Body: { registration_id, attendance: 'présent' | 'absent' | null }
export const tick = async (req, res) => {
  try {
    answer(
      res,
      await tickAttendance(String(req.params.token), Number(req.body.registration_id), req.body.attendance || null),
      'registration'
    );
  } catch (err) {
    fail(res, err, "La présence n'a pas pu être enregistrée");
  }
};
