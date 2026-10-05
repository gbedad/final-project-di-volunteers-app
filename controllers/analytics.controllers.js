import { computeAnalytics } from '../services/analytics.js';

// ?scope=active (default) | validated | all: which tutors the profile and
// supply figures are about; recruitment always covers every volunteer
export const getAnalytics = async (req, res) => {
  try {
    res.json(await computeAnalytics({ scope: req.query.scope }));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not compute the analysis' });
  }
};
