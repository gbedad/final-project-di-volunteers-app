// Jotform attendance form, used alongside the application: webhook, answers
// to match by hand, sync on demand
import crypto from 'crypto';
import db from '../config/database.js';
import {
  dismissPending,
  importSubmission,
  resolvePending,
  syncJotform,
} from '../services/jotform.js';

const me = (req) => Number(req.user?.userid ?? req.user?.userId);

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// POST /webhooks/jotform/:secret (form data sent by Jotform: submissionID…)
export const jotformWebhook = async (req, res) => {
  if (!process.env.JOTFORM_API_KEY || !sameSecret(req.params.secret, process.env.JOTFORM_WEBHOOK_SECRET)) {
    return res.status(404).end();
  }
  // Jotform only needs to know it was received
  res.status(200).json({ ok: true });
  const id = req.body?.submissionID || req.body?.submission_id;
  if (!/^\d+$/.test(String(id || ''))) return;
  importSubmission(id)
    .then((r) => r && console.log(`Jotform webhook ${id}: ${r.créée.length} créée, ${r.complétée.length} complétée, ${r.en_attente.length} à rattacher`))
    .catch((err) => console.log(`Jotform webhook ${id} failed:`, err.message));
};

// Answers waiting to be matched to a pair
export const listPending = async (req, res) => {
  try {
    const [rows] = await db.query(
      `select id, jotform_id, date::text as date, arrival, tutor_name, student_first, student_last,
              signature_url, reason, created_at
         from jotform_pending where resolved_at is null order by date desc, arrival desc`,
      { logging: false }
    );
    res.json(rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les signatures Jotform n’ont pas pu être chargées' });
  }
};

// Body: { binome_id }
export const matchPending = async (req, res) => {
  try {
    const result = await resolvePending(Number(req.params.id), Number(req.body.binome_id), me(req));
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La séance n’a pas pu être enregistrée' });
  }
};

export const discardPending = async (req, res) => {
  try {
    if (!(await dismissPending(Number(req.params.id), me(req)))) {
      return res.status(404).json({ error: 'Signature déjà traitée ou introuvable' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La signature n’a pas pu être écartée' });
  }
};

// "Synchroniser maintenant" (the hourly check, on demand)
export const syncNow = async (req, res) => {
  if (!process.env.JOTFORM_API_KEY) {
    return res.status(503).json({ error: 'Synchronisation Jotform non configurée (clé API manquante)' });
  }
  try {
    const r = await syncJotform({ days: 30 });
    res.json({
      created: r.créée.length,
      completed: r.complétée.length,
      pending: r.en_attente.length,
      already: r.déjà,
    });
  } catch (err) {
    console.log(err);
    res.status(502).json({ error: 'Jotform n’a pas répondu' });
  }
};
