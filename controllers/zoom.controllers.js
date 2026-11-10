// Remote sessions on Zoom: webhook, sessions to match by hand, sync on demand
import db from '../config/database.js';
import {
  dismissZoomPending,
  resolveZoomPending,
  syncZoom,
  zoomConfigured,
  zoomSignatureOk,
  zoomUrlValidation,
} from '../services/zoom.js';

const me = (req) => Number(req.user?.userid ?? req.user?.userId);
// The participants report is ready a few minutes after the end
const REPORT_DELAY_MS = 15 * 60 * 1000;

// POST /webhooks/zoom (event "meeting.ended", signed by Zoom)
export const zoomWebhook = (req, res) => {
  if (!zoomSignatureOk(req)) return res.status(401).end();
  const { event, payload } = req.body || {};
  // Check made by Zoom when the address is saved
  if (event === 'endpoint.url_validation') {
    return res.json(zoomUrlValidation(String(payload?.plainToken || '')));
  }
  res.status(200).json({ ok: true });
  if (event !== 'meeting.ended' || !zoomConfigured()) return;
  const hostEmail = payload?.object?.host_email || null;
  setTimeout(() => {
    syncZoom({ days: 1, hostEmail })
      .then((r) => console.log(`Zoom webhook: ${r.créée.length} créée, ${r.complétée.length} complétée, ${r.en_attente.length} à rattacher`))
      .catch((err) => console.log('Zoom webhook sync failed:', err.response?.data?.message || err.message));
  }, REPORT_DELAY_MS);
};

export const listZoomPending = async (req, res) => {
  try {
    const [rows] = await db.query(
      `select id, meeting_id, date::text as date, topic, host_name, host_email, student_names, arrival, minutes, reason
         from zoom_pending where resolved_at is null order by date desc`,
      { logging: false }
    );
    res.json(rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les séances Zoom n’ont pas pu être chargées' });
  }
};

// Body: { binome_id }
export const matchZoomPending = async (req, res) => {
  try {
    const result = await resolveZoomPending(Number(req.params.id), Number(req.body.binome_id), me(req));
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La séance n’a pas pu être enregistrée' });
  }
};

export const discardZoomPending = async (req, res) => {
  try {
    if (!(await dismissZoomPending(Number(req.params.id), me(req)))) {
      return res.status(404).json({ error: 'Séance déjà traitée ou introuvable' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La séance n’a pas pu être écartée' });
  }
};

export const syncZoomNow = async (req, res) => {
  if (!zoomConfigured()) {
    return res.status(503).json({ error: 'Synchronisation Zoom non configurée (identifiants manquants)' });
  }
  try {
    const r = await syncZoom({ days: 14 });
    res.json({ created: r.créée.length, completed: r.complétée.length, pending: r.en_attente.length });
  } catch (err) {
    console.log(err);
    res.status(502).json({ error: 'Zoom n’a pas répondu' });
  }
};
