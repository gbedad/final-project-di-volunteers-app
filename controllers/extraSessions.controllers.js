// Exceptional sessions of a pair (team): in addition to the slot, or
// instead of a regular session. The family is told by the association
// (WhatsApp), not by e-mail.
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { addExtra, extrasOf, findExtra, removeExtra } from '../services/extraSessions.js';
import { parisToday } from '../services/sessionLog.js';

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
    if (await Seances.count({ where: { binome_id: extra.binome_id, date: extra.date, extra_id: extra.id } })) {
      return res.status(409).json({ error: 'Une séance est enregistrée ce jour-là : supprimez-la d’abord' });
    }
    await removeExtra(extra);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'annulation n'a pas pu être enregistrée");
  }
};

// The tutor declares today's session without recording it: a session moved
// (replacing today's slot) or one in addition without a slot. The sign-in
// then comes from the card "Fin de séance : émarger", as for the others.
// Body: { kind: 'remplacement' | 'supplementaire', start_time, end_time }
export const tutorDeclareToday = async (req, res) => {
  try {
    const pair = await Binomes.findByPk(req.params.id, { raw: true });
    if (!pair || pair.tutor_id !== me(req)) return res.status(404).json({ error: 'Binôme introuvable' });
    if (pair.status !== 'actif') return res.status(409).json({ error: 'Ce binôme n’est pas en cours' });
    const date = parisToday();
    const kind = req.body.kind === 'remplacement' ? 'remplacement' : 'supplementaire';
    // A moved session replaces the slot: not once the slot is recorded that day
    if (kind === 'remplacement' && (await Seances.count({ where: { binome_id: pair.id, date, extra_id: null } }))) {
      return res.status(409).json({ error: 'Le créneau est déjà enregistré aujourd’hui' });
    }
    const out = await addExtra(
      pair,
      {
        kind,
        date,
        start_time: req.body.start_time,
        end_time: req.body.end_time,
        remote: false,
        replaces_date: date,
        note: kind === 'remplacement' ? 'Déclarée par le tuteur (créneau déplacé)' : 'Déclarée par le tuteur',
      },
      me(req),
      { byTutor: true }
    );
    if (out.error) return res.status(400).json({ error: out.error });
    res.status(201).json(out.extra);
  } catch (err) {
    fail(res, err, "La séance n'a pas pu être déclarée");
  }
};
