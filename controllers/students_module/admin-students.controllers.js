// Students entered by the team (admin pages "Élèves")
import axios from 'axios';
import Students from '../../models/students/students.model.js';
import { formatName } from '../../services/names.js';
import { consentOverview } from '../../services/parentalConsent.js';
import { feeOf, hoursByTerm, QF_PROOFS } from '../../services/fees.js';
import Binomes from '../../models/binomes.model.js';
import Seances from '../../models/seances.model.js';
import StudentFiles from '../../models/students/studentsFiles.model.js';
import { Op } from 'sequelize';
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
  // Amounts: a positive number or nothing ("1 234,50" accepted)
  for (const field of ['qf', 'fee_override']) {
    if (!(field in changes)) continue;
    const v = changes[field];
    const n =
      v === null || v === undefined
        ? null
        : Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (n === null || (Number.isFinite(n) && n >= 0 && n < 1000000)) {
      changes[field] = n === null ? null : Math.round(n * 100) / 100;
    } else {
      delete changes[field];
    }
  }
  if ('qf_proof' in changes && changes.qf_proof !== null && !QF_PROOFS[changes.qf_proof]) {
    delete changes.qf_proof;
  }
  if ('fee_special' in changes) changes.fee_special = !!changes.fee_special;
  if ('is_demo' in changes) changes.is_demo = !!changes.is_demo;
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
    res.json(
      students.map((s) => {
        const fee = feeOf(s);
        return {
          ...s.toJSON(),
          consent: consents[s.id],
          fee: fee && { mode: fee.mode, tranche: fee.tranche, amount: fee.amount, missing: fee.missing },
        };
      })
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the students' });
  }
};

// Participation of the student: amount, hours and amount due per term, proof
const feeDetails = async (student) => {
  const fee = feeOf(student);
  const pairs = await Binomes.findAll({
    where: { student_id: student.id },
    attributes: ['id'],
    raw: true,
  });
  const sessions = pairs.length
    ? await Seances.findAll({
        where: { binome_id: { [Op.in]: pairs.map((p) => p.id) } },
        attributes: ['date', 'duration_minutes', 'attendance'],
        raw: true,
      })
    : [];
  const proof = student.qf_file_id
    ? await StudentFiles.findByPk(student.qf_file_id, {
        attributes: ['id', 'path', 'filename'],
      })
    : null;
  return { fee, fee_terms: hoursByTerm(sessions, fee), qf_file: proof };
};

// Proof of the QF (CAF certificate or tax notice), kept with the student's
// documents; a new one replaces the previous link
export const qfProofUploaded = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  try {
    const file = await StudentFiles.create({
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      path: req.file.key,
      studentId: req.params.studentId,
    });
    await Students.update({ qf_file_id: file.id }, { where: { id: req.params.studentId } });
    res.json({ id: file.id, path: file.path, filename: file.filename });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Le justificatif n'a pas pu être enregistré" });
  }
};

export const getStudent = async (req, res) => {
  try {
    const student = await Students.findByPk(req.params.id, {
      attributes: { exclude: ['internal_thread', 'interviews', 'pre_interview'] },
    });
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    res.json({ ...student.toJSON(), ...(await feeDetails(student)) });
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
