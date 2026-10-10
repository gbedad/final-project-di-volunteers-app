// Interviews of a volunteer, one at a time (autosave of the volunteer's
// page). Storage unchanged: users.interviews is an array of JSON strings,
// "isActive" (done) kept for the counters of the tutors list.
import crypto from 'crypto';
import Users from '../models/users.model.js';
import {
  EXPERIENCE_VALUES,
  FOLLOWUP_VALUES,
  FRENCH_VALUES,
  RECOMMENDATION_VALUES,
  modernizeInterview,
} from '../services/interviewWording.js';

const TEXT_FIELDS = ['motivation', 'experience', 'how_tutoring', 'personal_questions', 'content'];
const CHOICES = {
  recommendation: RECOMMENDATION_VALUES,
  followup: FOLLOWUP_VALUES,
  test: FRENCH_VALUES,
  experience_level: EXPERIENCE_VALUES,
  training: ['Requises', 'A proposer', 'Pas nécessaires', 'NSP'],
};

const parse = (s) => {
  let v = s;
  for (let i = 0; i < 3 && typeof v === 'string'; i += 1) {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' ? v : null;
};

// Interviews with an id each (the old ones get one, saved once)
const load = async (userId) => {
  const user = await Users.findByPk(userId, { attributes: ['id', 'role', 'interviews'] });
  if (!user || user.role !== 'volunteer') return null;
  let missing = false;
  const list = (user.interviews || [])
    .map(parse)
    .filter(Boolean)
    .map((iv) => {
      if (iv.id) return modernizeInterview(iv);
      missing = true;
      return { ...modernizeInterview(iv), id: crypto.randomUUID() };
    });
  if (missing) await save(user, list);
  return { user, list };
};
const save = (user, list) =>
  Users.update(
    { interviews: list.map((iv) => JSON.stringify(iv)) },
    { where: { id: user.id }, silent: true }
  );

// Shown first: the latest by date
const sorted = (list) =>
  [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

export const listInterviews = async (req, res) => {
  try {
    const data = await load(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    res.json(sorted(data.list));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the interviews' });
  }
};

export const createInterview = async (req, res) => {
  try {
    const data = await load(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    const me = await Users.findByPk(req.user.userid, { attributes: ['first_name', 'last_name'] });
    const iv = {
      id: crypto.randomUUID(),
      title: `Entretien ${data.list.length + 1}`,
      date: new Date().toISOString().slice(0, 10),
      by: me ? `${me.first_name} ${me.last_name}`.trim() : '',
      by_id: req.user.userid,
      isActive: false,
    };
    await save(data.user, [...data.list, iv]);
    res.status(201).json(iv);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'entretien n'a pas pu être créé" });
  }
};

// Body: the changed fields only. Done ("isActive") once a recommendation is
// chosen.
export const updateInterview = async (req, res) => {
  try {
    const data = await load(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    const iv = data.list.find((x) => x.id === req.params.interviewId);
    if (!iv) return res.status(404).json({ error: 'Entretien introuvable' });
    for (const [k, v] of Object.entries(req.body || {})) {
      if (TEXT_FIELDS.includes(k)) iv[k] = String(v ?? '').slice(0, 10000);
      else if (CHOICES[k] && (v === '' || v === null || CHOICES[k].includes(v))) iv[k] = v || '';
      else if (k === 'date' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v))) iv.date = v;
    }
    iv.isActive = !!iv.recommendation;
    await save(data.user, data.list);
    res.json(iv);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'entretien n'a pas pu être enregistré" });
  }
};

export const deleteInterview = async (req, res) => {
  try {
    const data = await load(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    const list = data.list.filter((x) => x.id !== req.params.interviewId);
    if (list.length === data.list.length) {
      return res.status(404).json({ error: 'Entretien introuvable' });
    }
    await save(data.user, list);
    res.json({ deleted: req.params.interviewId });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'entretien n'a pas pu être supprimé" });
  }
};
