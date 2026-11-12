// "À traiter": what waits for the team, in one place, each with its count,
// the first people concerned and where to act. Demonstration people are
// left out (tests only).
import { Op } from 'sequelize';
import db from '../config/database.js';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { conventionState } from './application.js';
import { ANSWER_DAYS, pairStats } from './followUp.js';
import { sessionLog, parisToday } from './sessionLog.js';
import { resumeProblems, RESUME_SLOTS } from './pairBreaks.js';

const SHOWN = 6;
const name = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '—');
const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const frDate = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR');
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// One block of the page; items: the first ones (count is the total)
const block = (key, label, severity, link, all, hint) => ({
  key,
  label,
  severity,
  link,
  hint: hint || null,
  count: all.length,
  items: all.slice(0, SHOWN),
});

export const todoList = async () => {
  const today = parisToday();

  // ---- Tutors ----
  const volunteers = await Users.findAll({
    where: { role: 'volunteer', is_demo: { [Op.not]: true }, status: { [Op.ne]: 'Archivé' } },
    attributes: [
      'id',
      'first_name',
      'last_name',
      'status',
      'paper_documents',
      'b3_received',
      'convention_received',
      'honorability_received',
    ],
    include: [{ association: 'file', attributes: ['id', 'path', 'filename', 'doc_type', 'uploaded_at'] }],
  });
  const tutorLink = (u) => ({ path: '/change-status', userId: u.id });
  const countersign = volunteers
    .filter(
      (u) => conventionState(u.file, (u.paper_documents || []).includes('convention')).state === 'to_countersign'
    )
    .map((u) => ({ id: u.id, label: name(u), detail: u.status, link: tutorLink(u) }));
  const validated = volunteers.filter((u) => u.status === 'Validé');
  const missingDocs = validated
    .map((u) => ({
      u,
      missing: [
        !u.b3_received && 'B3',
        !u.convention_received && 'convention',
        u.convention_received && !u.honorability_received && "attestation d'honorabilité",
      ].filter(Boolean),
    }))
    .filter((x) => x.missing.length)
    .map(({ u, missing }) => ({ id: u.id, label: name(u), detail: missing.join(', '), link: tutorLink(u) }));

  // ---- Pairs ----
  const pairs = await Binomes.findAll({ raw: true });
  const students = await Students.findAll({
    attributes: ['id', 'first_name', 'last_name', 'status', 'is_demo', 'parental_consent_at', 'created_at'],
    raw: true,
  });
  const studentOf = Object.fromEntries(students.map((s) => [s.id, s]));
  const tutorIds = [...new Set(pairs.map((p) => p.tutor_id).filter(Boolean))];
  const tutors = await Users.findAll({
    where: { id: tutorIds },
    attributes: ['id', 'first_name', 'last_name', 'is_demo', 'phone'],
    raw: true,
  });
  const tutorOf = Object.fromEntries(tutors.map((t) => [t.id, t]));
  const real = (p) => !studentOf[p.student_id]?.is_demo && !tutorOf[p.tutor_id]?.is_demo;
  const pairLabel = (p) => `${name(studentOf[p.student_id])} · ${name(tutorOf[p.tutor_id])}`;
  const open = pairs.filter((p) => ['actif', 'en pause'].includes(p.status) && real(p));

  const proposals = pairs
    .filter((p) => p.status === 'proposé' && real(p) && daysSince(p.proposed_at) > ANSWER_DAYS)
    .sort((a, b) => new Date(a.proposed_at) - new Date(b.proposed_at))
    .map((p) => ({
      id: p.id,
      label: pairLabel(p),
      detail: `proposé il y a ${daysSince(p.proposed_at)} jours`,
      link: { path: '/binomes', pairId: p.id },
    }));

  const consentStudents = [...new Set(open.map((p) => p.student_id))]
    .map((id) => studentOf[id])
    .filter((s) => s && !s.parental_consent_at)
    .map((s) => ({ id: s.id, label: name(s), detail: 'binôme en cours', link: { path: `/eleves/${s.id}` } }));

  const waiting = students
    .filter((s) => !s.is_demo && ['Nouvelle demande', 'En attente de tuteur'].includes(s.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((s) => ({
      id: s.id,
      label: name(s),
      detail: `${s.status.toLowerCase()} depuis ${daysSince(s.created_at)} jours`,
      link: { path: `/eleves/${s.id}` },
    }));

  // Reports: active pairs without a written report for a month (same rule
  // as the alerts of the "Binômes" page)
  const sessions = await Seances.findAll({
    where: { binome_id: { [Op.in]: open.map((p) => p.id) } },
    attributes: ['binome_id', 'date', 'attendance', 'progress', 'duration_minutes', 'work', 'remark', 'late'],
    raw: true,
  });
  const reports = open
    .map((p) => ({ p, alert: pairStats(p, sessions.filter((s) => s.binome_id === p.id)).alerts.find((a) => a.type === 'no_report') }))
    .filter((x) => x.alert)
    .map(({ p, alert }) => ({
      id: p.id,
      label: pairLabel(p),
      detail: alert.label.replace('Pas de compte-rendu depuis', 'depuis'),
      link: { path: '/binomes', pairId: p.id },
    }));

  // ---- Sessions: expected these last two weeks, nothing recorded ----
  const log = await sessionLog(addDays(today, -14), today);
  const toConfirm = log.rows
    .filter((r) => r.kind === 'attendue' && !r.is_demo)
    .map((r) => ({
      id: r.id,
      label: `${name(r.student)} · ${name(r.tutor)}`,
      detail: `${r.today ? "aujourd'hui, pas encore émargée" : frDate(r.date)}${
        r.slot ? ` · ${r.slot.startTime}–${r.slot.endTime}` : ''
      }`,
      link: { path: '/binomes/seances' },
    }));
  const [[pending]] = await db.query(
    `select (select count(*)::int from jotform_pending where resolved_at is null) as jotform,
            (select count(*)::int from zoom_pending where resolved_at is null) as zoom`,
    { logging: false }
  );
  const toMatch = [
    ...Array.from({ length: pending.jotform }, (_, i) => ({ id: `j${i}`, label: 'Signature Jotform' })),
    ...Array.from({ length: pending.zoom }, (_, i) => ({ id: `z${i}`, label: 'Séance Zoom' })),
  ];

  // ---- After the holidays: active pairs with nothing since the return ----
  const resume = (await resumeProblems(open.filter((p) => p.status === 'actif'))).map(({ pair, back, slots }) => ({
    id: pair.id,
    label: pairLabel(pair),
    detail: `rien depuis la rentrée du ${frDate(back.back)} (créneaux du ${slots
      .map((x) => frDate(x.date).slice(0, 5))
      .join(' et du ')})${tutorOf[pair.tutor_id]?.phone ? ` · tuteur : ${tutorOf[pair.tutor_id].phone}` : ''}`,
    link: { path: '/binomes', pairId: pair.id },
  }));
  // ---- New slots told by the tutors ----
  const slotText = (schedule) => (schedule || []).map((x) => `${x.day.toLowerCase()} ${x.startTime}–${x.endTime}`).join(', ');
  const slotRequests = open
    .filter((p) => p.schedule_request?.schedule?.length)
    .map((p) => ({
      id: p.id,
      label: pairLabel(p),
      detail: `${slotText(p.schedule) || 'aucun créneau'} → ${slotText(p.schedule_request.schedule)}${
        p.schedule_request.since ? ` à partir du ${frDate(p.schedule_request.since)}` : ''
      }`,
      link: { path: '/binomes', pairId: p.id },
    }));

  // ---- Validated tutors never proposed to a student ----
  const everPaired = new Set(pairs.map((p) => p.tutor_id));
  const neverProposed = validated
    .filter((u) => !everPaired.has(u.id))
    .map((u) => ({ id: u.id, label: name(u), detail: 'validé, aucun élève proposé', link: tutorLink(u) }));

  return [
    block('countersign', 'Conventions à contresigner', 'warning', { path: '/view-users' }, countersign,
      'Signées par le bénévole, en attente de la présidente.'),
    block('consent', 'Accords parentaux manquants', 'error', { path: '/eleves' }, consentStudents,
      'Élèves en binôme sans accord des parents.'),
    block('proposals', 'Propositions sans réponse', 'warning', { path: '/binomes' }, proposals,
      `Tuteurs qui n'ont pas répondu depuis plus de ${ANSWER_DAYS} jours.`),
    block('waiting', 'Élèves sans tuteur', 'info', { path: '/eleves' }, waiting),
    block('confirm', 'Séances non renseignées', 'warning', { path: '/binomes/seances' }, toConfirm,
      'Créneaux des 14 derniers jours sans rien d’enregistré : « Renseigner » dans le journal (eu lieu, élève absent ou pas de séance).'),
    block('resume', 'Reprise non constatée après les vacances', 'error', { path: '/binomes/seances' }, resume,
      `Rien d’enregistré (émargement, Zoom, Jotform) sur les ${RESUME_SLOTS} premiers créneaux après la rentrée : appelez le tuteur.`),
    block('slots', 'Créneaux signalés par les tuteurs', 'warning', { path: '/binomes' }, slotRequests,
      'À appliquer (ou écarter) dans la fiche du binôme.'),
    block('match', 'Jotform et Zoom à rattacher', 'warning', { path: '/binomes/seances', open: 'jotform-zoom' },
      toMatch.length ? [{ id: 'all', label: [pending.jotform && `${pending.jotform} signature(s) Jotform`, pending.zoom && `${pending.zoom} séance(s) Zoom`].filter(Boolean).join(' et ') }] : [],
      'Non reconnues automatiquement : à rattacher au bon binôme.'),
    block('reports', 'Comptes-rendus en retard', 'info', { path: '/binomes' }, reports,
      'Binômes sans compte-rendu écrit depuis plus d’un mois.'),
    block('documents', 'Documents manquants des tuteurs validés', 'info', { path: '/documents' }, missingDocs),
    block('new', 'Nouveaux tuteurs jamais proposés', 'info', { path: '/view-users' }, neverProposed,
      'Validés, sans aucun élève proposé.'),
  ].map((b) => (b.key === 'match' ? { ...b, count: pending.jotform + pending.zoom } : b));
};
