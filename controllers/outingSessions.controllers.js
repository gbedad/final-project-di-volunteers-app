import { MANAGER_ROLES } from '../middlewares/authAdmin.js';
import {
  addChildren,
  conflictsFor,
  isKind,
  listSession,
  removeChild,
  setPresence,
  tellChildTutors,
} from '../services/outingSessions.js';

const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};
const answer = (res, out, key) =>
  out.error ? res.status(out.status || 400).json({ error: out.error }) : res.json(key ? out[key] : out);
const manager = (req) => MANAGER_ROLES.includes(req.user?.role);
const me = (req) => Number(req.user?.userid ?? req.user?.userId) || null;

// :kind = prep | debrief
export const knownKind = (req, res, next) =>
  isKind(req.params.kind) ? next() : res.status(404).json({ error: 'Séance inconnue' });

export const session = async (req, res) => {
  try {
    answer(res, await listSession(Number(req.params.id), req.params.kind, manager(req)));
  } catch (err) {
    fail(res, err, 'La séance n’a pas pu être chargée');
  }
};
export const conflicts = async (req, res) => {
  try {
    const ids = String(req.query.student_ids || '').split(',').map(Number).filter(Boolean);
    res.json(await conflictsFor(Number(req.params.id), req.params.kind, ids, manager(req)));
  } catch (err) {
    fail(res, err, 'Vérification impossible');
  }
};
export const addToSession = async (req, res) => {
  try {
    const out = await addChildren(Number(req.params.id), req.params.kind, req.body.student_ids, me(req));
    if (out.error) return answer(res, out);
    answer(res, await listSession(Number(req.params.id), req.params.kind, manager(req)));
  } catch (err) {
    fail(res, err, 'Les enfants n’ont pas pu être ajoutés');
  }
};
export const changePresence = async (req, res) => {
  try {
    answer(res, await setPresence(Number(req.params.id), req.body.attendance), 'participant');
  } catch (err) {
    fail(res, err, 'La présence n’a pas pu être enregistrée');
  }
};
export const removeFromSession = async (req, res) => {
  try {
    answer(res, await removeChild(Number(req.params.id)));
  } catch (err) {
    fail(res, err, 'L’enfant n’a pas pu être retiré');
  }
};
export const tellTutor = async (req, res) => {
  try {
    answer(res, await tellChildTutors(Number(req.params.id), me(req)));
  } catch (err) {
    fail(res, err, 'Le tuteur n’a pas pu être prévenu');
  }
};
