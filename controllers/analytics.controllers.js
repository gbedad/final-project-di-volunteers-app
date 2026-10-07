import { computeAnalytics } from '../services/analytics.js';
import { computeStudentAnalytics } from '../services/studentAnalytics.js';

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

// ?demo=1: the demo students are included (useful while trying the module)
export const getStudentAnalytics = async (req, res) => {
  try {
    res.json(await computeStudentAnalytics({ includeDemo: req.query.demo === '1' }));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not compute the students analysis' });
  }
};
