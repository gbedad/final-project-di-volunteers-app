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
    res.json(a);
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
    const a = await updateActivity(Number(req.params.id), fields);
    if (!a) return res.status(404).json({ error: 'Activité introuvable' });
    res.json(await getActivity(a.id));
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

// Body: { student_id }
export const addRegistration = async (req, res) => {
  try {
    answer(res, await register(Number(req.params.id), Number(req.body.student_id), me(req)), 'registration', 201);
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être enregistrée");
  }
};
export const changeRegistration = async (req, res) => {
  try {
    if (!(await findRegistration(Number(req.params.id)))) return res.status(404).json({ error: 'Inscription introuvable' });
    answer(res, await updateRegistration(Number(req.params.id), req.body), 'registration');
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être modifiée");
  }
};
export const removeRegistration = async (req, res) => {
  try {
    await deleteRegistration(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'inscription n'a pas pu être supprimée");
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
