// Convention d'engagement signed online: the template (PDF form made with
// LibreOffice) is filled with the volunteer's data, signed by the volunteer,
// then countersigned by the president. The Charte is a PDF to read.
import crypto from 'crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import s3, { PRIVATE_BUCKET, privateFileInfo } from '../config/aws.config.js';
import { CONVENTION_TEMPLATE_KEY, TEMPLATES_PREFIX } from '../config/multer.js';
import { formatName } from './names.js';

export const CHARTE_KEY = `${TEMPLATES_PREFIX}/charte`;
export const PRESIDENT_SIGNATURE_KEY = `${TEMPLATES_PREFIX}/signature-presidente.png`;
// Only the president countersigns
export const presidentEmail = () =>
  (process.env.PRESIDENT_EMAIL || 'e.berrebi@sephoraberrebi.org').toLowerCase();
export const isPresident = (user) => !!user?.email && user.email.toLowerCase() === presidentEmail();

// Fields of the template: the agreed names, or LibreOffice's default ones
export const FIELDS = {
  nom_benevole: ['nom_benevole', 'Zone de texte 1'],
  presentiel: ['presentiel', 'Case à cocher 1'],
  distanciel: ['distanciel', 'Case à cocher 1_2'],
  autre_coche: ['autre_coche', 'Case à cocher 1_3'],
  autre_texte: ['autre_texte', 'Zone de texte 2'],
  date_fin: ['date_fin', 'Champ de date 1'],
  lieu: ['lieu', 'Zone de texte 4'],
  horaire: ['horaire', 'Champ horaire 1'],
  consentement_utilisation: ['consentement_utilisation', 'Case à cocher 1_4'],
  consentement_conservation: ['consentement_conservation', 'Case à cocher 1_5'],
  fait_a: ['fait_a', 'Zone de texte 3'],
  date_signature: ['date_signature', 'Champ de date 2'],
};
// PDF names escape non-ASCII bytes ("à" is "#C3#A0")
const decodeName = (name) =>
  Buffer.from(
    String(name).replace(/#([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1'
  ).toString('utf8');

const readObject = async (Key) => {
  const o = await s3.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key }));
  return Buffer.from(await o.Body.transformToByteArray());
};
// filename: kept in the metadata, used for downloads (privateFileInfo)
export const writeObject = (Key, body, ContentType = 'application/pdf', filename) =>
  s3.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key,
      Body: Buffer.from(body),
      ContentType,
      ...(filename ? { Metadata: { filename: encodeURIComponent(filename) } } : {}),
    })
  );
export const readTemplate = () => readObject(CONVENTION_TEMPLATE_KEY);
export const readStored = (key) => readObject(key);
export const templateVersion = async () =>
  (await privateFileInfo(CONVENTION_TEMPLATE_KEY))?.updated_at?.toISOString?.() || null;
export const charteInfo = () => privateFileInfo(CHARTE_KEY);

// Field of the form for each key (or null)
const fieldMap = (form) => {
  const byName = new Map(form.getFields().map((f) => [decodeName(f.getName()), f]));
  return Object.fromEntries(
    Object.entries(FIELDS).map(([key, names]) => [key, names.map((n) => byName.get(n)).find(Boolean) || null])
  );
};

// Fields missing in an uploaded template
export const checkTemplate = async (bytes) => {
  try {
    const pdf = await PDFDocument.load(bytes);
    const map = fieldMap(pdf.getForm());
    return { ok: Object.values(map).every(Boolean), missing: Object.keys(map).filter((k) => !map[k]) };
  } catch {
    return { ok: false, missing: Object.keys(FIELDS), unreadable: true };
  }
};

// ---- Values of the volunteer ----

const parse = (v) => {
  if (v && typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const SHORT_DAYS = { Lundi: 'lun.', Mardi: 'mar.', Mercredi: 'mer.', Jeudi: 'jeu.', Vendredi: 'ven.', Samedi: 'sam.', Dimanche: 'dim.' };
const DAY_ORDER = Object.keys(SHORT_DAYS);
const hour = (t) => String(t || '').replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
// "lun., mar., jeu. 18h-21h ; sam. 10h-12h": days with the same hours together
export const slotsText = (slots = []) => {
  const groups = new Map();
  for (const s of slots.map(parse).filter((x) => x?.day)) {
    const k = `${hour(s.startTime)}-${hour(s.endTime)}`;
    groups.set(k, [...(groups.get(k) || []), s.day]);
  }
  return [...groups.entries()]
    .map(([k, days]) => {
      const d = [...new Set(days)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
      return `${d.map((x) => SHORT_DAYS[x] || x).join(', ')} ${k}`;
    })
    .join(' ; ');
};
const REMOTE = /distance|distanciel/i;
// "22 rue Gabriel Lamé, Paris 12ème" -> "Paris 12ème"
export const placesText = (skill = {}) => {
  const places = (skill.where_location || []).filter((p) => p && !REMOTE.test(p));
  const sites = [...new Set(places.map((p) => p.split(',').pop().trim()))];
  const remote = REMOTE.test(skill.how_location || '') || (skill.where_location || []).some((p) => REMOTE.test(p || ''));
  return [...sites, remote ? 'à distance' : null].filter(Boolean).join(', ');
};
const onSite = (skill = {}) =>
  /site/i.test(skill.how_location || '') || (!skill.how_location && placesText(skill).replace('à distance', '').trim().length > 0);
const remote = (skill = {}) => REMOTE.test(skill.how_location || '') || placesText(skill).includes('à distance');
const frDate = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
// End of the school year: 30 June
export const defaultEndDate = (now = new Date()) => {
  const y = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${y}-06-30`;
};

export const conventionValues = (user, { consents = {}, signedAt = null } = {}) => {
  const skill = user.skill || {};
  return {
    nom_benevole: `${formatName(user.first_name || '')} ${String(user.last_name || '').toUpperCase()}`.trim(),
    presentiel: onSite(skill),
    distanciel: remote(skill),
    autre_coche: !!String(user.convention_other || '').trim(),
    autre_texte: String(user.convention_other || '').trim(),
    date_fin: frDate(user.convention_end_date || defaultEndDate()),
    lieu: placesText(skill),
    horaire: slotsText(skill.when_day_slot || []),
    consentement_utilisation: !!consents.utilisation,
    consentement_conservation: !!consents.conservation,
    fait_a: 'Paris',
    date_signature: signedAt ? frDate(signedAt) : '',
  };
};

// ---- PDF ----

// Fills the form; text shrinks (down to 6 pt) to fit its box
export const fillConvention = async (templateBytes, values, { flatten = true } = {}) => {
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const map = fieldMap(form);
  for (const [key, field] of Object.entries(map)) {
    if (!field) continue;
    const v = values[key];
    if (field.constructor.name === 'PDFCheckBox') {
      if (v) field.check();
      else field.uncheck();
      continue;
    }
    const text = String(v ?? '');
    const width = field.acroField.getWidgets()[0]?.getRectangle().width || 200;
    let size = 9;
    while (size > 6 && font.widthOfTextAtSize(text, size) > width - 4) size -= 0.5;
    field.setText(text);
    field.setFontSize(size);
  }
  form.updateFieldAppearances(font);
  if (flatten) form.flatten();
  return pdf;
};

// Signature under "Le Bénévole :" (left) or "…Présidente :" (right), last
// page of the template
const FALLBACK = { volunteer: { x: 80, top: 704 }, president: { x: 390, top: 704 } };
export const drawSignature = async (pdf, side, png, caption) => {
  const page = pdf.getPage(pdf.getPageCount() - 1);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(png);
  const H = page.getHeight();
  const { x, top } = FALLBACK[side];
  const scale = Math.min(170 / image.width, 55 / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const y = H - top - 18 - h;
  page.drawImage(image, { x, y, width: w, height: h });
  page.drawText(caption, { x, y: y - 10, size: 7, font, color: rgb(0.2, 0.2, 0.2) });
};

export const sha256 = (bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
