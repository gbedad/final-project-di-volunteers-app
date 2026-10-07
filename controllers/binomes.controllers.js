// Tutor / student pairs: the team proposes, the tutor accepts or declines,
// the team pauses or ends the pair
import { Op } from 'sequelize';
import Binomes from '../models/binomes.model.js';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import { findTutors, OPEN_PAIR_STATUSES } from '../services/matching.js';
import Seances from '../models/seances.model.js';
import { pairStats, ATTENDANCES } from '../services/followUp.js';
import { MANAGER_ROLES } from '../middlewares/authAdmin.js';
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

// Reports of several pairs, grouped by pair
const sessionsByPair = async (pairIds) => {
  const sessions = pairIds.length
    ? await Seances.findAll({
        where: { binome_id: { [Op.in]: pairIds } },
        order: [['date', 'DESC'], ['id', 'DESC']],
        raw: true,
      })
    : [];
  const groups = {};
  for (const session of sessions) {
    (groups[session.binome_id] = groups[session.binome_id] || []).push(session);
  }
  return groups;
};

// ---- Team ----

// Every pair with its student, tutor, figures and alerts (page "Binômes")
export const listPairs = async (req, res) => {
  try {
    const pairs = await Binomes.findAll({ order: [['proposed_at', 'DESC']], raw: true });
    const students = await Students.findAll({
      where: { id: [...new Set(pairs.map((p) => p.student_id))] },
      attributes: ['id', 'first_name', 'last_name', 'level', 'is_demo'],
      raw: true,
    });
    const tutors = await Users.findAll({
      where: { id: [...new Set(pairs.map((p) => p.tutor_id).filter(Boolean))] },
      attributes: ['id', 'first_name', 'last_name'],
      raw: true,
    });
    const sessions = await sessionsByPair(pairs.map((p) => p.id));
    res.json(
      pairs.map((p) => ({
        ...p,
        student: students.find((x) => x.id === p.student_id) || null,
        tutor: tutors.find((x) => x.id === p.tutor_id) || null,
        stats: pairStats(p, sessions[p.id] || []),
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the pairs' });
  }
};

export const pairSessions = async (req, res) => {
  try {
    const pair = await Binomes.findByPk(req.params.id, { raw: true });
    if (!pair) return res.status(404).json({ error: 'Binôme introuvable' });
    const sessions = (await sessionsByPair([pair.id]))[pair.id] || [];
    res.json({ sessions, stats: pairStats(pair, sessions) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the reports' });
  }
};

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
    const sessions = await sessionsByPair(pairs.map((p) => p.id));
    res.json(
      pairs.map((p) => ({
        ...p,
        tutor: tutors.find((t) => t.id === p.tutor_id) || null,
        stats: pairStats(p, sessions[p.id] || []),
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
    const sessions = await sessionsByPair(pairs.map((p) => p.id));
    res.json(
      pairs.map((p) => {
        const s = students.find((x) => x.id === p.student_id) || {};
        return {
          ...p,
          sessions: sessions[p.id] || [],
          stats: pairStats(p, sessions[p.id] || []),
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

// Body: { date, duration_minutes, attendance, work, progress, remark }
export const addSession = async (req, res) => {
  try {
    const pair = await Binomes.findByPk(req.params.id);
    if (!pair || pair.tutor_id !== me(req)) {
      return res.status(404).json({ error: 'Binôme introuvable' });
    }
    if (!['actif', 'en pause'].includes(pair.status)) {
      return res
        .status(409)
        .json({ error: 'Ce binôme n’est pas en cours' });
    }
    const { date, attendance } = req.body;
    if (!date || new Date(date) > new Date()) {
      return res.status(400).json({ error: 'Date de séance invalide' });
    }
    if (!ATTENDANCES.includes(attendance)) {
      return res.status(400).json({ error: 'Présence invalide' });
    }
    const duration = Number(req.body.duration_minutes) || null;
    const progress = Number(req.body.progress) || null;
    const session = await Seances.create({
      binome_id: pair.id,
      author_id: me(req),
      date,
      attendance,
      duration_minutes:
        attendance === 'présent' && duration ? Math.min(Math.max(duration, 15), 600) : null,
      progress: progress && progress >= 1 && progress <= 5 ? progress : null,
      work: req.body.work?.trim() || null,
      remark: req.body.remark?.trim() || null,
    });
    res.status(201).json(session);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Le compte-rendu n'a pas pu être enregistré" });
  }
};

// The tutor can remove a report written in the last 30 days; admins any
export const deleteSession = async (req, res) => {
  try {
    const session = await Seances.findByPk(req.params.id);
    if (!session) return res.status(404).json({ error: 'Compte-rendu introuvable' });
    const manager = MANAGER_ROLES.includes(req.user?.role);
    const recent = Date.now() - new Date(session.created_at) < 30 * 86400000;
    if (!manager && (session.author_id !== me(req) || !recent)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await session.destroy();
    res.json({ deleted: session.id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Le compte-rendu n'a pas pu être supprimé" });
  }
};
