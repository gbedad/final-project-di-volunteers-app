import crypto from 'crypto';
import { Op } from 'sequelize';
import Users from '../models/users.model.js';
import { STAFF_ROLES } from '../middlewares/authAdmin.js';
import {
  CHANNELS,
  NEXT_STEPS,
  RESULTS,
  loadFirstContact,
  saveFirstContact,
  view,
} from '../services/firstContact.js';

const me = async (req) => {
  const u = await Users.findByPk(req.user.userid, { attributes: ['id', 'first_name', 'last_name'] });
  return u ? { id: u.id, name: `${u.first_name} ${u.last_name}`.trim() } : null;
};
const fail = (res, err, msg) => {
  console.log(err);
  res.status(500).json({ error: msg });
};

export const getFirstContact = async (req, res) => {
  try {
    const data = await loadFirstContact(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    // Team members, for "Réalisé par"
    const team = await Users.findAll({
      where: { role: { [Op.in]: STAFF_ROLES } },
      attributes: ['id', 'first_name', 'last_name'],
      order: [['first_name', 'ASC']],
    });
    res.json({
      ...view(data.user, data.fc),
      team: team.map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim() })),
      me: await me(req),
    });
  } catch (err) {
    fail(res, err, 'Could not load the first contact');
  }
};

// Body: { notes?, nextStep? }
export const updateFirstContact = async (req, res) => {
  try {
    const data = await loadFirstContact(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    if ('notes' in req.body) data.fc.notes = String(req.body.notes ?? '').slice(0, 10000);
    if ('nextStep' in req.body) {
      const v = req.body.nextStep || '';
      if (v && !NEXT_STEPS.includes(v)) return res.status(400).json({ error: 'Étape inconnue' });
      data.fc.nextStep = v;
    }
    await saveFirstContact(data.user, data.fc);
    res.json(view(data.user, data.fc));
  } catch (err) {
    fail(res, err, "Le premier contact n'a pas pu être enregistré");
  }
};

const cleanAttempt = (a, body) => {
  if ('date' in body && (body.date === '' || /^\d{4}-\d{2}-\d{2}$/.test(body.date))) a.date = body.date;
  if ('channel' in body && (body.channel === '' || CHANNELS.includes(body.channel))) a.channel = body.channel;
  if ('result' in body && (body.result === '' || RESULTS.includes(body.result))) a.result = body.result;
  if ('by' in body) a.by = String(body.by || '').slice(0, 120);
};

export const addAttempt = async (req, res) => {
  try {
    const data = await loadFirstContact(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    const author = await me(req);
    const a = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
      channel: '',
      result: '',
      by: author?.name || '',
      by_id: author?.id || null,
    };
    cleanAttempt(a, req.body || {});
    data.fc.attempts.push(a);
    await saveFirstContact(data.user, data.fc);
    res.status(201).json(view(data.user, data.fc));
  } catch (err) {
    fail(res, err, "La tentative n'a pas pu être ajoutée");
  }
};

export const updateAttempt = async (req, res) => {
  try {
    const data = await loadFirstContact(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    const a = data.fc.attempts.find((x) => x.id === req.params.attemptId);
    if (!a) return res.status(404).json({ error: 'Tentative introuvable' });
    cleanAttempt(a, req.body || {});
    delete a.auto;
    await saveFirstContact(data.user, data.fc);
    res.json(view(data.user, data.fc));
  } catch (err) {
    fail(res, err, "La tentative n'a pas pu être enregistrée");
  }
};

export const deleteAttempt = async (req, res) => {
  try {
    const data = await loadFirstContact(req.params.id);
    if (!data) return res.status(404).json({ error: 'Bénévole introuvable' });
    data.fc.attempts = data.fc.attempts.filter((x) => x.id !== req.params.attemptId);
    await saveFirstContact(data.user, data.fc);
    res.json(view(data.user, data.fc));
  } catch (err) {
    fail(res, err, "La tentative n'a pas pu être supprimée");
  }
};
