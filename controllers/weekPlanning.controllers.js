import { weekPlanning, defaultWeekStart } from '../services/weekPlanning.js';
import { weekOf, toDate } from '../services/schoolCalendar.js';

// Planning of a week: ?from=YYYY-MM-DD (any day of the week, moved to its
// Monday); by default the next week
export const getWeekPlanning = async (req, res) => {
  const given = req.query.from;
  if (given && (!/^\d{4}-\d{2}-\d{2}$/.test(given) || Number.isNaN(toDate(given).getTime()))) {
    return res.status(400).json({ error: 'Date invalide' });
  }
  try {
    const from = given ? weekOf(given) : defaultWeekStart();
    res.json(await weekPlanning(from));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Le planning de la semaine n\'a pas pu être chargé' });
  }
};
