// Family convention ("Convention d'engagement réciproque entre l'association
// Séphora Berrebi et un bénéficiaire"): one per student and school year,
// pre-filled from the student's page and the fees, sent at registration to
// ONE legal guardian (personal link, e-mail or WhatsApp, no account), signed
// online, countersigned automatically with the president's signature, kept
// in the student's documents. A paper convention can be uploaded instead.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import db from '../config/database.js';
import s3, { PRIVATE_BUCKET } from '../config/aws.config.js';
import sendEmail from '../config/sendEmails.js';
import { adminEmails, clientUrl, emailButton, escapeHtml } from '../config/notify.js';
import StudentFiles from '../models/students/studentsFiles.model.js';
import { feeOf } from './fees.js';
import { hashToken, newToken, parentOf, RELATIONS } from './parentalConsent.js';
import { PRESIDENT_SIGNATURE_KEY, placesText, readStored, slotsText } from './conventionSigning.js';
import { schoolYearOf, MEMBERSHIP_FEE } from './activities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, '../assets/convention-beneficiaire.pdf');
export const LINK_DAYS = 15;
// Deposit when the scale has none (hourly rate): the one of tranche 7
const DEFAULT_DEPOSIT = 200;
const PUBLIC_URL = (process.env.PUBLIC_CLIENT_URL || 'https://www.mycogniverse.org').replace(/\/$/, '');
export const conventionLink = (token) => `${PUBLIC_URL}/convention-famille/${token}`;
export { RELATIONS };

const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const one = async (sql, replacements) => (await q(sql, replacements))[0] || null;
const euros = (n) =>
  n === null || n === undefined || n === ''
    ? ''
    : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: Number(n) % 1 ? 2 : 0 })} €`.replace(/ /g, ' ');
const frLong = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' });
const upperName = (first, last) => [String(last || '').toUpperCase(), first].filter(Boolean).join(' ').trim();
const send = (to, subject, html, label, attachments) =>
  sendEmail(to, subject, html, attachments).catch((err) => console.log(`${label} email not sent:`, err.message));

// ---- Values ----
const studentRow = (id) => one('select * from students where id = :id', { id });

// What the team checks or changes before sending
export const teamDefaults = (student) => {
  const fee = feeOf(student);
  const hourly = fee?.mode === 'hourly';
  return {
    participation_mode: hourly ? 'horaire' : 'trimestre',
    montant_trimestre: fee?.mode === 'term' ? fee.amount : null,
    montant_annee: fee?.mode === 'term' ? fee.amount * 3 : null,
    tarif_horaire: hourly && fee.amount ? `${euros(fee.amount)} par heure${fee.pack5 ? ` (5 heures : ${euros(fee.pack5)})` : ''}` : '',
    // No QF yet: nothing can be computed, the team completes the page first
    caution_montant: fee ? fee.deposit || DEFAULT_DEPOSIT : null,
    autre_texte: '',
    obligations: '',
    // Where the amounts come from (shown to the team)
    source: fee?.text || null,
  };
};

// From the student's page (the parent can correct contact and address)
export const prefill = (student) => {
  const parent = parentOf(student, 1);
  const how = student.how_location || '';
  const school = student.school?.name ? `${student.school.name}${student.school.city ? ` (${student.school.city})` : ''}` : '';
  return {
    nom_eleve: upperName(student.first_name, student.last_name),
    classe: student.level || '',
    etablissement: school,
    quotient_familial:
      student.qf !== null && student.qf !== undefined && student.qf !== '' ? euros(student.qf) : student.qf_proof === 'none' ? 'non communiqué' : '',
    presentiel: /site|hybride/i.test(how),
    distanciel: /distance|hybride/i.test(how),
    lieu: placesText({ where_location: student.where_location || [], how_location: how }).replace(/(, )?à distance/, '') || '',
    horaire: slotsText(student.when_day_slot || []),
    nom_responsable: upperName(parent.first_name, parent.last_name),
    telephone: parent.phone || '',
    email: parent.email || '',
    adresse: [student.address, [student.zipcode, student.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
};

// Every field of the form, from the student, the team and the parent
export const fieldValues = (student, team, parent = {}, signedAt = null) => {
  const p = { ...prefill(student), ...parent };
  const hourly = team.participation_mode === 'horaire';
  const other = [team.autre_texte, hourly && team.tarif_horaire ? `participation : ${team.tarif_horaire}` : null]
    .filter(Boolean)
    .join(' · ');
  return {
    nom_responsable: p.nom_responsable,
    adresse: p.adresse,
    telephone: p.telephone,
    email: p.email,
    nom_eleve: p.nom_eleve,
    classe: p.classe,
    etablissement: p.etablissement,
    quotient_familial: p.quotient_familial,
    presentiel: p.presentiel,
    distanciel: p.distanciel,
    autre_coche: !!other,
    autre_texte: other,
    obligations: team.obligations || '',
    lieu: p.lieu,
    horaire: p.horaire,
    consentement_utilisation: !!signedAt,
    consentement_conservation: !!signedAt,
    cotisation: !!signedAt,
    participation: !!signedAt,
    participation_annee: team.participation_mode === 'annee',
    montant_annee: team.participation_mode === 'annee' ? euros(team.montant_annee) : '',
    participation_trimestre: team.participation_mode === 'trimestre',
    montant_trimestre: team.participation_mode === 'trimestre' ? euros(team.montant_trimestre) : '',
    caution: !!signedAt,
    caution_montant: euros(team.caution_montant),
    caution_especes: p.caution_mode === 'especes',
    caution_cheque: p.caution_mode === 'cheque',
    venir_seul: !!p.venir_seul,
    venir_seul_oui: p.venir_seul === 'oui',
    venir_seul_non: p.venir_seul === 'non',
    partir: !!p.partir,
    partir_seul: p.partir === 'seul',
    partir_accompagne: p.partir === 'accompagne',
    accompagnants: p.partir === 'accompagne' ? p.accompagnants || '' : '',
    partir_cherche: p.partir === 'cherche',
    commissariat: !!signedAt,
    fait_a: 'Paris,',
    date_signature: signedAt ? frLong(signedAt) : '',
  };
};

// ---- PDF ----
// Standard fonts know Western European characters only
const pdfText = (s) =>
  String(s ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/…/g, '...')
    // WinAnsi also has the euro sign
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\n]/g, '');

// Values written at the place of each field, then the fields removed
// (pdf-lib's flatten breaks forms whose fields pdf-lib created)
const fillByDrawing = async (pdf, values) => {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const pages = pdf.getPages();
  const pageOf = (w) =>
    pages.find((pg) => pg.ref === w.P()) ||
    pages.find((pg) => (pg.node.Annots()?.asArray() || []).some((r) => pdf.context.lookup(r) === w.dict));
  for (const field of form.getFields()) {
    const v = values[field.getName()];
    for (const w of field.acroField.getWidgets()) {
      const page = pageOf(w);
      if (!page) continue;
      const r = w.getRectangle();
      if (field.constructor.name === 'PDFCheckBox') {
        page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, borderColor: rgb(0, 0, 0), borderWidth: 0.8 });
        if (v) {
          page.drawLine({ start: { x: r.x + 2, y: r.y + r.height * 0.5 }, end: { x: r.x + r.width * 0.42, y: r.y + 1.8 }, thickness: 1.4 });
          page.drawLine({ start: { x: r.x + r.width * 0.42, y: r.y + 1.8 }, end: { x: r.x + r.width - 1.5, y: r.y + r.height - 1.5 }, thickness: 1.4 });
        }
        continue;
      }
      const text = pdfText(v);
      if (!text) continue;
      if (field.isMultiline?.()) {
        let y = r.y + r.height - 10;
        for (const para of text.split('\n')) {
          let line = '';
          const flush = () => {
            if (y >= r.y) page.drawText(line, { x: r.x + 2, y, size: 9, font });
            y -= 11;
          };
          for (const word of para.split(' ')) {
            const t = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(t, 9) > r.width - 4 && line) {
              flush();
              line = word;
            } else line = t;
          }
          flush();
        }
      } else {
        let size = 10;
        while (size > 6 && font.widthOfTextAtSize(text, size) > r.width - 3) size -= 0.5;
        page.drawText(text, { x: r.x + 1.5, y: r.y + (r.height - size) / 2 + 1.5, size, font });
      }
    }
  }
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const keep = annots.asArray().filter((ref) => String(pdf.context.lookup(ref)?.get(PDFName.of('Subtype'))) !== '/Widget');
    if (keep.length) page.node.set(PDFName.of('Annots'), pdf.context.obj(keep));
    else page.node.delete(PDFName.of('Annots'));
  }
  pdf.catalog.delete(PDFName.of('AcroForm'));
};

// Signatures under "Le représentant légal :" (left) and the president's
// label (right), page 2; proof at the foot of the page
const drawSignatures = async (pdf, { parentPng, parentCaption, presidentPng, presidentCaption, proof }) => {
  const page = pdf.getPage(pdf.getPageCount() - 1);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const H = page.getHeight();
  const place = async (png, x, caption) => {
    let y = H - 250;
    if (png) {
      const image = await pdf.embedPng(png);
      const scale = Math.min(170 / image.width, 60 / image.height, 1);
      y = H - 190 - image.height * scale;
      page.drawImage(image, { x, y, width: image.width * scale, height: image.height * scale });
    }
    // Two lines at most, within the half page
    const words = pdfText(caption).split(' ');
    const lines = [''];
    for (const w of words) {
      const t = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
      if (font.widthOfTextAtSize(t, 7.5) > 210 && lines[lines.length - 1]) lines.push(w);
      else lines[lines.length - 1] = t;
    }
    lines.forEach((l, i) => page.drawText(l, { x, y: y - 11 - i * 9, size: 7.5, font, color: rgb(0.2, 0.2, 0.2) }));
  };
  await place(parentPng, 80, parentCaption);
  await place(presidentPng, 330, presidentCaption);
  if (proof) {
    let y = 70;
    for (const line of proof) {
      page.drawText(pdfText(line), { x: 70, y, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
      y -= 9;
    }
  }
};

export const buildConventionPdf = async (values, signatures) => {
  const pdf = await PDFDocument.load(fs.readFileSync(TEMPLATE));
  pdf.setTitle(`Convention d'engagement - ${values.nom_eleve}`);
  pdf.setAuthor('Association Séphora Berrebi');
  await fillByDrawing(pdf, values);
  if (signatures) await drawSignatures(pdf, signatures);
  return pdf.save();
};

// ---- Requests ----
const stateOf = (row) =>
  row.status === 'envoyée' && row.expires_at && new Date(row.expires_at) < new Date() ? 'expirée' : row.status;
const publicRow = ({ token_hash, ip, user_agent, ...row }) => ({ ...row, state: stateOf(row) });

export const listConventions = async (studentId) =>
  (await q('select * from family_conventions where student_id = :studentId order by created_at desc', { studentId })).map(publicRow);

// The unsigned convention as it will be sent (team) or as the parent sees it
export const previewPdf = async (studentId, team) => {
  const student = await studentRow(studentId);
  if (!student) return null;
  return buildConventionPdf(fieldValues(student, { ...teamDefaults(student), ...team }), null);
};

const cleanTeam = (student, body = {}) => {
  const d = teamDefaults(student);
  const num = (v, fallback) => (v === '' || v === null || v === undefined ? fallback : Number(v));
  const mode = ['trimestre', 'annee', 'horaire'].includes(body.participation_mode) ? body.participation_mode : d.participation_mode;
  return {
    participation_mode: mode,
    montant_trimestre: num(body.montant_trimestre, d.montant_trimestre),
    montant_annee: num(body.montant_annee, d.montant_annee),
    tarif_horaire: String(body.tarif_horaire ?? d.tarif_horaire).slice(0, 120),
    caution_montant: num(body.caution_montant, d.caution_montant),
    autre_texte: String(body.autre_texte || '').trim().slice(0, 120),
    obligations: String(body.obligations || '').trim().slice(0, 600),
  };
};

// Body: { channel: 'email' | 'whatsapp', parent: 1 | 2, team: {…} }
export const requestConvention = async (studentId, body, me) => {
  const student = await studentRow(studentId);
  if (!student) return { error: 'Élève introuvable', status: 404 };
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const parent = parentOf(student, Number(body.parent) === 2 ? 2 : 1);
  if (channel === 'email' && !parent.email) return { error: "Pas d'e-mail pour ce parent : utilisez WhatsApp" };
  if (channel === 'whatsapp' && !parent.phone) return { error: 'Pas de téléphone pour ce parent' };
  const team = cleanTeam(student, body.team);
  if (team.participation_mode === 'trimestre' && !team.montant_trimestre) return { error: 'Indiquez le montant par trimestre' };
  if (team.participation_mode === 'annee' && !team.montant_annee) return { error: "Indiquez le montant pour l'année" };
  if (team.participation_mode === 'horaire' && !team.tarif_horaire) return { error: 'Indiquez le tarif horaire' };
  if (!team.caution_montant) return { error: 'Indiquez le montant de la caution' };
  const year = schoolYearOf();
  // A new link replaces the one still waiting
  await q(
    `update family_conventions set status = 'annulée', cancelled_at = now()
      where student_id = :studentId and school_year = :year and status = 'envoyée'`,
    { studentId, year }
  );
  const token = newToken();
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86400000);
  const row = await one(
    `insert into family_conventions (student_id, school_year, token_hash, channel, sent_to, requested_by, expires_at, team_values)
     values (:studentId, :year, :hash, :channel, :sentTo, :me, :expiresAt, cast(:team as jsonb)) returning *`,
    {
      studentId,
      year,
      hash: hashToken(token),
      channel,
      sentTo: channel === 'email' ? parent.email : parent.phone,
      me: me?.id || null,
      expiresAt,
      team: JSON.stringify(team),
    }
  );
  const link = conventionLink(token);
  const until = expiresAt.toLocaleDateString('fr-FR');
  if (channel === 'email') {
    send(
      parent.email,
      `Convention d'engagement pour ${student.first_name}`,
      `<p>Bonjour${parent.first_name ? ` ${escapeHtml(parent.first_name)}` : ''},</p>
      <p>Pour l'accompagnement de <b>${escapeHtml(student.first_name)}</b> par l'association Séphora Berrebi, merci de lire,
      compléter et signer en ligne la convention d'engagement ${year} (environ 5 minutes, depuis votre téléphone) :</p>
      <p>${emailButton(link, 'Lire et signer la convention')}</p>
      <p>Ce lien vous est personnel et reste valable jusqu'au ${until}.</p>
      <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
      'Family convention request'
    );
  }
  return {
    request: {
      ...publicRow(row),
      link,
      whatsapp: `Bonjour${parent.first_name ? ` ${parent.first_name}` : ''}, je suis ${me?.first_name || ''} de l'association Séphora Berrebi. Pour l'accompagnement de ${student.first_name}, merci de lire et signer en ligne la convention d'engagement ${year} (5 minutes) :\n\n${link}\n\nCe lien est personnel et valable jusqu'au ${until}.`,
    },
  };
};

export const cancelConvention = (id) =>
  one(`update family_conventions set status = 'annulée', cancelled_at = now() where id = :id and status = 'envoyée' returning id`, { id });

// ---- The parent's page ----
const byToken = async (token) => {
  const row = await one('select * from family_conventions where token_hash = :hash', { hash: hashToken(token) });
  if (!row) return { error: 'Lien inconnu ou remplacé', status: 404 };
  const student = await studentRow(row.student_id);
  if (!student) return { error: 'Élève introuvable', status: 404 };
  return { row, student };
};
// What the parent must agree to (all required)
export const ENGAGEMENTS = [
  { id: 'consentement_utilisation', text: "J'accepte que mes informations soient utilisées uniquement dans le cadre des missions de l'association Séphora Berrebi." },
  { id: 'consentement_conservation', text: "J'autorise l'association Séphora Berrebi à conserver mes données personnelles." },
  { id: 'cotisation', text: `Je m'engage à régler la cotisation annuelle par bénéficiaire : ${MEMBERSHIP_FEE} € (règlement par lien transmis par WhatsApp).` },
  { id: 'participation', text: "Je m'engage à régler la participation aux frais par bénéficiaire, selon le montant indiqué." },
  { id: 'caution', text: 'Je donne ma caution, du montant indiqué.' },
  {
    id: 'commissariat',
    text: "Je reconnais, si mon enfant n'est pas autorisé à partir seul, que l'association peut le confier au commissariat le plus proche si je ne viens pas le chercher à l'heure.",
  },
];

export const conventionPage = async (token) => {
  const { row, student, error, status } = await byToken(token);
  if (error) return { error, status };
  const state = stateOf(row);
  const team = row.team_values || {};
  return {
    page: {
      state,
      year: row.school_year,
      child: student.first_name,
      prefill: prefill(student),
      team: {
        participation:
          team.participation_mode === 'annee'
            ? `${euros(team.montant_annee)} pour l'année`
            : team.participation_mode === 'horaire'
              ? team.tarif_horaire
              : `${euros(team.montant_trimestre)} par trimestre`,
        caution: euros(team.caution_montant),
        autre: team.autre_texte || '',
        obligations: team.obligations || '',
      },
      engagements: ENGAGEMENTS,
      relations: RELATIONS,
      signed_at: row.signed_at,
    },
  };
};
export const conventionPreviewForParent = async (token) => {
  const { row, student, error } = await byToken(token);
  if (error) return null;
  return buildConventionPdf(fieldValues(student, row.team_values || {}), null);
};

// Body: { nom_responsable, relation, telephone, email, adresse, caution_mode,
// venir_seul, partir, accompagnants, engagements: { id: true }, signature }
export const signConvention = async (token, body, { ip, userAgent }) => {
  const { row, student, error, status } = await byToken(token);
  if (error) return { error, status };
  const state = stateOf(row);
  if (state === 'signée') return { error: 'Convention déjà signée', status: 409 };
  if (state !== 'envoyée') return { error: 'Lien expiré ou annulé : demandez-en un nouveau', status: 410 };
  const parent = {
    nom_responsable: String(body.nom_responsable || '').trim().slice(0, 120),
    telephone: String(body.telephone || '').trim().slice(0, 40),
    email: String(body.email || '').trim().slice(0, 120),
    adresse: String(body.adresse || '').trim().slice(0, 200),
    caution_mode: ['especes', 'cheque'].includes(body.caution_mode) ? body.caution_mode : null,
    venir_seul: ['oui', 'non'].includes(body.venir_seul) ? body.venir_seul : null,
    partir: ['seul', 'accompagne', 'cherche'].includes(body.partir) ? body.partir : null,
    accompagnants: String(body.accompagnants || '').trim().slice(0, 160),
  };
  const relation = RELATIONS.includes(body.relation) ? body.relation : null;
  if (!parent.nom_responsable || !relation) return { error: 'Indiquez votre nom et votre lien avec l’enfant' };
  if (parent.telephone.replace(/\D/g, '').length < 9) return { error: 'Indiquez un numéro de téléphone' };
  if (parent.adresse.length < 8) return { error: 'Indiquez votre adresse' };
  if (!parent.caution_mode) return { error: 'Choisissez comment vous donnez la caution' };
  if (!parent.venir_seul || !parent.partir) return { error: 'Dites comment votre enfant vient et repart' };
  if (parent.partir === 'accompagne' && !parent.accompagnants) return { error: 'Indiquez qui peut venir chercher votre enfant' };
  if (ENGAGEMENTS.some((e) => !body.engagements?.[e.id])) return { error: 'Toutes les cases sont nécessaires pour signer' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature || ''));
  const parentPng = m ? Buffer.from(m[1], 'base64') : null;
  if (!parentPng || parentPng.length < 200 || parentPng.length > 400000) return { error: 'Signature vide ou illisible' };

  const signedAt = new Date();
  const when = signedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
  let presidentPng = null;
  try {
    presidentPng = await readStored(PRESIDENT_SIGNATURE_KEY);
  } catch {}
  const values = fieldValues(student, row.team_values || {}, parent, signedAt);
  const pdfBytes = await buildConventionPdf(values, {
    parentPng,
    parentCaption: `${parent.nom_responsable} (${relation}), signé électroniquement le ${when}`,
    presidentPng,
    presidentCaption: `Emmanuelle Berrebi, contresigné électroniquement le ${when}`,
    proof: [
      `Convention signée en ligne sur MyCogniverse depuis un lien personnel envoyé le ${new Date(row.requested_at).toLocaleDateString('fr-FR')}${
        row.channel === 'email' ? ` à ${row.sent_to}` : ' par WhatsApp'
      }.`,
      `Adresse IP : ${ip || 'inconnue'}. Référence : convention ${row.id} (${row.school_year}).`,
    ],
  });
  const key = `student-documents/${student.id}/convention-engagement-${row.school_year}-${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key, Body: Buffer.from(pdfBytes), ContentType: 'application/pdf' }));
  const filename = `Convention d'engagement ${row.school_year} - ${student.first_name} ${student.last_name || ''}.pdf`.replace(/\s+/g, ' ');
  const file = await StudentFiles.create({ filename, mimetype: 'application/pdf', path: key, studentId: student.id });
  await q(
    `update family_conventions set status = 'signée', signed_at = :signedAt, signer_name = :signer, signer_relation = :relation,
       parent_values = cast(:parent as jsonb), ip = :ip, user_agent = :ua, document_hash = :hash, file_id = :fileId
     where id = :id`,
    {
      signedAt,
      signer: parent.nom_responsable,
      relation,
      parent: JSON.stringify(parent),
      ip: ip || null,
      ua: String(userAgent || '').slice(0, 500),
      hash: crypto.createHash('sha256').update(pdfBytes).digest('hex'),
      fileId: file.id,
      id: row.id,
    }
  );
  // The address, if the student's page had none
  if (!student.address) await q('update students set address = :a where id = :id', { a: parent.adresse, id: student.id });
  const name = `${student.first_name} ${student.last_name || ''}`.trim();
  send(
    adminEmails(),
    `Convention d'engagement signée : ${name}`,
    `<p>${escapeHtml(parent.nom_responsable)} (${escapeHtml(relation)}) a signé en ligne la convention d'engagement ${escapeHtml(
      row.school_year
    )} de ${escapeHtml(name)}, le ${escapeHtml(when)}. Elle est contresignée et rangée dans les documents de l'élève.</p>
    <p>${emailButton(`${clientUrl()}/eleves/${student.id}`, 'Voir la fiche élève')}</p>`,
    'Family convention signed'
  );
  const copyTo = parent.email || (row.channel === 'email' ? row.sent_to : null);
  if (copyTo) {
    send(
      copyTo,
      `Votre convention d'engagement pour ${student.first_name}`,
      `<p>Bonjour,</p><p>Merci, nous avons bien reçu la convention d'engagement de <b>${escapeHtml(student.first_name)}</b>,
      signée par vous et par l'association. Vous trouverez votre exemplaire en pièce jointe.</p>
      <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
      'Family convention copy',
      [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }]
    );
  }
  return { result: { state: 'signée', copy_sent: !!copyTo } };
};

// ---- Paper convention (scanned by the team) ----
const PAPER_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const storePaperConvention = async (studentId, dataUrl, name, me) => {
  const student = await studentRow(studentId);
  if (!student) return { error: 'Élève introuvable', status: 404 };
  const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  const ext = m && PAPER_TYPES[m[1]];
  if (!ext) return { error: 'Document : PDF ou photo (JPEG, PNG)' };
  const body = Buffer.from(m[2], 'base64');
  if (body.length > 9 * 1024 * 1024) return { error: 'Document trop lourd (9 Mo au plus)' };
  const year = schoolYearOf();
  const key = `student-documents/${student.id}/convention-engagement-papier-${year}-${Date.now()}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key, Body: body, ContentType: m[1] }));
  const file = await StudentFiles.create({
    filename: String(name || `Convention d'engagement ${year} (papier).${ext}`).slice(0, 150),
    mimetype: m[1],
    path: key,
    studentId: student.id,
  });
  await q(
    `update family_conventions set status = 'annulée', cancelled_at = now() where student_id = :studentId and school_year = :year and status = 'envoyée'`,
    { studentId, year }
  );
  return {
    convention: publicRow(
      await one(
        `insert into family_conventions (student_id, school_year, status, requested_by, signed_at, file_id, signer_name)
         values (:studentId, :year, 'papier', :me, now(), :fileId, 'Convention papier') returning *`,
        { studentId, year, me: me?.id || null, fileId: file.id }
      )
    ),
  };
};

export const conventionFile = async (id) => {
  const row = await one('select file_id from family_conventions where id = :id', { id });
  return row?.file_id ? StudentFiles.findByPk(row.file_id) : null;
};
