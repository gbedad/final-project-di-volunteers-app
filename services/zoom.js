// Remote sessions held on Zoom (meetings created by Moodle on the
// association's account). A Zoom meeting of a day becomes a session of the
// matching pair: the student's first arrival (waiting room excluded) and the
// time spent together. Basic hosts are cut every 40 minutes: the parts of a
// day are one session. Only times are kept: no recording, no address.
import crypto from 'crypto';
import axios from 'axios';
import { Op } from 'sequelize';
import db from '../config/database.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';
import { slotOn } from './pairSchedule.js';

// The student arrived this late or more: "très en retard" (Charte)
const LATE_MINUTES = 15;
// Less than this together: not a session (wrong link, test…)
const MIN_MINUTES = 5;
// The tutor alone this long, the student never there: "L'élève n'est pas
// venu" (only for a meeting opened during the slot of that day)
const ABSENT_MINUTES = 25;
// The tutor may open the meeting a little before the slot
const EARLY_MINUTES = 30;
// Sessions of the current school year only (pairs exist since then)
export const ZOOM_SINCE = '2026-09-01';

export const zoomConfigured = () =>
  !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);

// ---- Names and times ----
const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
const words = (v) => norm(v).split(' ').filter(Boolean);
const parisDate = (value) => new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisMinutes = (value) => {
  const [h, m] = new Date(value)
    .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
    .split(':')
    .map(Number);
  return h * 60 + m;
};
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const meetingNumber = (id) => String(id || '').replace(/\D/g, '');

// ---- API (server-to-server app, read only) ----
let token = { value: null, until: 0 };
const accessToken = async () => {
  if (token.value && Date.now() < token.until) return token.value;
  const { data } = await axios.post('https://zoom.us/oauth/token', null, {
    params: { grant_type: 'account_credentials', account_id: process.env.ZOOM_ACCOUNT_ID },
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64'),
    },
    timeout: 15000,
  });
  token = { value: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
  return token.value;
};
const zoomGet = async (path, params = {}) => {
  const { data } = await axios.get(`https://api.zoom.us/v2${path}`, {
    params,
    headers: { Authorization: `Bearer ${await accessToken()}` },
    timeout: 20000,
  });
  return data;
};
// Every page of a list
const allPages = async (path, key, params = {}) => {
  const items = [];
  let next = '';
  do {
    const data = await zoomGet(path, { page_size: 300, ...params, ...(next ? { next_page_token: next } : {}) });
    items.push(...(data[key] || []));
    next = data.next_page_token || '';
  } while (next);
  return items;
};
// A meeting UUID can contain "/": encoded twice for the API
const uuidPath = (uuid) => encodeURIComponent(encodeURIComponent(uuid));

// ---- One session from the parts of a day ----
const intervals = (parts) =>
  parts
    .map((p) => [new Date(p.join_time).getTime(), new Date(p.leave_time).getTime()])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
const union = (list) => {
  const out = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
};
const overlapMs = (xs, ys) => {
  let total = 0;
  for (const [a, b] of xs) for (const [c, d] of ys) total += Math.max(0, Math.min(b, d) - Math.max(a, c));
  return total;
};

// instances: [{ uuid, topic, host_email, start_time, participants: [...] }]
// of the same meeting and day -> session facts, or null (nobody with the host)
export const sessionFromInstances = (meetingId, instances) => {
  const hostEmail = (instances.find((i) => i.host_email)?.host_email || '').toLowerCase();
  const all = instances.flatMap((i) => i.participants || []);
  const inMeeting = all.filter((p) => p.status !== 'in_waiting_room');
  const isHost = (p) =>
    (hostEmail && (p.user_email || '').toLowerCase() === hostEmail) || /\(host\)|\(hôte\)/i.test(p.name || '');
  const host = union(intervals(inMeeting.filter(isHost)));
  const others = inMeeting.filter((p) => !isHost(p));
  const student = union(intervals(others));
  // Without the host's times (rare), the student's own time
  const minutes = Math.round((host.length ? overlapMs(student, host) : overlapMs(student, student)) / 60000);
  const hostTimes = inMeeting.filter(isHost).map((p) => new Date(p.join_time).getTime());
  const hostAt = hostTimes.length ? new Date(Math.min(...hostTimes)) : null;
  if (!others.length || minutes < MIN_MINUTES) {
    // Nobody came: an absence if the tutor waited long enough alone
    const alone = Math.round(overlapMs(host, host) / 60000);
    if (!hostAt || alone < ABSENT_MINUTES) return null;
    return {
      meeting_id: meetingNumber(meetingId),
      date: parisDate(hostAt),
      topic: instances.find((i) => i.topic)?.topic || '',
      host_email: hostEmail || null,
      host_name: instances.find((i) => i.host_name)?.host_name || null,
      student_names: [],
      arrival: null,
      host_at: hostAt,
      minutes: 0,
      absent: true,
      alone,
    };
  }
  // Arrival: the first connection, waiting room included (the student was
  // there); the tutor's: the first time in the meeting
  const arrival = new Date(
    Math.min(...all.filter((p) => !isHost(p)).map((p) => new Date(p.join_time).getTime()))
  );
  return {
    meeting_id: meetingNumber(meetingId),
    date: parisDate(arrival),
    topic: instances.find((i) => i.topic)?.topic || '',
    host_email: hostEmail || null,
    host_name: instances.find((i) => i.host_name)?.host_name || null,
    student_names: [...new Set(others.map((p) => (p.name || '').trim()).filter(Boolean))],
    arrival,
    host_at: hostAt,
    minutes,
  };
};

// ---- Matching ----
const PAIR_STATUSES = ['actif', 'en pause', 'terminé'];
const loadContext = async () => {
  const pairs = await Binomes.findAll({ where: { status: { [Op.in]: PAIR_STATUSES } }, raw: true });
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
  for (const p of pairs) {
    p.student = students.find((s) => s.id === p.student_id);
    p.tutor = tutors.find((t) => t.id === p.tutor_id);
  }
  return { pairs, tutors };
};
const tutorEmails = (t) => [t?.email, t?.email2].filter(Boolean).map((e) => e.toLowerCase());

// The pair of a Zoom session, or the reason why there is none
export const matchSession = (s, { pairs }) => {
  const known = pairs.filter((p) => p.zoom_meeting_id === s.meeting_id);
  if (known.length === 1) return { pair: known[0] };
  const ofHost = pairs.filter((p) => s.host_email && tutorEmails(p.tutor).includes(s.host_email));
  if (!ofHost.length) return { reason: 'Hôte Zoom inconnu (e-mail différent de celui du tuteur)' };
  // The student's first name in the meeting's name ("Classe virtuelle de
  // Jade et Sonia") or in the name used to join
  const seen = new Set([...words(s.topic), ...s.student_names.flatMap(words)]);
  const named = ofHost.filter((p) => p.student && words(p.student.first_name).every((w) => seen.has(w)));
  if (named.length === 1) return { pair: named[0], learn: true };
  if (named.length > 1) return { reason: 'Plusieurs binômes possibles pour ce tuteur' };
  if (ofHost.length === 1 && known.length === 0) return { pair: ofHost[0], learn: true };
  return { reason: 'Élève non reconnu dans la réunion' };
};

// ---- Writing ----
const zoomKey = (s) => `${s.meeting_id}:${s.date}`;
const applySession = async (s, pair, transaction) => {
  // Slot in force on that date (a change of slot does not rewrite the past)
  const daySlot = slotOn(pair, s.date);
  const start = daySlot ? minutesOf(daySlot.startTime) : null;
  const end = daySlot ? minutesOf(daySlot.endTime) : null;
  if (s.absent) return applyAbsence(s, pair, { start, end }, transaction);
  const arrival = parisMinutes(s.arrival);
  // The session starts at the later of the slot and the tutor's arrival: a
  // student is not late because the tutor opened the meeting later. Only
  // within the slot of that day (a session moved to another time says
  // nothing about lateness).
  const begins = s.host_at ? Math.max(start ?? 0, parisMinutes(s.host_at)) : start;
  const late = start !== null && arrival - begins >= LATE_MINUTES && arrival < end;
  const existing = await Seances.findOne({ where: { binome_id: pair.id, date: s.date }, transaction });
  let result;
  // An absence read from Zoom, and the student came after all (later, or on
  // another link): the session took place
  if (existing && existing.source === 'zoom' && existing.attendance === 'absent') {
    await existing.update(
      {
        zoom_key: zoomKey(s),
        attendance: 'présent',
        duration_minutes: s.minutes,
        signed_in_at: s.arrival,
        zoom_host_at: s.host_at || existing.zoom_host_at || null,
        late,
      },
      { transaction }
    );
    return 'mise à jour';
  }
  if (existing) {
    if (existing.zoom_key && existing.zoom_key !== zoomKey(s)) return 'doublon';
    // Same day again (a later part, a new reading): the latest figures
    await existing.update(
      {
        zoom_key: zoomKey(s),
        signed_in_at: existing.signed_in_at && !existing.zoom_key ? existing.signed_in_at : s.arrival,
        duration_minutes: existing.zoom_key || !existing.duration_minutes ? s.minutes : existing.duration_minutes,
        zoom_host_at: s.host_at || existing.zoom_host_at || null,
        ...(existing.source === 'zoom' ? { late } : {}),
      },
      { transaction }
    );
    result = existing.zoom_key ? 'mise à jour' : 'complétée';
  } else {
    await Seances.create(
      {
        binome_id: pair.id,
        author_id: null,
        date: s.date,
        attendance: 'présent',
        duration_minutes: s.minutes,
        // No e-mail to the team: seen in the log
        late,
        signed_in_at: s.arrival,
        zoom_host_at: s.host_at || null,
        source: 'zoom',
        zoom_key: zoomKey(s),
      },
      { transaction }
    );
    result = 'créée';
  }
  if (!pair.zoom_meeting_id) {
    await Binomes.update({ zoom_meeting_id: s.meeting_id }, { where: { id: pair.id }, transaction });
    pair.zoom_meeting_id = s.meeting_id;
  }
  return result;
};

// The tutor waited alone: "L'élève n'est pas venu", if the meeting was
// opened during the slot of that day (or just before)
// (transaction null: simulation, nothing written)
const applyAbsence = async (s, pair, { start, end }, transaction) => {
  const opened = parisMinutes(s.host_at);
  if (start === null || opened < start - EARLY_MINUTES || opened >= end) return 'ignorée';
  if (await Seances.count({ where: { binome_id: pair.id, date: s.date }, transaction })) return 'doublon';
  if (!transaction) return 'absence';
  await Seances.create(
    {
      binome_id: pair.id,
      author_id: null,
      date: s.date,
      attendance: 'absent',
      duration_minutes: null,
      late: false,
      signed_in_at: null,
      zoom_host_at: s.host_at,
      source: 'zoom',
      zoom_key: zoomKey(s),
    },
    { transaction }
  );
  return 'absence';
};

const keep = (s, reason, transaction) =>
  db.query(
    `insert into zoom_pending (zoom_key, meeting_id, date, topic, host_email, host_name, student_names, arrival, minutes, reason)
     values (:key, :meeting_id, :date, :topic, :host_email, :host_name, :names, :arrival, :minutes, :reason)
     on conflict (zoom_key) do update set minutes = excluded.minutes, student_names = excluded.student_names
       where zoom_pending.resolved_at is null`,
    {
      replacements: { ...s, key: zoomKey(s), names: s.student_names.join(', '), reason },
      transaction,
      logging: false,
    }
  );

// sessions: from sessionFromInstances. apply false: nothing is written.
export const importZoomSessions = async (sessions, { apply = false } = {}) => {
  const context = await loadContext();
  const report = { créée: [], complétée: [], 'mise à jour': [], absence: [], ignorée: [], doublon: [], en_attente: [] };
  // Sessions that took place first: an absence never hides one
  sessions = [...sessions].sort((a, b) => !!a.absent - !!b.absent);
  const [resolved] = await db.query('select zoom_key from zoom_pending where resolved_at is not null', {
    logging: false,
  });
  const done = new Set(resolved.map((r) => r.zoom_key));
  const run = async (transaction) => {
    for (const s of sessions) {
      if (done.has(zoomKey(s))) continue;
      const label = s.absent
        ? `${s.date} ${s.topic || s.meeting_id} (tuteur seul ${s.alone} min)`
        : `${s.date} ${s.topic || s.meeting_id} (${s.student_names.join(', ')}) ${s.minutes} min`;
      const { pair, reason } = matchSession(s, context);
      // An absence nobody can place is left aside (nothing to match by hand)
      if (!pair && s.absent) {
        report.ignorée.push(`${label} : ${reason}`);
        continue;
      }
      if (!pair) {
        report.en_attente.push(`${label} : ${reason}`);
        if (transaction) await keep(s, reason, transaction);
        continue;
      }
      const target = `${label} -> binôme #${pair.id}`;
      if (!transaction && s.absent) {
        const slot = slotOn(pair, s.date);
        report[
          await applyAbsence(s, pair, { start: slot ? minutesOf(slot.startTime) : null, end: slot ? minutesOf(slot.endTime) : null }, null)
        ].push(target);
        continue;
      }
      if (!transaction) {
        const existing = await Seances.findOne({ where: { binome_id: pair.id, date: s.date }, raw: true });
        report[
          !existing ? 'créée' : existing.zoom_key === zoomKey(s) ? 'mise à jour' : existing.zoom_key ? 'doublon' : 'complétée'
        ].push(target);
        continue;
      }
      report[await applySession(s, pair, transaction)].push(target);
    }
  };
  if (apply) await db.transaction(run);
  else await run(null);
  return report;
};

// ---- Reading Zoom ----
// Meetings of the tutors (hosts) between two days, grouped by meeting and
// day, read with their participants
export const readZoomSessions = async ({ from, to, hostEmail }) => {
  const { tutors } = await loadContext();
  const zoomUsers = await allPages('/users', 'users', { status: 'active' });
  const emails = new Set(tutors.flatMap(tutorEmails));
  const hosts = zoomUsers.filter(
    (u) =>
      emails.has((u.email || '').toLowerCase()) &&
      (!hostEmail || (u.email || '').toLowerCase() === hostEmail.toLowerCase())
  );
  const groups = {};
  for (const host of hosts) {
    // The report gives at most one month per call
    for (let start = from; start <= to; ) {
      const endOfMonth = new Date(`${start}T12:00:00Z`);
      endOfMonth.setUTCDate(endOfMonth.getUTCDate() + 29);
      const end = endOfMonth.toISOString().slice(0, 10) < to ? endOfMonth.toISOString().slice(0, 10) : to;
      const meetings = await allPages(`/report/users/${host.id}/meetings`, 'meetings', { from: start, to: end });
      for (const m of meetings) {
        // A meeting with the tutor alone may be an absence
        if ((m.participants_count || 0) < 1) continue;
        const key = `${meetingNumber(m.id)}:${parisDate(m.start_time)}`;
        (groups[key] = groups[key] || []).push({ ...m, host_email: host.email, host_name: `${host.first_name} ${host.last_name}` });
      }
      const next = new Date(`${end}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      start = next.toISOString().slice(0, 10);
    }
  }
  const sessions = [];
  for (const instances of Object.values(groups)) {
    for (const i of instances) {
      i.participants = await allPages(`/report/meetings/${uuidPath(i.uuid)}/participants`, 'participants');
    }
    const s = sessionFromInstances(instances[0].id, instances);
    if (s && s.date >= ZOOM_SINCE) sessions.push(s);
  }
  return sessions;
};

const isoDay = (d) => d.toISOString().slice(0, 10);
export const syncZoom = async ({ days = 3, from, to, hostEmail, apply = true } = {}) => {
  const end = to || parisDate(new Date());
  const start = from || isoDay(new Date(Date.now() - days * 24 * 3600 * 1000));
  const sessions = await readZoomSessions({ from: start < ZOOM_SINCE ? ZOOM_SINCE : start, to: end, hostEmail });
  return importZoomSessions(sessions, { apply });
};

// ---- Pending sessions matched by the team ----
export const resolveZoomPending = async (pendingId, binomeId, userId) => {
  const [[p]] = await db.query('select * from zoom_pending where id = :id and resolved_at is null', {
    replacements: { id: pendingId },
    logging: false,
  });
  if (!p) return { error: 'Séance déjà traitée ou introuvable' };
  const pair = (await loadContext()).pairs.find((x) => x.id === Number(binomeId));
  if (!pair) return { error: 'Binôme introuvable' };
  const s = {
    meeting_id: p.meeting_id,
    date: String(p.date).slice(0, 10),
    arrival: p.arrival,
    minutes: p.minutes,
  };
  let result;
  await db.transaction(async (transaction) => {
    // The meeting is the pair's from now on
    await Binomes.update({ zoom_meeting_id: p.meeting_id }, { where: { id: pair.id }, transaction });
    pair.zoom_meeting_id = p.meeting_id;
    result = await applySession(s, pair, transaction);
    await db.query(
      'update zoom_pending set resolved_at = now(), resolved_by = :u, resolution = :r where id = :id',
      { replacements: { u: userId, r: `binôme #${pair.id} (${result})`, id: pendingId }, transaction, logging: false }
    );
  });
  return { result, binome_id: pair.id };
};

export const dismissZoomPending = async (pendingId, userId) => {
  const [, meta] = await db.query(
    `update zoom_pending set resolved_at = now(), resolved_by = :u, resolution = 'écartée'
      where id = :id and resolved_at is null`,
    { replacements: { u: userId, id: pendingId }, logging: false }
  );
  return meta.rowCount > 0;
};

// ---- Webhook ----
// Zoom signs its calls: v0=HMAC-SHA256(secret, "v0:{timestamp}:{body}")
export const zoomSignatureOk = (req) => {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const ts = req.headers['x-zm-request-timestamp'];
  const sig = String(req.headers['x-zm-signature'] || '');
  if (!secret || !ts || !req.rawBody) return false;
  // Older than 5 minutes: refused (replay)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${req.rawBody}`).digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};
// Answer to the check Zoom makes when the address is saved
export const zoomUrlValidation = (plainToken) => ({
  plainToken,
  encryptedToken: crypto
    .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '')
    .update(plainToken)
    .digest('hex'),
});

// ---- Schedule ----
export const scheduleZoomSync = () => {
  if (!zoomConfigured()) {
    console.log('Zoom sync off (no ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET)');
    return;
  }
  const run = () =>
    syncZoom({ days: 3 })
      .then((r) => {
        const n = r.créée.length + r.complétée.length;
        if (n || r.en_attente.length) {
          console.log(`Zoom: ${n} session(s) recorded, ${r.en_attente.length} to match by hand`);
        }
      })
      .catch((err) => console.log('Zoom sync failed:', err.response?.data?.message || err.message));
  setTimeout(run, 90 * 1000);
  setInterval(run, 60 * 60 * 1000);
};
