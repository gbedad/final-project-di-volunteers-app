// Outing authorisation signed online by a parent: a personal link (e-mail
// or WhatsApp), the parent reads, ticks, says how the child comes and
// leaves, signs; the signed PDF goes to the student's documents.
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';
import sendEmail from '../config/sendEmails.js';
import { escapeHtml, emailButton } from '../config/notify.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3, { PRIVATE_BUCKET } from '../config/aws.config.js';
import { newToken, hashToken, parentOf } from './parentalConsent.js';
import StudentFiles from '../models/students/studentsFiles.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const one = async (sql, replacements) => (await q(sql, replacements))[0] || null;
const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const PUBLIC_URL = (process.env.PUBLIC_CLIENT_URL || 'https://www.mycogniverse.org').replace(/\/$/, '');
export const outingConsentLink = (token) => `${PUBLIC_URL}/autorisation-sortie/${token}`;
export const RELATIONS = ['Mère', 'Père', 'Tuteur légal', 'Autre responsable légal'];
const WAYS = ['accompagné', 'seul'];

const frDay = (d) =>
  d
    ? new Date(`${day(d)}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'date à fixer';
const when = (a) =>
  `${frDay(a.date)}${a.start_time ? `, de ${a.start_time}${a.end_time ? ` à ${a.end_time}` : ''}` : ''}`;

// What the parent agrees to (the first three are required)
export const outingItems = (child, a) => [
  {
    id: 'participation',
    required: true,
    title: 'Participation',
    text: `J'autorise ${child} à participer à la sortie « ${a.title} » le ${when(a)}${a.place ? ` (${a.place})` : ''}, encadrée par les accompagnateurs de l'association Séphora Berrebi.`,
  },
  {
    id: 'transport',
    required: true,
    title: 'Déplacements',
    text: `J'autorise les accompagnateurs à emmener ${child} à pied ou en transports en commun pendant la sortie.`,
  },
  {
    id: 'urgence',
    required: true,
    title: 'Urgence',
    text: "En cas d'urgence, j'autorise les accompagnateurs à prendre les mesures nécessaires (appel des secours, transport à l'hôpital). Je serai prévenu(e) au plus vite au numéro indiqué.",
  },
  {
    id: 'photos',
    required: false,
    title: 'Photos',
    text: `J'accepte que ${child} soit pris(e) en photo pendant la sortie, pour les supports de l'association (sans son nom de famille).`,
  },
];

const registrationWithAll = (where, replacements) =>
  one(
    `select r.*, a.title, a.date, a.start_time, a.end_time, a.place, a.meeting_point, a.meeting_time,
            a.meeting_point2, a.meeting_time2, a.bring, a.status as activity_status,
            s.first_name, s.last_name, s.level,
            s.parent1_firstname, s.parent1_lastname, s.parent1_email, s.parent1_phone,
            s.parent2_firstname, s.parent2_lastname, s.parent2_email, s.parent2_phone
       from activity_registrations r join activities a on a.id = r.activity_id join students s on s.id = r.student_id
      where ${where}`,
    replacements
  );

// The link lasts until the end of the outing day (30 days without a date)
const expiryOf = (a) => {
  if (a.date) return new Date(`${day(a.date)}T23:59:00+01:00`);
  return new Date(Date.now() + 30 * 86400000);
};

const send = (to, subject, html, label, attachments) =>
  sendEmail(to, subject, html, attachments).catch((err) => console.log(`${label} email not sent:`, err.message));

// channel: 'email' (sent now) or 'whatsapp' (the team copies the message)
export const requestOutingConsent = async (registrationId, { channel = 'email', parent: n = 1 }, me) => {
  const r = await registrationWithAll('r.id = :registrationId', { registrationId });
  if (!r || r.status !== 'inscrit') return { error: 'Inscription introuvable', status: 404 };
  if (r.consent_at) return { error: 'Autorisation déjà reçue', status: 409 };
  if (r.activity_status === 'annulée') return { error: 'Activité annulée' };
  const parent = parentOf(r, n === 2 ? 2 : 1);
  if (channel === 'email' && !parent.email) return { error: "Pas d'e-mail pour ce parent : utilisez WhatsApp" };
  const token = newToken();
  const expiresAt = expiryOf(r);
  if (expiresAt < new Date()) return { error: 'La sortie est passée' };
  await q(
    `update activity_registrations set consent_token_hash = :hash, consent_requested_at = now(), consent_expires_at = :expiresAt,
       consent_channel = :channel, consent_sent_to = :sentTo where id = :registrationId`,
    { hash: hashToken(token), expiresAt, channel, sentTo: channel === 'email' ? parent.email : parent.phone, registrationId }
  );
  const link = outingConsentLink(token);
  if (channel === 'email') {
    send(
      parent.email,
      `Sortie « ${r.title} » : autorisation pour ${r.first_name}`,
      `<p>Bonjour${parent.first_name ? ` ${escapeHtml(parent.first_name)}` : ''},</p>
      <p><b>${escapeHtml(r.first_name)}</b> est inscrit(e) à la sortie culturelle « ${escapeHtml(r.title)} » le ${escapeHtml(when(r))}.</p>
      <p>Merci de donner votre autorisation en ligne (2 minutes, depuis votre téléphone) :</p>
      <p>${emailButton(link, "Donner l'autorisation")}</p>
      <p>Ce lien vous est personnel.</p>
      <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
      'Outing consent request'
    );
  }
  return {
    request: {
      link,
      channel,
      sent_to: channel === 'email' ? parent.email : parent.phone,
      expires_at: expiresAt,
      whatsapp: `Bonjour${parent.first_name ? ` ${parent.first_name}` : ''}, ${r.first_name} est inscrit(e) à la sortie « ${r.title} » le ${when(r)}. Merci de donner votre autorisation en ligne (2 minutes) :\n\n${link}\n\n${me?.first_name ? `${me.first_name}, ` : ''}association Séphora Berrebi`,
    },
  };
};

const byToken = async (token) => {
  const r = await registrationWithAll('r.consent_token_hash = :hash', { hash: hashToken(token) });
  if (!r) return { error: 'Lien inconnu ou remplacé', status: 404 };
  return { r };
};

export const outingConsentPage = async (token) => {
  const { r, error, status } = await byToken(token);
  if (error) return { error, status };
  const state = r.consent_at
    ? 'signed'
    : r.status !== 'inscrit' || r.activity_status === 'annulée'
      ? 'cancelled'
      : new Date(r.consent_expires_at) < new Date()
        ? 'expired'
        : 'pending';
  return {
    page: {
      state,
      child: r.first_name,
      activity: {
        title: r.title,
        when: when(r),
        place: r.place,
        meeting_point: r.meeting_point,
        meeting_time: r.meeting_time,
        meeting_point2: r.meeting_point2,
        meeting_time2: r.meeting_time2,
        bring: r.bring,
      },
      items: outingItems(r.first_name, r),
      relations: RELATIONS,
      parent: { first_name: r.parent1_firstname, last_name: r.parent1_lastname },
      phone: r.parent1_phone || r.parent2_phone || '',
      signed_at: r.consent_at,
    },
  };
};

// ---- Signed PDF ----
const pdfText = (s) =>
  String(s || '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
const wrapText = (text, font, size, width) => {
  const lines = [];
  for (const p of pdfText(text).split('\n')) {
    let line = '';
    for (const w of p.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > width && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
  }
  return lines;
};
export const buildPdf = async ({ r, items, choices, signer, relation, arrival, departure, phone, signedAt, ip, signaturePng }) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Autorisation de sortie - ${r.first_name} ${r.last_name || ''}`);
  pdf.setAuthor('Association Séphora Berrebi');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0, 0.38, 0.39);
  const grey = rgb(0.35, 0.35, 0.35);
  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const page = pdf.addPage([W, H]);
  let y = H - M;
  const para = (text, { size = 10, font = regular, color = rgb(0, 0, 0), x = M, gap = 4 } = {}) => {
    for (const l of wrapText(text, font, size, W - x - M)) {
      page.drawText(l, { x, y: y - size, size, font, color });
      y -= size + 3;
    }
    y -= gap;
  };
  try {
    const logo = await pdf.embedPng(fs.readFileSync(path.join(__dirname, '../assets/logo-asb.png')));
    page.drawImage(logo, { x: (W - 64) / 2, y: y - 64, width: 64, height: 64 });
    y -= 76;
  } catch {}
  para('Autorisation de sortie', { size: 18, font: bold, color: dark, gap: 2 });
  para(`Sortie culturelle « ${r.title} », ${when(r)}${r.place ? `, ${r.place}` : ''}`, { font: bold, gap: 12 });
  para(`Enfant : ${r.first_name} ${r.last_name || ''}${r.level ? ` (${r.level})` : ''}`, { font: bold });
  para(`Responsable légal : ${signer} (${relation})`, { font: bold, gap: 12 });
  for (const item of items) {
    const ok = !!choices[item.id];
    para(`[${ok ? 'X' : ' '}] ${item.title}${ok ? '' : ' : non accordé'}`, { font: bold, color: dark, gap: 1 });
    para(item.text, { size: 9.5, x: M + 14, gap: 8 });
  }
  para(`Arrivée au point de rendez-vous : ${arrival === 'seul' ? 'seul(e)' : 'accompagné(e) par un adulte'}.`);
  para(`Après la sortie : ${departure === 'seul' ? 'repart seul(e)' : 'récupéré(e) par un adulte'}.`);
  para(`Téléphone joignable pendant la sortie : ${phone}`, { gap: 12 });
  para(
    `Signé électroniquement le ${signedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' })} par ${signer}.`,
    { font: bold, gap: 2 }
  );
  if (signaturePng) {
    const image = await pdf.embedPng(signaturePng);
    const scale = Math.min(220 / image.width, 80 / image.height, 1);
    page.drawImage(image, { x: M, y: y - image.height * scale, width: image.width * scale, height: image.height * scale });
    y -= image.height * scale + 10;
  }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
  y -= 8;
  para(
    `Autorisation donnée en ligne sur MyCogniverse depuis un lien personnel envoyé le ${new Date(r.consent_requested_at).toLocaleDateString('fr-FR')}${
      r.consent_channel === 'email' ? ` à ${r.consent_sent_to}` : ' par WhatsApp'
    }. Adresse IP : ${ip || 'inconnue'}. Référence : inscription ${r.id}.`,
    { size: 8, color: grey }
  );
  return pdf.save();
};

// Body: { signer_name, relation, choices: { id: true }, arrival, departure,
// emergency_phone, signature: 'data:image/png;base64,…' }
export const signOutingConsent = async (token, body, ip) => {
  const { r, error, status } = await byToken(token);
  if (error) return { error, status };
  if (r.consent_at) return { error: 'Autorisation déjà signée', status: 409 };
  if (r.status !== 'inscrit' || r.activity_status === 'annulée') return { error: 'Inscription annulée', status: 410 };
  if (new Date(r.consent_expires_at) < new Date()) return { error: 'Lien expiré : demandez-en un nouveau', status: 410 };
  const signer = String(body.signer_name || '').trim().slice(0, 120);
  const relation = RELATIONS.includes(body.relation) ? body.relation : null;
  if (!signer || !relation) return { error: 'Indiquez votre nom et votre lien avec l’enfant' };
  const items = outingItems(r.first_name, r);
  const choices = Object.fromEntries(items.map((i) => [i.id, !!body.choices?.[i.id]]));
  if (items.some((i) => i.required && !choices[i.id])) return { error: 'Les trois premières cases sont nécessaires pour la sortie' };
  if (!WAYS.includes(body.arrival) || !WAYS.includes(body.departure)) return { error: 'Dites comment votre enfant vient et repart' };
  const phone = String(body.emergency_phone || '').trim().slice(0, 30);
  if (phone.replace(/\D/g, '').length < 9) return { error: 'Indiquez un téléphone joignable pendant la sortie' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature || ''));
  const signaturePng = m ? Buffer.from(m[1], 'base64') : null;
  if (!signaturePng || signaturePng.length < 200 || signaturePng.length > 400000) return { error: 'Signature vide ou illisible' };

  const signedAt = new Date();
  const pdfBytes = await buildPdf({
    r,
    items,
    choices,
    signer,
    relation,
    arrival: body.arrival,
    departure: body.departure,
    phone,
    signedAt,
    ip,
    signaturePng,
  });
  const key = `student-documents/${r.student_id}/autorisation-sortie-${r.activity_id}-${Date.now()}.pdf`;
  await s3.send(
    new PutObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key, Body: Buffer.from(pdfBytes), ContentType: 'application/pdf' })
  );
  const filename = `Autorisation de sortie - ${r.title} - ${r.first_name} ${r.last_name || ''}.pdf`.replace(/\s+/g, ' ');
  const file = await StudentFiles.create({ filename, mimetype: 'application/pdf', path: key, studentId: r.student_id });
  await q(
    `update activity_registrations set consent_at = :today, consent_source = 'en ligne', consent_signer = :signer,
       consent_relation = :relation, consent_choices = cast(:choices as jsonb), consent_file_id = :fileId, consent_ip = :ip,
       arrival = :arrival, departure = :departure, emergency_phone = :phone
     where id = :id`,
    {
      today: signedAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
      signer,
      relation,
      choices: JSON.stringify(choices),
      fileId: file.id,
      ip: ip || null,
      arrival: body.arrival,
      departure: body.departure,
      phone,
      id: r.id,
    }
  );
  const email = r.consent_channel === 'email' ? r.consent_sent_to : r.parent1_email || r.parent2_email;
  if (email) {
    send(
      email,
      `Autorisation de sortie de ${r.first_name} : « ${r.title} »`,
      `<p>Bonjour,</p><p>Merci, nous avons bien reçu votre autorisation pour la sortie « ${escapeHtml(r.title)} » de
      <b>${escapeHtml(r.first_name)}</b>. Vous trouverez votre exemplaire en pièce jointe.</p>
      <p>Bien cordialement,<br>L'association Séphora Berrebi</p>`,
      'Outing consent copy',
      [{ filename, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }]
    );
  }
  return { result: { state: 'signed', copy_sent: !!email } };
};

// The signed PDF, for the team (link valid an hour)
export const outingConsentFile = async (registrationId) => {
  const r = await one('select consent_file_id from activity_registrations where id = :registrationId', { registrationId });
  if (!r?.consent_file_id) return null;
  return StudentFiles.findByPk(r.consent_file_id);
};
