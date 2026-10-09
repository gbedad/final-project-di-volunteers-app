// Parental consent given online: the team sends a personal link (e-mail or
// WhatsApp), the parent reads, ticks, signs; the signed PDF is kept in the
// student's documents with the proof of signature
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import s3, { PRIVATE_BUCKET } from '../config/aws.config.js';
import sendEmail from '../config/sendEmails.js';
import {
  adminEmails,
  clientUrl,
  emailButton,
  escapeHtml,
} from '../config/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LINK_DAYS = 15;
export const MAX_ATTEMPTS = 5;
export const RELATIONS = ['Mère', 'Père', 'Tuteur légal', 'Autre responsable légal'];

// Texts shown to the parent and copied into the signed PDF. Change
// TEXTS_VERSION whenever a text changes: each signature keeps the version
// and the exact texts it was given on.
export const TEXTS_VERSION = '2026-10-a';
export const consentItems = (child) => [
  {
    id: 'tutorat',
    required: true,
    title: 'Accompagnement scolaire',
    text: `J'autorise ${child} à bénéficier d'un accompagnement scolaire gratuit, assuré par un tuteur bénévole de l'association Séphora Berrebi, à distance (plateforme sKOLa) et/ou en présentiel dans un lieu proposé par l'association.`,
  },
  {
    id: 'donnees',
    required: true,
    title: 'Données personnelles',
    text: `J'accepte que l'association enregistre les informations concernant ${child} (identité, scolarité, besoins, disponibilités) et les miennes, uniquement pour organiser et suivre le tutorat. Le tuteur ne reçoit que ce qui est utile aux séances. Je peux consulter, corriger ou faire supprimer ces informations en écrivant à skola@sephoraberrebi.org.`,
  },
  {
    id: 'whatsapp',
    required: true,
    title: 'Groupe WhatsApp',
    text: `J'accepte d'être ajouté(e) au groupe WhatsApp réunissant la famille, le tuteur et l'association, qui sert à organiser les séances.`,
  },
  {
    id: 'assiduite',
    required: true,
    title: 'Présence aux séances',
    text: `Je m'engage à prévenir sur ce groupe de tout retard ou absence de ${child}. Je suis informé(e) qu'un retard de plus de 15 minutes est signalé comme incident et que des absences répétées sans justification peuvent mettre fin au tutorat.`,
  },
  {
    id: 'besoins',
    required: false,
    title: 'Besoins particuliers (facultatif)',
    text: `J'accepte que l'association note les besoins particuliers de ${child} (troubles dys, handicap, aménagements) pour adapter l'accompagnement. Ces informations ne sont visibles que par l'équipe de l'association.`,
  },
  {
    id: 'image',
    required: false,
    title: "Droit à l'image (facultatif)",
    text: `J'autorise l'association à utiliser des photos ou vidéos de ${child} prises pendant les activités, pour sa communication (site internet, réseaux sociaux, rapport d'activité). Sans cette autorisation, aucune image de ${child} ne sera diffusée.`,
  },
];

// ---- Link keys ----

export const newToken = () => crypto.randomBytes(24).toString('base64url');
export const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');
export const consentLink = (token) => `${clientUrl()}/consentement/${token}`;

// pending, signed, revoked, cancelled, locked or expired
export const consentState = (row) => {
  if (row.signed_at) return row.revoked_at ? 'revoked' : 'signed';
  if (row.cancelled_at) return 'cancelled';
  if (row.failed_attempts >= MAX_ATTEMPTS) return 'locked';
  if (new Date(row.expires_at) < new Date()) return 'expired';
  return 'pending';
};

const frDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
const frDateTime = (d) =>
  new Date(d)
    .toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'long',
      timeStyle: 'short',
    })
    .replace(/[  ]/g, ' ');

// Parent targeted by a request: responsible 1 or 2 of the student's page
export const parentOf = (student, n = 1) => ({
  first_name: student[`parent${n}_firstname`] || '',
  last_name: student[`parent${n}_lastname`] || '',
  email: student[`parent${n}_email`] || null,
  phone: student[`parent${n}_phone`] || null,
});
const parentName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ');

export const whatsappMessage = ({ parent, student, me, link, expiresAt }) =>
  `Bonjour${parent.first_name ? ` ${parent.first_name}` : ''}, je suis ${
    me?.first_name || ''
  } de l'association Séphora Berrebi. Pour commencer l'accompagnement scolaire de ${
    student.first_name
  }, merci de donner votre accord en ligne (2 minutes) : ${link}\nCe lien est personnel et valable jusqu'au ${frDate(
    expiresAt
  )}.`;

// ---- E-mails ----

const send = (to, subject, html, label, attachments) =>
  sendEmail(to, subject, html, attachments).catch((err) =>
    console.log(`${label} email not sent:`, err.message)
  );

// Subject and body of the e-mail asking for the parent's consent
export const consentRequestEmail = ({ parent, student, link, expiresAt }) => ({
  subject: `Accompagnement scolaire de ${student.first_name} : votre accord`,
  html: `<p>Bonjour${parent.first_name ? ` ${escapeHtml(parent.first_name)}` : ''},</p>
    <p>L'association Séphora Berrebi va proposer un accompagnement scolaire gratuit à <b>${escapeHtml(
      student.first_name
    )}</b>, assuré par un tuteur bénévole.</p>
    <p>Avant de commencer, nous avons besoin de votre accord. Il vous suffit de lire, cocher et signer en ligne (environ 2 minutes, depuis votre téléphone ou votre ordinateur) :</p>
    <p>${emailButton(link, 'Donner mon accord')}</p>
    <p>Ce lien vous est personnel et reste valable jusqu'au ${frDate(expiresAt)}.</p>
    <p>Une question ? Écrivez-nous à skola@sephoraberrebi.org.</p>
    <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
});

export const sendConsentRequest = (data) => {
  const { subject, html } = consentRequestEmail(data);
  return send(data.parent.email, subject, html, 'Consent request');
};

const sendSignedEmails = ({ student, row, pdfBytes, filename, parentEmail }) => {
  const studentName = `${student.first_name} ${student.last_name || ''}`.trim();
  send(
    adminEmails(),
    `Consentement parental signé : ${studentName}`,
    `<p>${escapeHtml(row.signer_name)} (${escapeHtml(
      row.signer_relation
    )}) a donné son accord en ligne pour ${escapeHtml(studentName)}, le ${frDateTime(
      row.signed_at
    )}.</p>
    <p>${emailButton(`${clientUrl()}/eleves/${student.id}`, 'Voir la fiche élève')}</p>`,
    'Consent signed'
  );
  if (parentEmail) {
    send(
      parentEmail,
      `Votre accord pour l'accompagnement scolaire de ${student.first_name}`,
      `<p>Bonjour,</p>
      <p>Merci, nous avons bien reçu votre accord pour l'accompagnement scolaire de <b>${escapeHtml(
        student.first_name
      )}</b>. Vous trouverez votre exemplaire en pièce jointe.</p>
      <p>Vous pouvez à tout moment retirer votre accord ou modifier vos choix en écrivant à skola@sephoraberrebi.org.</p>
      <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
      'Consent copy',
      [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }]
    );
  }
};

// ---- Signed PDF ----

// Standard PDF fonts only know Western European characters
const pdfText = (s) =>
  String(s ?? '')
    .replace(/[  \t]/g, ' ')
    .replace(/[^\n -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');

const wrap = (text, font, size, width) => {
  const lines = [];
  for (const paragraph of pdfText(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
};

export const buildConsentPdf = async ({ student, row, items, signaturePng }) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Consentement parental - ${student.first_name} ${student.last_name || ''}`);
  pdf.setAuthor('Association Séphora Berrebi');
  pdf.setCreator('MyCogniverse');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.24, 0.31, 0.53);
  const accent = rgb(0.6, 0.18, 0.38);
  const grey = rgb(0.35, 0.35, 0.35);
  const W = 595.28;
  const H = 841.89;
  const M = 56;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (needed) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const paragraph = (text, { size = 10, font = regular, color = rgb(0, 0, 0), x = M, gap = 4 } = {}) => {
    for (const line of wrap(text, font, size, W - x - M)) {
      ensure(size + 3);
      page.drawText(line, { x, y: y - size, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  };

  try {
    const logo = await pdf.embedPng(
      fs.readFileSync(path.join(__dirname, '../assets/logo-asb.png'))
    );
    page.drawImage(logo, { x: (W - 72) / 2, y: y - 72, width: 72, height: 72 });
    y -= 84;
  } catch {}
  const centered = (text, size, font, color) => {
    const t = pdfText(text);
    page.drawText(t, {
      x: (W - font.widthOfTextAtSize(t, size)) / 2,
      y: y - size,
      size,
      font,
      color,
    });
    y -= size + 6;
  };
  centered('Consentement parental', 18, bold, accent);
  centered('Accompagnement scolaire - Association Séphora Berrebi', 11, bold, dark);
  y -= 10;

  const studentName = `${student.first_name} ${student.last_name || ''}`.trim();
  paragraph(
    `Élève : ${studentName}${student.level ? ` (${student.level})` : ''}${
      student.school?.name ? `, ${student.school.name}` : ''
    }`,
    { font: bold }
  );
  paragraph(`Responsable légal : ${row.signer_name} (${row.signer_relation})`, {
    font: bold,
    gap: 12,
  });

  for (const item of items) {
    const accepted = !!row.choices?.[item.id]?.accepted;
    ensure(40);
    // Tick box
    page.drawRectangle({
      x: M,
      y: y - 11,
      width: 10,
      height: 10,
      borderColor: dark,
      borderWidth: 1,
    });
    if (accepted) {
      page.drawLine({ start: { x: M + 2, y: y - 6 }, end: { x: M + 4.5, y: y - 9 }, thickness: 1.5, color: dark });
      page.drawLine({ start: { x: M + 4.5, y: y - 9 }, end: { x: M + 9, y: y - 2.5 }, thickness: 1.5, color: dark });
    }
    paragraph(`${item.title}${accepted ? '' : ' : non accordé'}`, {
      x: M + 18,
      font: bold,
      color: dark,
      gap: 1,
    });
    paragraph(item.text, { x: M + 18, size: 9.5, gap: 9 });
  }

  // Signature
  ensure(150);
  y -= 6;
  paragraph(`Signé électroniquement le ${frDateTime(row.signed_at)}.`, { font: bold });
  paragraph(`${row.signer_name}`, { gap: 2 });
  if (signaturePng) {
    const image = await pdf.embedPng(signaturePng);
    const scale = Math.min(220 / image.width, 80 / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    ensure(h + 10);
    page.drawImage(image, { x: M, y: y - h, width: w, height: h });
    y -= h + 10;
  }

  // Proof of signature
  ensure(70);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
  y -= 8;
  paragraph(
    [
      `Accord donné en ligne sur MyCogniverse (mycogniverse.org) depuis un lien personnel envoyé le ${frDate(
        row.requested_at
      )}${row.channel === 'email' ? ` à ${row.sent_to}` : row.channel === 'whatsapp' ? ' par WhatsApp' : ''}.`,
      row.verified_birth_date
        ? "Identité vérifiée par la date de naissance de l'élève."
        : null,
      `Adresse IP : ${row.ip || 'inconnue'}. Référence : ${row.id} (textes ${row.texts_version}).`,
      "Pour retirer cet accord ou modifier ces choix : skola@sephoraberrebi.org.",
    ]
      .filter(Boolean)
      .join('\n'),
    { size: 8, color: grey }
  );
  return pdf.save();
};

// Stores the PDF in the private bucket, next to the student's documents
export const storeConsentPdf = async (studentId, pdfBytes) => {
  const key = `student-documents/${studentId}/consentement-parental-${Date.now()}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: key,
      Body: Buffer.from(pdfBytes),
      ContentType: 'application/pdf',
    })
  );
  return key;
};

export { sendSignedEmails, parentName, frDate };
