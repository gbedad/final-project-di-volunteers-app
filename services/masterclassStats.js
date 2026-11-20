// Master Classes of a school year, read from the MCL application (registration
// app of the Master Classes). Pull: nothing is stored here, the figures come
// from MCL each time. Anonymous totals only. A failure never breaks a page:
// the block just says the figures are unavailable.
import { yearRange, currentYear } from './annualReport.js';

const base = () => (process.env.MCL_URL || '').replace(/\/$/, '');

export const masterclassStats = async (year = currentYear()) => {
  const key = process.env.MCL_STATS_API_KEY;
  if (!base() || !key) return { status: 'not_configured' };
  try {
    const r = await fetch(`${base()}/api/stats?annee=${yearRange(year).year}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { status: 'unavailable', http: r.status };
    const data = await r.json();
    if (!data?.totaux || !Array.isArray(data.editions)) return { status: 'unavailable' };
    return { status: 'ok', ...data };
  } catch (err) {
    console.log('MCL stats:', err.message);
    return { status: 'unavailable' };
  }
};
