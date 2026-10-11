// Online signature of the convention: Charte to read, preview, signature of
// the volunteer, countersignature of the president
import Users from '../models/users.model.js';
import File from '../models/files.model.js';
import ConventionSignatures from '../models/conventionSignatures.model.js';
import { fileUrl, privateDownloadUrl, safeFileName } from '../config/aws.config.js';
import { CONVENTION_TEMPLATE_KEY } from '../config/multer.js';
import { honorabilityDeadline, updateReceivedFlag } from '../services/application.js';
import { notifyConventionCountersigned, notifyConventionSigned } from '../services/convention.js';
import {
  CHARTE_KEY,
  PRESIDENT_SIGNATURE_KEY,
  charteInfo,
  checkTemplate,
  conventionValues,
  defaultEndDate,
  drawSignature,
  fillConvention,
  isPresident,
  readStored,
  readTemplate,
  sha256,
  templateVersion,
  writeObject,
} from '../services/conventionSigning.js';
import { PDFDocument } from 'pdf-lib';
import { privateFileInfo } from '../config/aws.config.js';

// Browsers send the file name in UTF-8, read as Latin-1 by multer
const fileNameOf = (file) => {
  const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
  return name.includes('\uFFFD') ? file.originalname : name;
};
const userIdOf = (req) => Number(req.user?.userid ?? req.user?.userId);
const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
const frDateTime = (d) =>
  new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
const fail = (res, err, msg) => {
  console.log(err);
  res.status(500).json({ error: msg });
};
const pngOf = (dataUrl) => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  const png = m ? Buffer.from(m[1], 'base64') : null;
  return png && png.length > 200 && png.length < 400000 ? png : null;
};
const loadVolunteer = (id) =>
  Users.findByPk(id, {
    attributes: [
      'id', 'first_name', 'last_name', 'email', 'email2', 'role', 'status',
      'honorability_received', 'charte_read_at', 'charte_version',
      'convention_end_date', 'convention_other',
    ],
    include: ['skill'],
  });

// ---- Charte ----

export const getCharte = async (req, res) => {
  try {
    const info = await charteInfo();
    if (!info) return res.json({ charte: null });
    const filename = info.filename || 'charte-de-benevolat.pdf';
    res.json({
      charte: {
        filename,
        version: info.updated_at,
        url: await privateDownloadUrl(CHARTE_KEY, filename),
        // Shown in the page (no "attachment" header)
        inline_url: await fileUrl(CHARTE_KEY),
      },
    });
  } catch (err) {
    fail(res, err, 'Could not load the Charte');
  }
};

// Uploads (memory): the Charte, and the convention model checked first
export const uploadCharte = async (req, res) => {
  if (!req.file || !/pdf/.test(req.file.mimetype)) {
    return res.status(400).json({ error: 'Un fichier PDF est attendu' });
  }
  try {
    await writeObject(CHARTE_KEY, req.file.buffer, 'application/pdf', fileNameOf(req.file));
    res.json({ filename: fileNameOf(req.file) });
  } catch (err) {
    fail(res, err, "La Charte n'a pas pu être enregistrée");
  }
};
export const uploadTemplate = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const check = await checkTemplate(req.file.buffer);
  // Without its form, the model can't be filled: the current one is kept
  if (!check.ok && req.query.force !== '1') {
    return res.status(422).json({
      error: check.unreadable
        ? "Ce PDF n'a pas pu être lu."
        : "Ce PDF n'a pas les champs de formulaire attendus : le modèle actuel est conservé.",
      missing: check.missing,
    });
  }
  try {
    await writeObject(CONVENTION_TEMPLATE_KEY, req.file.buffer, 'application/pdf', fileNameOf(req.file));
    res.json({ filename: fileNameOf(req.file), missing: check.missing });
  } catch (err) {
    fail(res, err, "Le modèle n'a pas pu être enregistré");
  }
};

export const markCharteRead = async (req, res) => {
  try {
    const info = await charteInfo();
    const now = new Date();
    await Users.update(
      { charte_read_at: now, charte_version: info?.updated_at?.toISOString?.() || null },
      { where: { id: req.params.id }, silent: true }
    );
    res.json({ charte_read_at: now });
  } catch (err) {
    fail(res, err, "La lecture de la Charte n'a pas pu être enregistrée");
  }
};

// ---- State, preview, fields filled by the team ----

export const getConventionSigning = async (req, res) => {
  try {
    const user = await loadVolunteer(req.params.id);
    if (!user || user.role !== 'volunteer') return res.status(404).json({ error: 'Bénévole introuvable' });
    const rows = await ConventionSignatures.findAll({ where: { user_id: user.id }, order: [['signed_at', 'DESC']] });
    const charte = await charteInfo();
    const template = await privateFileInfo(CONVENTION_TEMPLATE_KEY);
    res.json({
      status: user.status,
      charte_available: !!charte,
      template_available: !!template,
      charte_read_at: user.charte_read_at,
      // Read again if a new Charte was uploaded since
      charte_outdated:
        !!user.charte_read_at && !!charte && user.charte_version !== charte.updated_at?.toISOString?.(),
      volunteer_signed: rows.find((r) => r.kind === 'volunteer') || null,
      president_signed: rows.find((r) => r.kind === 'president') || null,
      convention_end_date: user.convention_end_date || defaultEndDate(),
      convention_other: user.convention_other || '',
      values: conventionValues(user.toJSON()),
      i_am_president: isPresident(await Users.findByPk(userIdOf(req), { attributes: ['email'] })),
    });
  } catch (err) {
    fail(res, err, 'Could not load the convention');
  }
};

export const previewConvention = async (req, res) => {
  try {
    const user = await loadVolunteer(req.params.id);
    if (!user) return res.status(404).json({ error: 'Bénévole introuvable' });
    const pdf = await fillConvention(await readTemplate(), conventionValues(user.toJSON()));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="convention-apercu.pdf"');
    res.send(Buffer.from(await pdf.save()));
  } catch (err) {
    if (err.name === 'NoSuchKey') return res.status(404).json({ error: "Le modèle de convention n'a pas encore été déposé" });
    fail(res, err, "L'aperçu n'a pas pu être créé");
  }
};

// Body: { convention_end_date (YYYY-MM-DD or null), convention_other }
export const updateConventionFields = async (req, res) => {
  const changes = {};
  if ('convention_end_date' in req.body) {
    const v = req.body.convention_end_date;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: 'Date invalide' });
    changes.convention_end_date = v || null;
  }
  if ('convention_other' in req.body) changes.convention_other = String(req.body.convention_other || '').slice(0, 200) || null;
  try {
    // Once signed, the convention keeps what it says
    const signed = await ConventionSignatures.count({ where: { user_id: req.params.id, kind: 'volunteer' } });
    if (signed) return res.status(409).json({ error: 'Convention déjà signée : ces informations ne peuvent plus changer.' });
    await Users.update(changes, { where: { id: req.params.id, role: 'volunteer' }, silent: true });
    res.json(changes);
  } catch (err) {
    fail(res, err, "Les informations n'ont pas pu être enregistrées");
  }
};

// ---- Signatures ----

// The volunteer signs (body: { consents: { utilisation, conservation }, signature })
export const signConvention = async (req, res) => {
  try {
    if (userIdOf(req) !== Number(req.params.id)) return res.status(403).json({ error: 'Seul le bénévole peut signer sa convention' });
    const user = await loadVolunteer(req.params.id);
    if (!user || user.role !== 'volunteer') return res.status(404).json({ error: 'Bénévole introuvable' });
    if (user.status !== 'A finaliser') return res.status(409).json({ error: "La convention n'est pas encore à signer" });
    if (!user.charte_read_at) return res.status(400).json({ error: 'Merci de lire la Charte de bénévolat avant de signer.' });
    const consents = req.body.consents || {};
    if (!consents.utilisation || !consents.conservation) {
      return res.status(400).json({ error: 'Merci de cocher les deux accords.' });
    }
    const png = pngOf(req.body.signature);
    if (!png) return res.status(400).json({ error: 'Merci de signer dans le cadre prévu.' });

    const signedAt = new Date();
    const values = conventionValues(user.toJSON(), { consents, signedAt });
    const pdf = await fillConvention(await readTemplate(), values);
    await drawSignature(pdf, 'volunteer', png, `Signé électroniquement le ${frDateTime(signedAt)}`);
    pdf.setTitle(`Convention d'engagement - ${values.nom_benevole}`);
    const bytes = await pdf.save();
    const filename = `Convention ${values.nom_benevole} - signée.pdf`;
    const key = `conventions/${user.id}/convention-${safeFileName('signee-en-ligne.pdf')}`;
    await writeObject(key, bytes);
    const file = await File.create({ filename, mimetype: 'application/pdf', path: key, doc_type: 'convention', userId: user.id });
    await updateReceivedFlag(user.id, 'convention');
    const row = await ConventionSignatures.create({
      user_id: user.id,
      signer_id: user.id,
      kind: 'volunteer',
      signed_at: signedAt,
      consents,
      fields: values,
      charte_version: user.charte_version,
      template_version: await templateVersion(),
      ip: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      document_hash: sha256(bytes),
      file_id: file.id,
    });
    notifyConventionSigned(user);
    res.json({ signed_at: row.signed_at, file_id: file.id });
  } catch (err) {
    if (err.name === 'NoSuchKey') return res.status(404).json({ error: "Le modèle de convention n'a pas encore été déposé" });
    fail(res, err, "La convention n'a pas pu être signée");
  }
};

const presidentOnly = async (req, res) => {
  const me = await Users.findByPk(userIdOf(req), { attributes: ['id', 'email'] });
  if (!isPresident(me)) {
    res.status(403).json({ error: 'Réservé à la présidente de l’association' });
    return null;
  }
  return me;
};

// Signature of the president, drawn once
export const getPresidentSignature = async (req, res) => {
  if (!(await presidentOnly(req, res))) return;
  res.json({ saved: !!(await privateFileInfo(PRESIDENT_SIGNATURE_KEY)) });
};
export const savePresidentSignature = async (req, res) => {
  if (!(await presidentOnly(req, res))) return;
  const png = pngOf(req.body.signature);
  if (!png) return res.status(400).json({ error: 'Merci de signer dans le cadre prévu.' });
  try {
    await writeObject(PRESIDENT_SIGNATURE_KEY, png, 'image/png');
    res.json({ saved: true });
  } catch (err) {
    fail(res, err, "La signature n'a pas pu être enregistrée");
  }
};

// The president countersigns the convention signed online
export const countersignConvention = async (req, res) => {
  try {
    const me = await presidentOnly(req, res);
    if (!me) return;
    const user = await loadVolunteer(req.params.id);
    if (!user) return res.status(404).json({ error: 'Bénévole introuvable' });
    const signed = await ConventionSignatures.findOne({
      where: { user_id: user.id, kind: 'volunteer' },
      order: [['signed_at', 'DESC']],
    });
    const source = signed?.file_id && (await File.findByPk(signed.file_id));
    if (!source) {
      return res.status(409).json({
        error: "Cette convention n'a pas été signée en ligne : déposez la version contresignée depuis la fiche.",
      });
    }
    let png;
    try {
      png = await readStored(PRESIDENT_SIGNATURE_KEY);
    } catch {
      return res.status(409).json({ error: 'Enregistrez d’abord votre signature.', code: 'no_signature' });
    }
    const signedAt = new Date();
    const pdf = await PDFDocument.load(await readStored(source.path));
    await drawSignature(pdf, 'president', png, `Contresigné électroniquement le ${frDateTime(signedAt)}`);
    const bytes = await pdf.save();
    const key = `conventions/${user.id}/convention-contresignee-${safeFileName('en-ligne.pdf')}`;
    await writeObject(key, bytes);
    const file = await File.create({
      filename: source.filename.replace('signée', 'signée et contresignée'),
      mimetype: 'application/pdf',
      path: key,
      doc_type: 'convention_final',
      userId: user.id,
    });
    await updateReceivedFlag(user.id, 'convention_final');
    await ConventionSignatures.create({
      user_id: user.id,
      signer_id: me.id,
      kind: 'president',
      signed_at: signedAt,
      template_version: signed.template_version,
      ip: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      document_hash: sha256(bytes),
      file_id: file.id,
    });
    const files = await File.findAll({ where: { userId: user.id }, attributes: ['path', 'doc_type', 'uploaded_at'] });
    notifyConventionCountersigned(user, honorabilityDeadline(files));
    res.json({ signed_at: signedAt, file_id: file.id });
  } catch (err) {
    fail(res, err, "La convention n'a pas pu être contresignée");
  }
};
