// Annual report for the funders
import { annualReport, currentYear } from '../services/annualReport.js';

// ?year=2026-2027 (default: the current school year)
export const getAnnualReport = async (req, res) => {
  const year = /^\d{4}-\d{4}$/.test(req.query.year || '') ? req.query.year : currentYear();
  try {
    res.json(await annualReport(year));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Le rapport n’a pas pu être calculé' });
  }
};
