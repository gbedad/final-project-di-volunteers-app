// Family convention: the team (student's page) and the parent (public link)
import Users from '../models/users.model.js';
import { fileUrl } from '../config/aws.config.js';
import db from '../config/database.js';
import { parentOf } from '../services/parentalConsent.js';
import {
  listConventions,
  teamDefaults,
  previewPdf,
  requestConvention,
  cancelConvention,
  storePaperConvention,
  conventionFile,
  conventionPage,
  conventionPreviewForParent,
  signConvention,
} from '../services/familyConvention.js';

const me = (req) => Number(req.user?.userid ?? req.user?.userId);
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};
const answer = (res, out, key, code = 200) =>
  out.error ? res.status(out.status || 400).json({ error: out.error }) : res.status(code).json(out[key]);
const sendPdf = (res, bytes, name) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.send(Buffer.from(bytes));
};

// The student's conventions, the values proposed, the parents reachable
export const list = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[student]] = await db.query('select * from students where id = :id', { replacements: { id }, logging: false });
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    res.json({
      conventions: await listConventions(id),
      defaults: teamDefaults(student),
      parents: [1, 2]
        .map((n) => ({ n, ...parentOf(student, n) }))
        .filter((p) => p.email || p.phone)
        .map((p) => ({ n: p.n, name: [p.first_name, p.last_name].filter(Boolean).join(' '), has_email: !!p.email, has_phone: !!p.phone })),
    });
  } catch (err) {
    fail(res, err, 'Conventions indisponibles');
  }
};
// Body: the team's values
export const preview = async (req, res) => {
  try {
    const bytes = await previewPdf(Number(req.params.id), req.body || {});
    if (!bytes) return res.status(404).json({ error: 'Élève introuvable' });
    sendPdf(res, bytes, 'apercu-convention.pdf');
  } catch (err) {
    fail(res, err, 'Aperçu impossible');
  }
};
export const send = async (req, res) => {
  try {
    const u = await Users.findByPk(me(req), { attributes: ['id', 'first_name'] });
    answer(res, await requestConvention(Number(req.params.id), req.body, u), 'request', 201);
  } catch (err) {
    fail(res, err, "La convention n'a pas pu être envoyée");
  }
};
export const cancel = async (req, res) => {
  try {
    const r = await cancelConvention(Number(req.params.cid));
    if (!r) return res.status(404).json({ error: 'Pas de convention en attente' });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "L'annulation n'a pas pu être enregistrée");
  }
};
// Body: { file: 'data:…;base64,…', name }
export const paper = async (req, res) => {
  try {
    answer(res, await storePaperConvention(Number(req.params.id), req.body.file, req.body.name, { id: me(req) }), 'convention', 201);
  } catch (err) {
    fail(res, err, "La convention n'a pas pu être enregistrée");
  }
};
export const pdfLink = async (req, res) => {
  try {
    const file = await conventionFile(Number(req.params.cid));
    if (!file) return res.status(404).json({ error: 'Pas de document' });
    res.json({ url: await fileUrl(file.path) });
  } catch (err) {
    fail(res, err, 'Document indisponible');
  }
};

// ---- Parent (public: the key of the link is the access) ----
export const page = async (req, res) => {
  try {
    answer(res, await conventionPage(String(req.params.token)), 'page');
  } catch (err) {
    fail(res, err, 'Page indisponible');
  }
};
export const parentPreview = async (req, res) => {
  try {
    const bytes = await conventionPreviewForParent(String(req.params.token));
    if (!bytes) return res.status(404).json({ error: 'Lien inconnu' });
    sendPdf(res, bytes, 'convention.pdf');
  } catch (err) {
    fail(res, err, 'Document indisponible');
  }
};
export const sign = async (req, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    answer(res, await signConvention(String(req.params.token), req.body, { ip, userAgent: req.headers['user-agent'] }), 'result');
  } catch (err) {
    fail(res, err, "La signature n'a pas pu être enregistrée");
  }
};
