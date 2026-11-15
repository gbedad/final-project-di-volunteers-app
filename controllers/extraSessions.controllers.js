// Exceptional sessions of a pair (team): in addition to the slot, or
// instead of a regular session. The family is told by the association
// (WhatsApp), not by e-mail.
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { addExtra, extrasOf, findExtra, removeExtra } from '../services/extraSessions.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);
const OPEN = ['actif', 'en pause'];
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};

export const listExtras = async (req, res) => {
  try {
    const all = await extrasOf([Number(req.params.id)]);
    res.json(all[req.params.id] || []);
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};

// Body: { kind, date, start_time, end_time, remote, replaces_date, note }
export const teamAddExtra = async (req, res) => {
  try {
    const pair = await Binomes.findByPk(req.params.id, { raw: true });
    if (!pair) return res.status(404).json({ error: 'Binôme introuvable' });
    if (!OPEN.includes(pair.status)) return res.status(409).json({ error: 'Ce binôme n’est pas en cours' });
    const out = await addExtra(pair, req.body, me(req));
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out.extra);
  } catch (err) {
    fail(res, err, "La séance n'a pas pu être enregistrée");
  }
};

// Cancelled (a replacement gives the regular session back); not once a
// session is recorded that day
export const teamDeleteExtra = async (req, res) => {
  try {
    const extra = await findExtra(Number(req.params.id));
    if (!extra) return res.status(404).json({ error: 'Introuvable' });
    if (await Seances.count({ where: { binome_id: extra.binome_id, date: extra.date } })) {
      return res.status(409).json({ error: 'Une séance est enregistrée ce jour-là : supprimez-la d’abord' });
    }
    await removeExtra(extra);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'annulation n'a pas pu être enregistrée");
  }
};
