// Tutor / student pairs: the team proposes, the tutor accepts or declines,
// the team pauses or ends the pair
import { Op } from 'sequelize';
import Binomes from '../models/binomes.model.js';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import { findTutors, OPEN_PAIR_STATUSES } from '../services/matching.js';
import {
  notifyPairProposed,
  notifyPairAnswered,
} from '../services/binomesMail.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);
const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ');
const TUTOR_FIELDS = ['id', 'first_name', 'last_name', 'email', 'email2', 'phone'];

// Student status follows the pairs: an active pair means "Binôme en cours";
// when none is left the student is waiting for a tutor again
const syncStudentStatus = async (studentId) => {
  const student = await Students.findByPk(studentId, {
    attributes: ['id', 'status'],
  });
  if (!student) return;
  const active = await Binomes.count({
    where: { student_id: studentId, status: 'actif' },
  });
  if (active && student.status !== 'Binôme en cours') {
    await student.update({ status: 'Binôme en cours' });
  } else if (!active && student.status === 'Binôme en cours') {
    await student.update({ status: 'En attente de tuteur' });
  }
};

// ---- Team ----

export const getMatches = async (req, res) => {
  try {
    const student = await Students.findByPk(req.params.id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    res.json(await findTutors(student.toJSON(), { scope: req.query.scope }));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not find tutors' });
  }
};

export const listStudentPairs = async (req, res) => {
  try {
    const pairs = await Binomes.findAll({
      where: { student_id: req.params.id },
      order: [['proposed_at', 'DESC']],
      raw: true,
    });
    const tutors = await Users.findAll({
      where: { id: pairs.map((p) => p.tutor_id).filter(Boolean) },
      attributes: TUTOR_FIELDS,
      raw: true,
    });
    res.json(
      pairs.map((p) => ({
        ...p,
        tutor: tutors.find((t) => t.id === p.tutor_id) || null,
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the pairs' });
  }
};

// Body: { student_id, tutor_id, subjects, schedule, how_location, site,
// start_date, note }
export const proposePair = async (req, res) => {
  const { student_id, tutor_id } = req.body;
  try {
    const student = await Students.findByPk(student_id);
    const tutor = await Users.findOne({
      where: { id: tutor_id, role: 'volunteer', status: 'Validé' },
      attributes: TUTOR_FIELDS,
    });
    if (!student || !tutor) {
      return res.status(404).json({ error: 'Élève ou tuteur introuvable' });
    }
    const subjects = (req.body.subjects || []).filter(Boolean);
    if (!subjects.length) {
      return res.status(400).json({ error: 'Choisissez au moins une matière' });
    }
    const open = await Binomes.count({
      where: { student_id, tutor_id, status: { [Op.in]: OPEN_PAIR_STATUSES } },
    });
    if (open) {
      return res
        .status(409)
        .json({ error: 'Ce tuteur accompagne déjà cet élève ou une proposition est en cours' });
    }
    const binome = await Binomes.create({
      student_id,
      tutor_id,
      subjects,
      schedule: req.body.schedule || [],
      how_location: req.body.how_location || null,
      site: req.body.site || null,
      start_date: req.body.start_date || null,
      note: req.body.note || null,
      proposed_by: me(req),
      status: 'proposé',
    });
    if (student.status === 'Nouvelle demande') {
      await student.update({ status: 'En attente de tuteur' });
    }
    res.status(201).json(binome);
    notifyPairProposed(tutor, student, binome);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "La proposition n'a pas pu être créée" });
  }
};

// Body: { action: 'cancel' | 'pause' | 'resume' | 'end', reason }
const TRANSITIONS = {
  cancel: { from: ['proposé'], to: 'annulé' },
  pause: { from: ['actif'], to: 'en pause' },
  resume: { from: ['en pause'], to: 'actif' },
  end: { from: ['actif', 'en pause'], to: 'terminé' },
};
export const updatePair = async (req, res) => {
  const transition = TRANSITIONS[req.body.action];
  if (!transition) return res.status(400).json({ error: 'Action inconnue' });
  try {
    const binome = await Binomes.findByPk(req.params.id);
    if (!binome) return res.status(404).json({ error: 'Binôme introuvable' });
    if (!transition.from.includes(binome.status)) {
      return res.status(409).json({ error: 'Action impossible dans cet état' });
    }
    const changes = { status: transition.to };
    if (req.body.action === 'end') {
      changes.ended_at = new Date();
      changes.end_reason = req.body.reason || null;
    }
    await binome.update(changes);
    await syncStudentStatus(binome.student_id);
    res.json(binome);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Le binôme n'a pas pu être modifié" });
  }
};

// ---- Tutor ----

// The tutor's pairs: only what is needed to teach (no family contact, no
// special needs: the association is the go-between)
export const myPairs = async (req, res) => {
  try {
    const pairs = await Binomes.findAll({
      where: {
        tutor_id: me(req),
        status: { [Op.in]: ['proposé', 'actif', 'en pause', 'terminé'] },
      },
      order: [['proposed_at', 'DESC']],
      raw: true,
    });
    const students = await Students.findAll({
      where: { id: pairs.map((p) => p.student_id) },
      attributes: [
        'id',
        'first_name',
        'last_name',
        'level',
        'track',
        'school',
        'topics',
        'goals',
        'needs',
      ],
      raw: true,
    });
    res.json(
      pairs.map((p) => {
        const s = students.find((x) => x.id === p.student_id) || {};
        return {
          ...p,
          student: {
            first_name: s.first_name,
            initial: s.last_name ? `${s.last_name[0]}.` : '',
            level: s.level,
            track: s.track,
            school: s.school
              ? { type: s.school.type, city: s.school.city }
              : null,
            topics: s.topics || [],
            goals: s.goals || [],
            needs: s.needs,
          },
        };
      })
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list your students' });
  }
};

// Body: { accept: true } or { accept: false, reason }
export const answerPair = async (req, res) => {
  try {
    const binome = await Binomes.findByPk(req.params.id);
    if (!binome || binome.tutor_id !== me(req)) {
      return res.status(404).json({ error: 'Proposition introuvable' });
    }
    if (binome.status !== 'proposé') {
      return res.status(409).json({ error: 'Vous avez déjà répondu' });
    }
    await binome.update({
      status: req.body.accept ? 'actif' : 'refusé',
      responded_at: new Date(),
      decline_reason: req.body.accept ? null : req.body.reason || null,
    });
    await syncStudentStatus(binome.student_id);
    res.json(binome);
    const tutor = await Users.findByPk(binome.tutor_id, { attributes: TUTOR_FIELDS });
    const student = await Students.findByPk(binome.student_id, {
      attributes: ['id', 'first_name', 'last_name'],
    });
    notifyPairAnswered(tutor, student, binome);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "La réponse n'a pas pu être enregistrée" });
  }
};
