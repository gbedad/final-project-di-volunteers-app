// Sessions signed on Jotform (attendance form used alongside the
// application): one Jotform answer becomes a session of the matching pair,
// or completes the session already recorded that day. Used by the import of
// an export file and by the automatic sync (webhook + hourly check).
import axios from 'axios';
import { Op } from 'sequelize';
import db from '../config/database.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
// The student arrived this late or more: "très en retard" (Charte)
const LATE_MINUTES = 15;

// ---- Names ----
const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
const words = (v) => norm(v).split(' ').filter(Boolean);
export const studentKey = (first, last) => norm(`${first} ${last}`);
export const tutorKey = (name) => norm(name);

// "Couturier Mimoune" is "Couturier"; first names must be the same
const sameStudent = (row, s) => {
  if (norm(row.first) !== norm(s.first_name)) return false;
  const a = words(row.last);
  const b = words(s.last_name);
  return b.length > 0 && (b.every((w) => a.includes(w)) || a.every((w) => b.includes(w)));
};
// "Regis Aolo" is Régis Aolo: last name, and first name when given; the
// e-mail, when Jotform has it, is enough
const sameTutor = (name, t, email) => {
  if (!t) return false;
  if (email && [t.email, t.email2].some((e) => e && e.toLowerCase() === email)) return true;
  const w = words(name);
  return words(t.last_name).every((x) => w.includes(x)) && (w.length < 2 || w.includes(words(t.first_name)[0]));
};

// ---- Times ----
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const dayOf = (date) => DAYS_FR[new Date(`${date}T12:00:00Z`).getUTCDay()];
// Time of the day in Paris -> instant
const parisInstant = (date, hhmm) => {
  const minutes = minutesOf(hhmm);
  if (minutes === null) return null;
  const [y, m, d] = date.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const asParis = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const asUtc = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utc - (asParis - asUtc));
};

// ---- Matching ----
const loadContext = async () => {
  const pairs = await Binomes.findAll({
    where: { status: { [Op.in]: ['actif', 'en pause', 'terminé'] } },
    raw: true,
  });
  const students = await Students.findAll({
    where: { id: [...new Set(pairs.map((p) => p.student_id))] },
    attributes: ['id', 'first_name', 'last_name'],
    raw: true,
  });
  const tutors = await Users.findAll({
    where: { id: [...new Set(pairs.map((p) => p.tutor_id).filter(Boolean))] },
    attributes: ['id', 'first_name', 'last_name', 'email', 'email2'],
    raw: true,
  });
  const [aliases] = await db.query('select student_key, tutor_key, binome_id from jotform_aliases', {
    logging: false,
  });
  for (const p of pairs) {
    p.student = students.find((s) => s.id === p.student_id);
    p.tutor = tutors.find((t) => t.id === p.tutor_id);
  }
  return { pairs, aliases };
};

// The pair of a Jotform row, or the reason why there is none
const matchRow = (row, { pairs, aliases }) => {
  const alias = aliases.find(
    (a) => a.student_key === studentKey(row.first, row.last) && a.tutor_key === tutorKey(row.tutor)
  );
  if (alias) {
    const pair = pairs.find((p) => p.id === alias.binome_id);
    if (pair) return { pair };
  }
  const ofStudent = pairs.filter((p) => p.student && sameStudent(row, p.student));
  if (!ofStudent.length) return { reason: 'Élève non reconnu' };
  const withTutor = ofStudent.filter((p) => sameTutor(row.tutor, p.tutor, row.tutor_email));
  if (!withTutor.length) return { reason: 'Tuteur différent de celui des binômes de l’élève' };
  if (withTutor.length > 1) return { reason: 'Plusieurs binômes possibles' };
  return { pair: withTutor[0] };
};

// ---- Writing ----
// Session of the pair for this Jotform row (created or completed)
const applyRow = async (row, pair, transaction) => {
  // Lateness only against the slot of that day (a session moved to another
  // day has no start time to compare with); duration from any slot
  const daySlot = (pair.schedule || []).find((s) => s.day === dayOf(row.date)) || null;
  const slot = daySlot || (pair.schedule || [])[0] || null;
  const start = daySlot ? minutesOf(daySlot.startTime) : null;
  const arrival = minutesOf(row.arrival);
  const signedInAt = parisInstant(row.date, row.arrival);
  const existing = await Seances.findOne({ where: { binome_id: pair.id, date: row.date }, transaction });
  if (existing) {
    if (existing.jotform_id) return 'doublon';
    await existing.update(
      {
        jotform_id: row.jot_id,
        jotform_signature_url: row.signature_url || null,
        signed_in_at: existing.signed_in_at || signedInAt,
      },
      { transaction }
    );
    return 'complétée';
  }
  const duration = slot ? minutesOf(slot.endTime) - minutesOf(slot.startTime) : null;
  await Seances.create(
    {
      binome_id: pair.id,
      author_id: null,
      date: row.date,
      attendance: 'présent',
      duration_minutes: duration > 0 ? duration : null,
      // No e-mail to the team: already happened, seen in the log
      late: start !== null && arrival !== null && arrival - start >= LATE_MINUTES,
      signed_in_at: signedInAt,
      source: 'jotform',
      jotform_id: row.jot_id,
      jotform_signature_url: row.signature_url || null,
    },
    { transaction }
  );
  return 'créée';
};

const keep = async (row, reason, transaction) => {
  await db.query(
    `insert into jotform_pending (jotform_id, date, arrival, tutor_name, student_first, student_last, signature_url, reason)
     values (:jot_id, :date, :arrival, :tutor, :first, :last, :signature_url, :reason)
     on conflict (jotform_id) do nothing`,
    {
      replacements: { ...row, signature_url: row.signature_url || null, reason },
      transaction,
      logging: false,
    }
  );
};

// rows: { jot_id, date (YYYY-MM-DD), arrival (HH:MM), tutor, first, last,
// signature_url }. apply false: nothing is written (simulation).
// aliases: names matched by the team, used as if already remembered
export const importJotformRows = async (rows, { apply = false, aliases = [] } = {}) => {
  const context = await loadContext();
  context.aliases.push(...aliases);
  const known = new Set(
    (
      await Seances.findAll({
        where: { jotform_id: { [Op.in]: rows.map((r) => r.jot_id) } },
        attributes: ['jotform_id'],
        raw: true,
      })
    ).map((s) => s.jotform_id)
  );
  const [pendingRows] = await db.query(
    'select jotform_id from jotform_pending where jotform_id in (:ids)',
    { replacements: { ids: rows.length ? rows.map((r) => r.jot_id) : [''] }, logging: false }
  );
  const pendingIds = new Set(pendingRows.map((p) => p.jotform_id));
  const report = { créée: [], complétée: [], doublon: [], déjà: 0, en_attente: [] };
  const run = async (transaction) => {
    for (const row of rows) {
      if (known.has(row.jot_id)) {
        report.déjà += 1;
        continue;
      }
      const { pair, reason } = matchRow(row, context);
      const label = `${row.date} ${row.arrival} ${row.first} ${row.last} / ${row.tutor || '(tuteur vide)'}`;
      if (!pair) {
        if (!pendingIds.has(row.jot_id)) report.en_attente.push(`${label} : ${reason}`);
        if (transaction) await keep(row, reason, transaction);
        continue;
      }
      const target = `${label} -> binôme #${pair.id}`;
      if (!transaction) {
        const exists = await Seances.findOne({ where: { binome_id: pair.id, date: row.date }, raw: true });
        report[exists ? (exists.jotform_id ? 'doublon' : 'complétée') : 'créée'].push(target);
        continue;
      }
      report[await applyRow(row, pair, transaction)].push(target);
    }
  };
  if (apply) await db.transaction(run);
  else await run(null);
  return report;
};

// The team matched a pending Jotform answer to a pair: the session is
// created, and the names are remembered for the next answers
export const resolvePending = async (pendingId, binomeId, userId) => {
  const [[pending]] = await db.query('select * from jotform_pending where id = :id and resolved_at is null', {
    replacements: { id: pendingId },
    logging: false,
  });
  if (!pending) return { error: 'Signature déjà traitée ou introuvable' };
  const pair = (await loadContext()).pairs.find((p) => p.id === Number(binomeId));
  if (!pair) return { error: 'Binôme introuvable' };
  const row = {
    jot_id: pending.jotform_id,
    date: String(pending.date).slice(0, 10),
    arrival: pending.arrival,
    tutor: pending.tutor_name,
    first: pending.student_first,
    last: pending.student_last,
    signature_url: pending.signature_url,
  };
  let result;
  await db.transaction(async (transaction) => {
    result = await applyRow(row, pair, transaction);
    await db.query(
      `insert into jotform_aliases (student_key, tutor_key, binome_id, created_by)
       values (:s, :t, :b, :u) on conflict (student_key, tutor_key) do update set binome_id = :b`,
      {
        replacements: { s: studentKey(row.first, row.last), t: tutorKey(row.tutor), b: pair.id, u: userId },
        transaction,
        logging: false,
      }
    );
    await db.query(
      `update jotform_pending set resolved_at = now(), resolved_by = :u, resolution = :r where id = :id`,
      { replacements: { u: userId, r: `binôme #${pair.id} (${result})`, id: pendingId }, transaction, logging: false }
    );
  });
  return { result, binome_id: pair.id };
};

// The answer is not a tutoring session to keep (test, unknown student…)
export const dismissPending = async (pendingId, userId) => {
  const [, meta] = await db.query(
    `update jotform_pending set resolved_at = now(), resolved_by = :u, resolution = 'écartée'
      where id = :id and resolved_at is null`,
    { replacements: { u: userId, id: pendingId }, logging: false }
  );
  return meta.rowCount > 0;
};

// Names remembered before the import (matched by the team)
export const addAlias = async ({ first, last, tutor }, binomeId, userId, transaction) =>
  db.query(
    `insert into jotform_aliases (student_key, tutor_key, binome_id, created_by)
     values (:s, :t, :b, :u) on conflict (student_key, tutor_key) do update set binome_id = :b`,
    {
      replacements: { s: studentKey(first, last), t: tutorKey(tutor), b: binomeId, u: userId },
      transaction,
      logging: false,
    }
  );

// ---- Automatic sync: Jotform API (webhook on each answer + hourly check) ----

const API_URL = () => process.env.JOTFORM_API_URL || 'https://eu-api.jotform.com';
export const FORM_ID = () => process.env.JOTFORM_FORM_ID || '231863623147053';
// Sessions of the current school year only (pairs exist since then)
const SYNC_SINCE = '2026-09-01';

const pad = (n) => String(n).padStart(2, '0');
// Answer of the question whose label matches
const answerOf = (answers, test) =>
  Object.values(answers || {}).find((a) => test(norm(a.text), a.type) && a.answer !== undefined && a.answer !== '');

// One Jotform submission -> row, or null when it is not usable
export const rowFromSubmission = (sub) => {
  if (!sub || sub.status === 'DELETED') return null;
  const a = sub.answers || {};
  const date = answerOf(a, (t) => t === 'date');
  const time = answerOf(a, (t) => t.startsWith('heure'));
  const first = answerOf(a, (t) => t.startsWith('prenom'));
  const last = answerOf(a, (t) => t.startsWith('nom'));
  // Two "tuteur" questions: the name (widget) and, sometimes, the e-mail
  const tutor = answerOf(a, (t, type) => t === 'tuteur' && type !== 'control_email');
  const tutorEmail = answerOf(a, (t, type) => type === 'control_email' && t.startsWith('tuteur'));
  const signature = answerOf(a, (t) => t.startsWith('signature'));
  const d = date?.answer;
  const day =
    d && typeof d === 'object' && d.year
      ? `${d.year}-${pad(d.month)}-${pad(d.day)}`
      : /^\d{4}-\d{2}-\d{2}/.test(String(sub.created_at)) && String(sub.created_at).slice(0, 10);
  const t = time?.answer;
  const arrival =
    t && typeof t === 'object'
      ? t.timeInput || (t.hourSelect ? `${pad(t.hourSelect)}:${pad(t.minuteSelect || 0)}` : null)
      : String(time?.prettyFormat || t || '').slice(0, 5) || null;
  if (!day || !first || !last) return null;
  return {
    jot_id: String(sub.id),
    date: day,
    arrival,
    tutor: String(tutor?.answer || '').trim(),
    tutor_email: String(tutorEmail?.answer || '').trim().toLowerCase() || null,
    first: String(first.answer).trim(),
    last: String(last.answer).trim(),
    signature_url: typeof signature?.answer === 'string' ? signature.answer : null,
  };
};

const apiGet = async (path, params = {}) => {
  const { data } = await axios.get(`${API_URL()}${path}`, {
    params: { apiKey: process.env.JOTFORM_API_KEY, ...params },
    timeout: 15000,
  });
  return data.content;
};

// Answers of the last days (webhook missed, server asleep…)
export const syncJotform = async ({ days = 14 } = {}) => {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const filter = { 'created_at:gt': since.toISOString().slice(0, 19).replace('T', ' ') };
  const subs = await apiGet(`/form/${FORM_ID()}/submissions`, {
    limit: 1000,
    filter: JSON.stringify(filter),
  });
  const rows = (subs || []).map(rowFromSubmission).filter((r) => r && r.date >= SYNC_SINCE);
  return importJotformRows(rows, { apply: true });
};

// Webhook: Jotform says which answer is new; it is read again from the API
// (nothing sent to the webhook itself is trusted)
export const importSubmission = async (submissionId) => {
  const sub = await apiGet(`/submission/${encodeURIComponent(submissionId)}`);
  if (String(sub?.form_id) !== FORM_ID()) return null;
  const row = rowFromSubmission(sub);
  if (!row || row.date < SYNC_SINCE) return null;
  return importJotformRows([row], { apply: true });
};

export const scheduleJotformSync = () => {
  if (!process.env.JOTFORM_API_KEY) {
    console.log('Jotform sync off (no JOTFORM_API_KEY)');
    return;
  }
  const run = () =>
    syncJotform()
      .then((r) => {
        const n = r.créée.length + r.complétée.length;
        if (n || r.en_attente.length) {
          console.log(`Jotform: ${n} session(s) recorded, ${r.en_attente.length} to match by hand`);
        }
      })
      .catch((err) => console.log('Jotform sync failed:', err.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
};
