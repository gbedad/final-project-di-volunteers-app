// Students entered by the team (admin pages "Élèves")
import axios from 'axios';
import Students from '../../models/students/students.model.js';
import { formatName } from '../../services/names.js';
import { consentOverview } from '../../services/parentalConsent.js';
import {
  EDITABLE_FIELDS,
  LIST_FIELDS,
  STUDENT_PRIORITIES,
  STUDENT_STATUSES,
} from '../../services/students.js';

const SCHOOLS_URL =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

// Only known fields, names written the same way as everywhere else
const cleanChanges = (body) => {
  const changes = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    let value = body[field];
    if (field === 'first_name' || field === 'last_name') value = formatName(value);
    if (typeof value === 'string') value = value.trim() || null;
    changes[field] = value;
  }
  if ('status' in changes && !STUDENT_STATUSES.includes(changes.status)) {
    delete changes.status;
  }
  if (
    'priority' in changes &&
    changes.priority !== null &&
    !STUDENT_PRIORITIES.includes(changes.priority)
  ) {
    delete changes.priority;
  }
  return changes;
};

export const listStudents = async (req, res) => {
  try {
    const students = await Students.findAll({
      attributes: LIST_FIELDS,
      order: [['created_at', 'DESC']],
    });
    const consents = await consentOverview(students);
    res.json(students.map((s) => ({ ...s.toJSON(), consent: consents[s.id] })));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the students' });
  }
};

export const getStudent = async (req, res) => {
  try {
    const student = await Students.findByPk(req.params.id, {
      attributes: { exclude: ['internal_thread', 'interviews', 'pre_interview'] },
    });
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    res.json(student.toJSON());
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the student' });
  }
};

// Body: { first_name, last_name, level } at least
export const createStudent = async (req, res) => {
  const changes = cleanChanges(req.body);
  if (!changes.first_name || !changes.last_name) {
    return res.status(400).json({ error: 'Prénom et nom obligatoires' });
  }
  try {
    const student = await Students.create({
      status: 'Nouvelle demande',
      priority: 'P2',
      ...changes,
    });
    res.status(201).json({ id: student.id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'élève n'a pas pu être créé" });
  }
};

// Partial update (autosave of the student's page)
export const updateStudentFields = async (req, res) => {
  try {
    const student = await Students.findByPk(req.params.id, {
      attributes: ['id'],
    });
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    const changes = cleanChanges(req.body);
    if (changes.first_name === null || changes.last_name === null) {
      return res.status(400).json({ error: 'Prénom et nom obligatoires' });
    }
    await Students.update(changes, { where: { id: student.id } });
    res.json({ saved: Object.keys(changes) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'élève n'a pas pu être enregistré" });
  }
};

export const deleteStudentRecord = async (req, res) => {
  try {
    const deleted = await Students.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: 'Élève introuvable' });
    res.json({ deleted: Number(req.params.id) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'élève n'a pas pu être supprimé" });
  }
};

// School search in the national directory: name or town
export const searchSchools = async (req, res) => {
  const query = String(req.query.q || '')
    .replace(/["\\]/g, ' ')
    .trim();
  if (query.length < 3) return res.json([]);
  const words = query.split(/\s+/).slice(0, 4);
  const where = words
    .map(
      (w) => `(nom_etablissement like "%${w}%" or nom_commune like "%${w}%")`
    )
    .join(' and ');
  try {
    const { data } = await axios.get(SCHOOLS_URL, {
      params: { where, limit: 10 },
      timeout: 10000,
    });
    res.json(
      data.results.map((r) => ({
        uai: r.identifiant_de_l_etablissement,
        name: r.nom_etablissement,
        type: r.type_etablissement,
        city: r.nom_commune,
        zipcode: r.code_postal,
        sector: r.statut_public_prive,
        rep: r.appartenance_education_prioritaire || null,
      }))
    );
  } catch (err) {
    console.log('School search failed:', err.message);
    res.status(502).json({ error: 'Recherche des établissements indisponible' });
  }
};
