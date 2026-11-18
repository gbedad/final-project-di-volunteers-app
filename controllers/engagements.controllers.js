// Activities of a volunteer: the wishes (the volunteer, or the team for
// him) and the final choice (the team)
import Users from '../models/users.model.js';
import {
  cleanList,
  ENGAGEMENTS,
  OUTING_PERIODS,
  engagementsOf,
} from '../services/engagements.js';

const shown = (u) => ({
  engagements_wished: u.engagements_wished || [],
  engagements: u.engagements || null,
  effective: engagementsOf(u),
  outing_periods: u.outing_periods || [],
});
const ATTRS = ['id', 'role', 'engagements', 'engagements_wished', 'outing_periods'];

// The volunteer's wishes and periods (his own space)
export const updateWishes = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.id, { attributes: ATTRS });
    if (!user || user.role !== 'volunteer') return res.status(404).json({ error: 'Bénévole introuvable' });
    const set = {};
    if ('engagements_wished' in req.body) {
      const list = cleanList(req.body.engagements_wished, ENGAGEMENTS);
      if (!list) return res.status(400).json({ error: 'Choisissez au moins une activité' });
      set.engagements_wished = list;
    }
    if ('outing_periods' in req.body) {
      set.outing_periods = cleanList(req.body.outing_periods, OUTING_PERIODS) || [];
    }
    if (!Object.keys(set).length) return res.status(400).json({ error: 'Rien à modifier' });
    await user.update(set);
    res.json(shown(user));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Les activités n'ont pas pu être enregistrées" });
  }
};

// The team's choice (empty: back to the wishes)
export const assignEngagements = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.id, { attributes: ATTRS });
    if (!user || user.role !== 'volunteer') return res.status(404).json({ error: 'Bénévole introuvable' });
    if (!Array.isArray(req.body.engagements)) return res.status(400).json({ error: 'Activités attendues' });
    await user.update({ engagements: cleanList(req.body.engagements, ENGAGEMENTS) });
    res.json(shown(user));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Les activités n'ont pas pu être affectées" });
  }
};
