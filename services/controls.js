// "Contrôles": inconsistencies in the data, found automatically, each with
// where to correct it. Demonstration people are left out.
import { Op } from 'sequelize';
import Users from '../models/users.model.js';
import Students from '../models/students/students.model.js';
import Binomes from '../models/binomes.model.js';
import Seances from '../models/seances.model.js';
import { slotOn, dayOf } from './pairSchedule.js';

const SHOWN = 8;
// Sessions looked at: the last two months
const WINDOW_DAYS = 60;
// A slot "regularly" missed: at least this many sessions, and half of them
const OFF_SLOT_MIN = 2;
const name = (p) => (p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '—');
const REMOTE = /^\s*(à|a) distance\s*$/i;
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const parisMinutes = (value) => {
  const [h, m] = new Date(value)
    .toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
    .split(':')
    .map(Number);
  return h * 60 + m;
};
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}h${String(mins % 60).padStart(2, '0')}`;
const block = (key, label, hint, all) => ({
  key,
  label,
  hint,
  severity: 'warning',
  count: all.length,
  items: all.slice(0, SHOWN),
  link: null,
});
const IN_PROGRESS = ['actif', 'en pause'];
const OPEN = ['proposé', 'actif', 'en pause'];

export const controlList = async () => {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const pairs = await Binomes.findAll({ where: { status: { [Op.in]: OPEN } }, raw: true });
  const students = await Students.findAll({
    attributes: ['id', 'first_name', 'last_name', 'status', 'is_demo', 'when_day_slot', 'qf', 'qf_proof', 'school'],
    raw: true,
  });
  const studentOf = Object.fromEntries(students.map((s) => [s.id, s]));
  const tutors = await Users.findAll({
    where: { role: 'volunteer', is_demo: { [Op.not]: true } },
    attributes: ['id', 'first_name', 'last_name', 'status'],
    include: [{ association: 'skill', attributes: ['number_of_students'] }],
  });
  const tutorOf = Object.fromEntries(tutors.map((t) => [t.id, t]));
  const real = pairs.filter((p) => tutorOf[p.tutor_id] && studentOf[p.student_id] && !studentOf[p.student_id].is_demo);
  const pairLabel = (p) => `${name(studentOf[p.student_id])} · ${name(tutorOf[p.tutor_id])}`;
  const pairLink = (p) => ({ path: '/binomes', pairId: p.id });

  const sessions = await Seances.findAll({
    where: {
      binome_id: { [Op.in]: real.map((p) => p.id) },
      date: { [Op.gte]: since },
      attendance: 'présent',
    },
    attributes: ['binome_id', 'date', 'source', 'zoom_key', 'signed_in_at'],
    raw: true,
  });
  const sessionsOf = (p) => sessions.filter((s) => s.binome_id === p.id);

  // 1. "Sur site" but held on Zoom
  const onZoom = real
    .filter((p) => IN_PROGRESS.includes(p.status) && !REMOTE.test(p.how_location || ''))
    .map((p) => {
      const mine = sessionsOf(p);
      const zoom = mine.filter((s) => s.zoom_key).length;
      return { p, zoom, total: mine.length };
    })
    .filter(({ zoom, total }) => zoom >= 2 && zoom * 3 >= total * 2)
    .map(({ p, zoom, total }) => ({
      id: p.id,
      label: pairLabel(p),
      detail: `« ${p.how_location || 'modalité non renseignée'} », mais ${zoom} séance${zoom > 1 ? 's' : ''} sur ${total} faites sur Zoom`,
      link: pairLink(p),
    }));

  // 2. Sessions regularly off the slot: another day, or (Zoom only, where
  // the time is the real arrival) far from the slot's hours
  const offSlot = real
    .filter((p) => IN_PROGRESS.includes(p.status))
    .map((p) => {
      const mine = sessionsOf(p);
      const off = mine.filter((s) => {
        const date = String(s.date).slice(0, 10);
        const slot = slotOn(p, date);
        if (!slot) return true;
        if (!s.zoom_key || !s.signed_in_at) return false;
        const at = parisMinutes(s.signed_in_at);
        return at < minutesOf(slot.startTime) - 45 || at > minutesOf(slot.endTime);
      });
      // What actually happens most often: day, and hour on Zoom
      const usual = {};
      for (const s of off) {
        const date = String(s.date).slice(0, 10);
        const key = `${dayOf(date).toLowerCase()}${s.zoom_key && s.signed_in_at ? ` vers ${hhmm(Math.round(parisMinutes(s.signed_in_at) / 15) * 15)}` : ''}`;
        usual[key] = (usual[key] || 0) + 1;
      }
      const top = Object.entries(usual).sort((a, b) => b[1] - a[1])[0];
      return { p, off: off.length, total: mine.length, top };
    })
    .filter(({ off, total }) => off >= OFF_SLOT_MIN && off * 2 >= total)
    .map(({ p, off, total, top }) => ({
      id: p.id,
      label: pairLabel(p),
      detail: `${off} séance${off > 1 ? 's' : ''} sur ${total} hors du créneau (${(p.schedule || [])
        .map((s) => `${s.day.toLowerCase()} ${s.startTime}`)
        .join(', ') || 'aucun créneau'})${top ? `, souvent le ${top[0]}` : ''}`,
      link: pairLink(p),
    }));

  // 3. Tutors with more pairs than their maximum
  const overloaded = tutors
    .map((t) => {
      const open = real.filter((p) => p.tutor_id === t.id).length;
      const max = Number(t.skill?.number_of_students) || null;
      return { t, open, max };
    })
    .filter(({ open, max }) => open > (max || 1))
    .map(({ t, open, max }) => ({
      id: t.id,
      label: name(t),
      detail: `${open} binômes, maximum ${max || 'non renseigné (1 par défaut)'}`,
      link: { path: '/change-status', userId: t.id },
    }));

  // 4. Students followed (or waiting) with missing information
  const followed = students.filter(
    (s) => !s.is_demo && ['Nouvelle demande', 'En attente de tuteur', 'Binôme en cours', 'En pause'].includes(s.status)
  );
  const studentItem = (s, detail) => ({ id: s.id, label: name(s), detail, link: { path: `/eleves/${s.id}` } });
  const noSlot = followed.filter((s) => !(s.when_day_slot || []).length).map((s) => studentItem(s, s.status));
  const noQf = followed
    .filter((s) => (s.qf === null || s.qf === undefined) && s.qf_proof !== 'none')
    .map((s) => studentItem(s, s.qf_proof ? 'justificatif choisi, QF non saisi' : 'ni QF ni justificatif'));
  const noSchool = followed.filter((s) => !s.school?.name).map((s) => studentItem(s, s.status));

  return [
    block('zoom', 'Binômes « Sur site » faits sur Zoom', 'À passer « À distance » dans la fiche du binôme.', onZoom),
    block(
      'offslot',
      'Séances hors du créneau prévu',
      `Au moins ${OFF_SLOT_MIN} séances sur les ${WINDOW_DAYS} derniers jours, et la moitié ou plus : le créneau du binôme est sans doute à corriger.`,
      offSlot
    ),
    block('overloaded', 'Tuteurs au-delà de leur maximum d’élèves', 'Corrigez le nombre d’élèves possible sur la fiche du tuteur, si c’est voulu.', overloaded),
    block('noslot', 'Élèves sans créneau', 'Sans créneau, la recherche de tuteur ne peut rien proposer de précis.', noSlot),
    block('noqf', 'Élèves sans quotient familial', 'Nécessaire pour calculer la participation.', noQf),
    block('noschool', 'Élèves sans établissement', null, noSchool),
  ];
};
