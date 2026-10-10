// First contact with a candidate (users.pre_interview): attempts (date,
// channel, result, by), notes and next step. Stored as before, a JSON
// string; "isActive" (done) and "date"/"by"/"evaluation" are kept for the
// "Call" column of the tutors list and older readers.
import crypto from 'crypto';
import Users from '../models/users.model.js';

export const CHANNELS = ['Téléphone', 'WhatsApp', 'E-mail', 'Visio'];
export const RESULTS = ['Joint(e)', 'Pas de réponse', 'Message laissé'];
export const NEXT_STEPS = ['Passer en entretien', 'À recontacter', 'Ne pas donner suite'];
// Status proposed for a next step (the team confirms)
export const STEP_STATUS = {
  'Passer en entretien': 'A interviewer',
  'Ne pas donner suite': 'Déclinée',
};
const OLD_STEPS = { 'A interviewer': 'Passer en entretien' };
// A WhatsApp or e-mail contact is a first-contact attempt only early on
export const EARLY_STATUSES = ['Compte créé', 'A renseigner', 'A télécharger', 'A interviewer'];

const parse = (raw) => {
  let v = raw;
  for (let i = 0; i < 3 && typeof v === 'string'; i += 1) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' ? v : {};
};

// Current shape; an old record (one contact) becomes one attempt + notes
export const normalize = (raw) => {
  const old = parse(raw);
  const fc = {
    attempts: Array.isArray(old.attempts) ? old.attempts : [],
    notes: old.notes ?? old.evaluation ?? '',
    nextStep: OLD_STEPS[old.nextStep] || old.nextStep || '',
  };
  if (!Array.isArray(old.attempts) && (old.date || old.by)) {
    fc.attempts.push({
      id: crypto.randomUUID(),
      date: old.date || '',
      by: old.by || '',
      channel: '',
      result: old.isActive ? 'Joint(e)' : '',
    });
  }
  return fc;
};

export const isDone = (fc) =>
  fc.attempts.some((a) => a.result === 'Joint(e)') && !!fc.nextStep;

const sortAttempts = (list) =>
  [...list].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

// What is stored: the current shape plus the fields older readers use
export const serialize = (fc) => {
  const joined = sortAttempts(fc.attempts).find((a) => a.result === 'Joint(e)');
  const last = joined || sortAttempts(fc.attempts)[0] || {};
  return JSON.stringify({
    attempts: fc.attempts,
    notes: fc.notes,
    nextStep: fc.nextStep,
    isActive: isDone(fc),
    date: last.date || '',
    by: last.by || '',
    evaluation: fc.notes,
  });
};

export const loadFirstContact = async (userId) => {
  const user = await Users.findByPk(userId, {
    attributes: ['id', 'role', 'status', 'pre_interview'],
  });
  if (!user || user.role !== 'volunteer') return null;
  const fc = normalize(user.pre_interview);
  // An old record gets its attempt id once, so it can be edited
  if (fc.attempts.length && !Array.isArray(parse(user.pre_interview).attempts)) {
    await saveFirstContact(user, fc);
  }
  return { user, fc };
};
export const saveFirstContact = (user, fc) =>
  Users.update({ pre_interview: serialize(fc) }, { where: { id: user.id }, silent: true });

// What the page shows
export const view = (user, fc) => ({
  ...fc,
  attempts: sortAttempts(fc.attempts),
  isActive: isDone(fc),
  status: user.status,
  proposedStatus: STEP_STATUS[fc.nextStep] || null,
});

// WhatsApp / Gmail buttons of the volunteer's page: an attempt to complete
export const logContactAttempt = async (userId, channel, by) => {
  const data = await loadFirstContact(userId);
  if (!data || !EARLY_STATUSES.includes(data.user.status) || isDone(data.fc)) return;
  data.fc.attempts.push({
    id: crypto.randomUUID(),
    date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
    channel,
    result: '',
    by: by?.name || '',
    by_id: by?.id || null,
    auto: true,
  });
  await saveFirstContact(data.user, data.fc);
};
