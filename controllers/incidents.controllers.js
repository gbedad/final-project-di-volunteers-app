// Incidents of a student (page of the student): declared by type, dealt
// with by the team (listed in "Contrôles" until then)
import Students from '../models/students/students.model.js';
import {
  INCIDENT_TYPES,
  addIncident,
  deleteIncident,
  findIncident,
  incidentsOf,
  resolveIncident,
} from '../services/incidents.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};

export const listIncidents = async (req, res) => {
  try {
    res.json({ types: INCIDENT_TYPES, incidents: await incidentsOf(Number(req.params.id)) });
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};

// Body: { date, type, note, binome_id }
export const createIncident = async (req, res) => {
  try {
    const student = await Students.findByPk(req.params.id, { attributes: ['id'] });
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    const out = await addIncident(student.id, req.body, me(req));
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out.incident);
  } catch (err) {
    fail(res, err, "L'incident n'a pas pu être enregistré");
  }
};

// Body: { resolved: true | false, resolution }
export const updateIncident = async (req, res) => {
  try {
    const found = await findIncident(Number(req.params.incidentId));
    if (!found || found.student_id !== Number(req.params.id)) return res.status(404).json({ error: 'Introuvable' });
    res.json(await resolveIncident(found.id, req.body, me(req)));
  } catch (err) {
    fail(res, err, "L'incident n'a pas pu être mis à jour");
  }
};

export const removeIncident = async (req, res) => {
  try {
    const found = await findIncident(Number(req.params.incidentId));
    if (!found || found.student_id !== Number(req.params.id)) return res.status(404).json({ error: 'Introuvable' });
    await deleteIncident(found.id);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "La suppression n'a pas pu être enregistrée");
  }
};
