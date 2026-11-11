// "Borne d'émargement": a tablet on site where the tutor signs in, the
// student signs and the tutor writes the report, without logging in. The
// tablet is activated by a link from the team; each step is checked with
// the last four digits of the tutor's phone.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import db from '../config/database.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import Students from '../models/students/students.model.js';
import Users from '../models/users.model.js';
import { clientUrl } from '../config/notify.js';
import { writeObject } from '../services/conventionSigning.js';
import { slotOn } from '../services/pairSchedule.js';
import { needsSignIn, tellLate } from './binomes.controllers.js';

const me = (req) => Number(req.user?.userid ?? req.user?.userId);
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const parisToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Minors: first name and initial only on a shared screen
const short = (p) => (p ? `${p.first_name} ${(p.last_name || '').charAt(0)}.` : '');
const STEP_SECRET = () => `${process.env.ACCESS_TOKEN_SECRET}:kiosk`;

// ---- Team: the tablets ----
export const listKiosks = async (req, res) => {
  const [rows] = await db.query(
    'select id, name, site, created_at, last_seen_at, revoked_at from kiosks order by created_at desc',
    { logging: false }
  );
  res.json(rows);
};

// Body: { name, site } -> the activation link, shown once
export const createKiosk = async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Donnez un nom à la borne (ex. « Tablette MdA »)' });
  const token = crypto.randomBytes(24).toString('base64url');
  const [[row]] = await db.query(
    `insert into kiosks (name, site, token_hash, created_by) values (:name, :site, :h, :u) returning id`,
    { replacements: { name, site: String(req.body.site || '').trim() || null, h: hash(token), u: me(req) }, logging: false }
  );
  res.status(201).json({ id: row.id, link: `${clientUrl()}/borne?code=${token}` });
};

export const revokeKiosk = async (req, res) => {
  await db.query('update kiosks set revoked_at = now() where id = :id and revoked_at is null', {
    replacements: { id: Number(req.params.id) },
    logging: false,
  });
  res.json({ ok: true });
};

// ---- The tablet ----
export const kioskAuth = async (req, res, next) => {
  const token = req.headers['x-kiosk-token'];
  if (!token) return res.status(401).json({ error: 'Borne non activée', code: 'kiosk' });
  const [[kiosk]] = await db.query(
    'select id, name, site, last_seen_at from kiosks where token_hash = :h and revoked_at is null',
    { replacements: { h: hash(token) }, logging: false }
  );
  if (!kiosk) return res.status(401).json({ error: 'Borne désactivée ou inconnue', code: 'kiosk' });
  req.kiosk = kiosk;
  if (!kiosk.last_seen_at || Date.now() - new Date(kiosk.last_seen_at) > 5 * 60000) {
    db.query('update kiosks set last_seen_at = now() where id = :id', { replacements: { id: kiosk.id }, logging: false }).catch(() => {});
  }
  next();
};

const sameSite = (a, b) => {
  const n = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return !a || !b || n(a).includes(n(b)) || n(b).includes(n(a));
};

// Today's on-site pairs (those with a slot today first) and where each stands
export const kioskToday = async (req, res) => {
  const today = parisToday();
  const pairs = (await Binomes.findAll({ where: { status: 'actif' }, raw: true })).filter(
    (p) => needsSignIn(p) && sameSite(p.site, req.kiosk.site)
  );
  const students = await Students.findAll({
    where: { id: pairs.map((p) => p.student_id), is_demo: { [Op.not]: true } },
    attributes: ['id', 'first_name', 'last_name'],
    raw: true,
  });
  const tutors = await Users.findAll({
    where: { id: pairs.map((p) => p.tutor_id), is_demo: { [Op.not]: true } },
    attributes: ['id', 'first_name', 'last_name'],
    raw: true,
  });
  const sessions = await Seances.findAll({
    where: { binome_id: pairs.map((p) => p.id), date: today },
    raw: true,
  });
  const rows = pairs
    .map((p) => {
      const student = students.find((s) => s.id === p.student_id);
      const tutor = tutors.find((t) => t.id === p.tutor_id);
      if (!student || !tutor) return null;
      const slot = slotOn(p, today);
      const s = sessions.find((x) => x.binome_id === p.id);
      return {
        id: p.id,
        student: short(student),
        student_first: student.first_name,
        tutor: short(tutor),
        subjects: p.subjects || [],
        slot,
        session: s
          ? {
              id: s.id,
              attendance: s.attendance,
              late: s.late,
              signed: !!s.student_signed_at,
              no_signature: !!s.no_signature,
              reported: !!(s.work || s.remark || s.progress),
            }
          : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (!!b.slot - !!a.slot) || String(a.slot?.startTime || '').localeCompare(String(b.slot?.startTime || '')) || a.student.localeCompare(b.student));
  res.json({ kiosk: { name: req.kiosk.name, site: req.kiosk.site }, today, pairs: rows });
};

// Wrong codes: a few tries per pair and tablet, then a pause
const tries = new Map();
// Body: { digits } (last four digits of the tutor's phone) -> a short pass
export const kioskVerify = async (req, res) => {
  const pair = await Binomes.findByPk(req.params.id, { raw: true });
  if (!pair || pair.status !== 'actif') return res.status(404).json({ error: 'Binôme introuvable' });
  const key = `${req.kiosk.id}:${pair.id}`;
  const t = tries.get(key) || { n: 0, at: 0 };
  if (t.n >= 5 && Date.now() - t.at < 10 * 60000) {
    return res.status(429).json({ error: 'Trop d’essais : réessayez dans 10 minutes, ou émargez depuis votre téléphone.' });
  }
  const tutor = await Users.findByPk(pair.tutor_id, { attributes: ['id', 'first_name', 'phone'] });
  const digits = String(tutor?.phone || '').replace(/\D/g, '');
  if (digits.length < 4) {
    return res.status(409).json({ error: 'Aucun téléphone sur votre fiche : émargez depuis votre téléphone, ou demandez à l’équipe de l’ajouter.' });
  }
  if (String(req.body.digits || '') !== digits.slice(-4)) {
    tries.set(key, { n: t.n + 1, at: Date.now() });
    return res.status(403).json({ error: 'Ce ne sont pas les 4 derniers chiffres de votre téléphone.' });
  }
  tries.delete(key);
  const pass = jwt.sign({ pair: pair.id, kiosk: req.kiosk.id, tutor: pair.tutor_id }, STEP_SECRET(), { expiresIn: '20m' });
  res.json({ pass, tutor_first_name: tutor.first_name });
};

// The pass of the pair (header x-kiosk-pass)
const passOf = (req, pairId) => {
  try {
    const p = jwt.verify(String(req.headers['x-kiosk-pass'] || ''), STEP_SECRET());
    return p.kiosk === req.kiosk.id && p.pair === Number(pairId) ? p : null;
  } catch {
    return null;
  }
};

// Body: { attendance: 'présent' | 'absent', late }
export const kioskSignIn = async (req, res) => {
  const pass = passOf(req, req.params.id);
  if (!pass) return res.status(401).json({ error: 'Recommencez : touchez votre binôme et tapez votre code.' });
  const pair = await Binomes.findByPk(req.params.id);
  if (!pair || pair.status !== 'actif') return res.status(404).json({ error: 'Binôme introuvable' });
  const date = parisToday();
  if (await Seances.count({ where: { binome_id: pair.id, date } })) {
    return res.status(409).json({ error: 'Séance déjà émargée aujourd’hui' });
  }
  const attendance = req.body.attendance === 'absent' ? 'absent' : 'présent';
  const late = attendance === 'présent' && req.body.late === true;
  const slot = slotOn(pair, date) || (pair.schedule || [])[0];
  const duration = slot ? minutesOf(slot.endTime) - minutesOf(slot.startTime) : null;
  const session = await Seances.create({
    binome_id: pair.id,
    author_id: pass.tutor,
    date,
    attendance,
    duration_minutes: attendance === 'présent' && duration > 0 ? duration : null,
    late,
    signed_in_at: new Date(),
    source: 'borne',
  });
  res.status(201).json({ id: session.id });
  if (late) tellLate(pair, session);
};

// The session of today of the pair whose pass is given
const todaysSession = async (req, res) => {
  const session = await Seances.findByPk(req.params.id);
  if (!session || !passOf(req, session.binome_id)) {
    res.status(401).json({ error: 'Recommencez : touchez votre binôme et tapez votre code.' });
    return null;
  }
  if (String(session.date).slice(0, 10) !== parisToday()) {
    res.status(409).json({ error: 'La signature se fait le jour de la séance' });
    return null;
  }
  return session;
};

// Body: { signature: 'data:image/png;base64,…' }
export const kioskSignature = async (req, res) => {
  const session = await todaysSession(req, res);
  if (!session) return;
  if (session.attendance !== 'présent' || session.student_signed_at) {
    return res.status(409).json({ error: 'Séance déjà signée' });
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.signature || ''));
  const png = m ? Buffer.from(m[1], 'base64') : null;
  if (!png || png.length < 200 || png.length > 400000) {
    return res.status(400).json({ error: 'Signature vide ou illisible' });
  }
  const pair = await Binomes.findByPk(session.binome_id, { attributes: ['student_id'] });
  const key = `student-signatures/${pair.student_id}/seance-${session.id}-${Date.now()}.png`;
  await writeObject(key, png, 'image/png');
  await session.update({ student_signature: key, student_signed_at: new Date(), no_signature: false });
  res.json({ ok: true });
};

export const kioskNoSignature = async (req, res) => {
  const session = await todaysSession(req, res);
  if (!session) return;
  await session.update({ no_signature: true });
  res.json({ ok: true });
};

// Body: { progress, work, remark }
export const kioskReport = async (req, res) => {
  const session = await todaysSession(req, res);
  if (!session) return;
  if (session.work || session.remark || session.progress) {
    return res.status(409).json({ error: 'Compte-rendu déjà enregistré' });
  }
  const progress = Number(req.body.progress) || null;
  await session.update({
    progress: progress && progress >= 1 && progress <= 5 ? progress : null,
    work: String(req.body.work || '').trim().slice(0, 4000) || null,
    remark: String(req.body.remark || '').trim().slice(0, 4000) || null,
  });
  res.json({ ok: true });
};
