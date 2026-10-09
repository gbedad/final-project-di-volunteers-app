// Parental consent: requests sent by the team (admin routes) and the public
// page the parent opens from the link (no account, the link's key is the
// access)
import crypto from 'crypto';
import { Op } from 'sequelize';
import Students from '../../models/students/students.model.js';
import StudentFiles from '../../models/students/studentsFiles.model.js';
import ParentalConsents from '../../models/students/parentalConsents.model.js';
import Users from '../../models/users.model.js';
import { formatName } from '../../services/names.js';
import { feeOf } from '../../services/fees.js';
import {
  MAX_ATTEMPTS,
  RELATIONS,
  TEXTS_VERSION,
  buildConsentPdf,
  consentItems,
  consentState,
  consentOverview,
  createConsentRequest,
  hashToken,
  parentOf,
  parentWithEmail,
  sendSignedEmails,
  storeConsentPdf,
  whatsappMessage,
} from '../../services/parentalConsent.js';

const userIdOf = (req) => Number(req.user?.userid ?? req.user?.userId) || null;
const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket?.remoteAddress ||
  null;
// Calendar day (YYYY-MM-DD) of a date. Birth dates are stored as
// timestamps, some at midnight Paris time (the day before in UTC).
const ymd = (d) => {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = new Date(d);
  return isNaN(date)
    ? null
    : date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
};

// What the team sees: no key, the state of each request
const publicRow = (row) => {
  const { token_hash, ...rest } = row.toJSON();
  return { ...rest, state: consentState(row) };
};

// ---- Team ----

export const listConsents = async (req, res) => {
  try {
    const rows = await ParentalConsents.findAll({
      where: { student_id: req.params.id },
      order: [['requested_at', 'DESC']],
    });
    const files = await StudentFiles.findAll({
      where: { id: { [Op.in]: rows.map((r) => r.file_id).filter(Boolean) } },
      attributes: ['id', 'path', 'filename'],
    });
    const ids = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))];
    const users = await Users.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'first_name', 'last_name'],
    });
    res.json(
      rows.map((r) => ({
        ...publicRow(r),
        file: files.find((f) => f.id === r.file_id) || null,
        requested_by_name: (() => {
          const u = users.find((x) => x.id === r.requested_by);
          return u ? `${u.first_name} ${u.last_name}` : null;
        })(),
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the consent requests' });
  }
};

// Body: { parent: 1 | 2, channel: 'email' | 'whatsapp' }. Returns the link
// once (it can't be found again: only its hash is stored)
export const requestConsent = async (req, res) => {
  const n = Number(req.body.parent) === 2 ? 2 : 1;
  const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'email';
  try {
    const student = await Students.findByPk(req.params.id);
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    const parent = parentOf(student, n);
    if (channel === 'email' && !parent.email) {
      return res.status(400).json({ error: "Ce responsable n'a pas d'adresse e-mail" });
    }
    if (channel === 'whatsapp' && !parent.phone) {
      return res.status(400).json({ error: "Ce responsable n'a pas de téléphone" });
    }
    const { row, link, expiresAt } = await createConsentRequest({
      student,
      n,
      channel,
      requestedBy: userIdOf(req),
    });
    const me = await Users.findByPk(userIdOf(req), { attributes: ['first_name'] });
    res.status(201).json({
      ...publicRow(row),
      link,
      phone: parent.phone,
      message: whatsappMessage({ parent, student, me, link, expiresAt }),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "La demande n'a pas pu être créée" });
  }
};

// Body: { ids: [student ids] }. An e-mail to the first responsible with an
// address; students already signed or waiting are left out
export const bulkRequestConsents = async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean).slice(0, 200);
  const result = { sent: [], no_email: [], skipped: [] };
  try {
    const students = await Students.findAll({ where: { id: { [Op.in]: ids } } });
    const overview = await consentOverview(students);
    for (const student of students) {
      const name = `${student.first_name} ${student.last_name || ''}`.trim();
      const state = overview[student.id]?.state;
      if (state !== 'missing') {
        result.skipped.push({ id: student.id, name, state });
        continue;
      }
      const n = parentWithEmail(student);
      if (!n) {
        result.no_email.push({ id: student.id, name });
        continue;
      }
      const { parent } = await createConsentRequest({
        student,
        n,
        channel: 'email',
        requestedBy: userIdOf(req),
      });
      result.sent.push({ id: student.id, name, email: parent.email });
    }
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Les demandes n'ont pas pu être envoyées", ...result });
  }
};

export const cancelConsent = async (req, res) => {
  try {
    const row = await ParentalConsents.findOne({
      where: { id: req.params.consentId, student_id: req.params.id },
    });
    if (!row) return res.status(404).json({ error: 'Demande introuvable' });
    if (row.signed_at) return res.status(400).json({ error: 'Déjà signée' });
    await row.update({ cancelled_at: row.cancelled_at || new Date() });
    res.json(publicRow(row));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "La demande n'a pas pu être annulée" });
  }
};

// The parent withdrew their consent (told the association)
export const revokeConsent = async (req, res) => {
  try {
    const row = await ParentalConsents.findOne({
      where: { id: req.params.consentId, student_id: req.params.id },
    });
    if (!row?.signed_at) return res.status(404).json({ error: 'Accord introuvable' });
    await row.update({ revoked_at: new Date(), revoked_by: userIdOf(req) });
    await Students.update(
      { parental_consent_at: null },
      { where: { id: req.params.id } }
    );
    res.json(publicRow(row));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'accord n'a pas pu être retiré" });
  }
};

// ---- Parent (public, the key in the URL is the access) ----

const findByToken = (token) =>
  token && String(token).length >= 20
    ? ParentalConsents.findOne({ where: { token_hash: hashToken(token) } })
    : null;

export const getConsentPage = async (req, res) => {
  try {
    const row = await findByToken(req.params.token);
    if (!row) return res.status(404).json({ state: 'invalid' });
    const state = consentState(row);
    if (state !== 'pending') {
      return res.json({
        state,
        signed_at: state === 'signed' ? row.signed_at : undefined,
      });
    }
    const student = await Students.findByPk(row.student_id);
    if (!student) return res.status(404).json({ state: 'invalid' });
    res.json({
      state,
      child: student.first_name,
      parent_name: row.parent_name,
      expires_at: row.expires_at,
      needs_birth_date: !!student.birth_date,
      attempts_left: MAX_ATTEMPTS - row.failed_attempts,
      relations: RELATIONS,
      items: consentItems(student.first_name, feeOf(student)),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
};

// Body: { birth_date, choices: { [item id]: bool }, signer_name,
// signer_relation, signature: 'data:image/png;base64,…' }
export const signConsent = async (req, res) => {
  let claimed = null;
  try {
    const row = await findByToken(req.params.token);
    if (!row) return res.status(404).json({ state: 'invalid' });
    const state = consentState(row);
    if (state !== 'pending') return res.status(409).json({ state });
    const student = await Students.findByPk(row.student_id);
    if (!student) return res.status(404).json({ state: 'invalid' });

    // Identity: the child's birth date, when the association has it
    if (student.birth_date && ymd(req.body.birth_date) !== ymd(student.birth_date)) {
      const left = MAX_ATTEMPTS - (row.failed_attempts + 1);
      await row.increment('failed_attempts');
      return res.status(400).json({
        error:
          left > 0
            ? `La date de naissance ne correspond pas. Il vous reste ${left} essai(s).`
            : "La date de naissance ne correspond pas. Ce lien est maintenant bloqué : contactez l'association.",
        field: 'birth_date',
        state: left > 0 ? 'pending' : 'locked',
      });
    }

    // The participation shown on the page must still be the current one
    const fee = feeOf(student);
    const items = consentItems(student.first_name, fee);
    const shown = items.find((i) => i.id === 'participation')?.text || null;
    if ((req.body.participation_text || null) !== shown) {
      return res.status(409).json({
        state: 'pending',
        code: 'fee_changed',
        error:
          "Le montant de la participation aux frais vient d'être mis à jour par l'association. Merci de le relire avant de signer.",
      });
    }
    const accepted = req.body.choices || {};
    if (items.some((i) => i.required && accepted[i.id] !== true)) {
      return res.status(400).json({ error: 'Merci de cocher les accords obligatoires.' });
    }
    const signerName = formatName(String(req.body.signer_name || '').trim());
    if (signerName.length < 3 || signerName.length > 120) {
      return res.status(400).json({ error: 'Merci d’indiquer votre nom et prénom.', field: 'signer_name' });
    }
    if (!RELATIONS.includes(req.body.signer_relation)) {
      return res.status(400).json({ error: "Merci d'indiquer votre lien avec l'enfant." });
    }
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
      String(req.body.signature || '')
    );
    const signaturePng = match ? Buffer.from(match[1], 'base64') : null;
    if (!signaturePng || signaturePng.length < 200 || signaturePng.length > 400000) {
      return res.status(400).json({ error: 'Merci de signer dans le cadre prévu.' });
    }

    // Claim the link: a second click or a second tab can't sign twice
    const signedAt = new Date();
    const [count] = await ParentalConsents.update(
      { signed_at: signedAt },
      { where: { id: row.id, signed_at: null, cancelled_at: null } }
    );
    if (!count) return res.status(409).json({ state: 'signed' });
    claimed = row.id;

    const choices = Object.fromEntries(
      items.map((i) => [i.id, { accepted: accepted[i.id] === true, title: i.title, text: i.text }])
    );
    const proof = {
      signed_at: signedAt,
      signer_name: signerName,
      signer_relation: req.body.signer_relation,
      choices,
      texts_version: TEXTS_VERSION,
      fee: fee && !fee.missing ? fee : null,
      ip: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    };
    const pdfBytes = await buildConsentPdf({
      student,
      row: { ...row.toJSON(), ...proof, verified_birth_date: !!student.birth_date },
      items,
      signaturePng,
    });
    const key = await storeConsentPdf(student.id, pdfBytes);
    const filename = `Consentement parental - ${student.first_name} ${
      student.last_name || ''
    } - ${signedAt.toISOString().slice(0, 10)}.pdf`.replace(/\s+-/g, ' -');
    const file = await StudentFiles.create({
      filename,
      mimetype: 'application/pdf',
      path: key,
      studentId: student.id,
    });
    await row.update({
      ...proof,
      document_hash: crypto.createHash('sha256').update(pdfBytes).digest('hex'),
      file_id: file.id,
    });
    await student.update({ parental_consent_at: signedAt });

    const parentEmail =
      row.channel === 'email'
        ? row.sent_to
        : [1, 2]
            .map((n) => parentOf(student, n))
            .find((p) => p.phone === row.sent_to)?.email || null;
    sendSignedEmails({ student, row, pdfBytes, filename, parentEmail });
    res.json({ state: 'signed', signed_at: signedAt, copy_sent: !!parentEmail });
  } catch (err) {
    console.log(err);
    // The link can be used again if the signature could not be saved
    if (claimed) {
      await ParentalConsents.update(
        { signed_at: null },
        { where: { id: claimed, file_id: null } }
      ).catch(() => {});
    }
    res.status(500).json({ error: "Votre accord n'a pas pu être enregistré. Merci de réessayer." });
  }
};
