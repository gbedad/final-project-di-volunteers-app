import { outingStats } from '../services/outingStats.js';
// Annual report for the funders
import { annualReport, currentYear } from '../services/annualReport.js';

// ?year=2026-2027 (default: the current school year)
export const getAnnualReport = async (req, res) => {
  const year = /^\d{4}-\d{4}$/.test(req.query.year || '') ? req.query.year : currentYear();
  try {
    // The cultural outings of the same year, with the tutoring
    const [report, outings] = await Promise.all([annualReport(year), outingStats(year)]);
    res.json({ ...report, outings });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Le rapport n’a pas pu être calculé' });
  }
};

// "Sorties" view of the analysis: the outings of a school year
export const getOutingAnalytics = async (req, res) => {
  const year = /^\d{4}-\d{4}$/.test(req.query.year || '') ? req.query.year : currentYear();
  try {
    res.json(await outingStats(year));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'L’analyse des sorties n’a pas pu être calculée' });
  }
};
