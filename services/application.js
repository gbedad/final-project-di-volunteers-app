// Volunteer application: checklist computed from what the volunteer has
// filled in, and automatic status updates during the first steps.
import Users from '../models/users.model.js';
import Skills from '../models/skills.model.js';
import Files from '../models/files.model.js';
import sendEmail from '../config/sendEmails.js';
import { recordStatusChange } from './statusHistory.js';
import {
  escapeHtml,
  clientUrl,
  adminEmails,
  emailButton,
} from '../config/notify.js';

// Statuses the application moves through on its own; from "A interviewer"
// on, only an admin changes the status
export const EARLY_STATUSES = [
  'Compte créé',
  'A renseigner',
  'Renseigné',
  'A télécharger',
];

export const DOC_TYPES = [
  'cv',
  'id',
  'b3',
  'honorability',
  'other',
  'convention',
];

// Admin checkboxes kept in sync with the uploaded documents
export const RECEIVED_FLAGS = {
  cv: 'cv_received',
  id: 'id_received',
  b3: 'b3_received',
  convention: 'convention_received',
  honorability: 'honorability_received',
};

// The attestation d'honorabilité is due one month after the convention is
// signed; the signing date is taken as the upload date of the convention
export const honorabilityDeadline = (files) => {
  const dates = files
    .filter((f) => f.doc_type === 'convention' && isAvailable(f) && f.uploaded_at)
    .map((f) => new Date(f.uploaded_at));
  if (!dates.length) return null;
  const due = new Date(Math.min(...dates));
  due.setMonth(due.getMonth() + 1);
  return due;
};

const hasItems = (value) => Array.isArray(value) && value.length > 0;

// Files lost with the old AWS bucket don't count as uploaded
export const isAvailable = (file) => !file.path.includes('amazonaws.com');

export const applicationProgress = async (userId) => {
  const user = await Users.findByPk(userId, {
    attributes: [
      'id',
      'status',
      'city',
      'zipcode',
      'activity',
      'convention_received',
      'honorability_received',
    ],
  });
  if (!user) return null;
  const skill = await Skills.findOne({ where: { userId } });
  const files = await Files.findAll({
    where: { userId },
    attributes: ['path', 'doc_type', 'uploaded_at'],
  });
  const has = (type) =>
    files.some((f) => f.doc_type === type && isAvailable(f));

  // What is filled in, item by item, to tell the volunteer what is missing
  const details = {
    address: !!user.city,
    activity: !!user.activity,
    topics: !!skill && hasItems(skill.topics),
    slots: !!skill && hasItems(skill.when_day_slot),
    places:
      !!skill &&
      (hasItems(skill.where_location) || skill.how_location === 'A distance'),
  };
  const profile = details.address && details.activity;
  const wishes = details.topics && details.slots && details.places;
  const documents = {
    cv: has('cv'),
    id: has('id'),
    b3: has('b3'),
    // Received as a file or on paper (ticked by an admin)
    honorability: !!user.honorability_received || has('honorability'),
  };
  const conventionSigned = !!user.convention_received || has('convention');
  const due = honorabilityDeadline(files);
  // The criminal record (B3) is only needed for the final validation
  const readyToSubmit = profile && wishes && documents.cv && documents.id;

  return {
    status: user.status,
    profile,
    wishes,
    documents,
    details,
    conventionSigned,
    honorabilityDue: due,
    readyToSubmit,
    canSubmit: readyToSubmit && EARLY_STATUSES.includes(user.status),
  };
};

// Position of the automatic statuses: an application only moves forward
// on its own ("Compte créé" and the old "Renseigné" come before the rest)
const EARLY_RANK = {
  'Compte créé': 0,
  Renseigné: 0,
  'A renseigner': 1,
  'A télécharger': 2,
};

// Moves an application to "A télécharger" once the profile and the wishes
// are filled in; never moves it backwards
export const syncEarlyStatus = async (userId) => {
  const progress = await applicationProgress(userId);
  if (!progress || !EARLY_STATUSES.includes(progress.status)) return;
  const next =
    progress.profile && progress.wishes ? 'A télécharger' : 'A renseigner';
  if (EARLY_RANK[next] > EARLY_RANK[progress.status]) {
    await Users.update({ status: next }, { where: { id: userId } });
    await recordStatusChange(userId, progress.status, next);
    console.log(`Application ${userId}: ${progress.status} -> ${next}`);
  }
};

// Route middleware: recompute the status once a save has succeeded
export const syncStatusAfter = (getUserId) => (req, res, next) => {
  res.on('finish', () => {
    const userId = getUserId(req, res);
    if (res.statusCode < 400 && userId) {
      syncEarlyStatus(userId).catch((err) =>
        console.log('Status sync failed:', err.message)
      );
    }
  });
  next();
};

// A document counts as received when a file is uploaded or an admin
// received it on paper; uploading/deleting files never undoes a paper tick
export const updateReceivedFlag = async (userId, type) => {
  const flag = RECEIVED_FLAGS[type];
  if (!flag || !userId) return;
  const user = await Users.findByPk(userId, {
    attributes: ['id', 'paper_documents'],
  });
  if (!user) return;
  const files = await Files.findAll({
    where: { userId, doc_type: type },
    attributes: ['path'],
  });
  const received =
    files.some(isAvailable) || (user.paper_documents || []).includes(type);
  await Users.update({ [flag]: received }, { where: { id: userId } });
};

// What the admin sees for each document: file (with date) and/or paper
export const documentsStatus = async (userId) => {
  const user = await Users.findByPk(userId, {
    attributes: ['id', 'paper_documents', 'test_voltaire_passed'],
  });
  if (!user) return null;
  const files = await Files.findAll({
    where: { userId },
    attributes: ['path', 'filename', 'doc_type', 'uploaded_at'],
    order: [['id', 'DESC']],
  });
  const paper = user.paper_documents || [];
  const documents = Object.keys(RECEIVED_FLAGS).map((type) => {
    const file = files.find((f) => f.doc_type === type && isAvailable(f));
    return {
      type,
      file: file
        ? { path: file.path, filename: file.filename, uploaded_at: file.uploaded_at }
        : null,
      paper: paper.includes(type),
      received: !!file || paper.includes(type),
    };
  });
  const due = honorabilityDeadline(files);
  return {
    documents,
    test_voltaire_passed: !!user.test_voltaire_passed,
    honorability_due: due,
  };
};

export const setPaperDocument = async (userId, type, received) => {
  const user = await Users.findByPk(userId, { attributes: ['id', 'paper_documents'] });
  if (!user) return null;
  const paper = new Set(user.paper_documents || []);
  if (received) paper.add(type);
  else paper.delete(type);
  await Users.update(
    { paper_documents: [...paper] },
    { where: { id: userId } }
  );
  await updateReceivedFlag(userId, type);
  return documentsStatus(userId);
};

// "Envoyer mon dossier": ready for the interview, admins are notified
export const submitApplication = async (userId) => {
  const progress = await applicationProgress(userId);
  if (!progress) return { error: 'Utilisateur introuvable', code: 404 };
  if (!progress.canSubmit) {
    return { error: 'Le dossier est incomplet ou déjà envoyé', code: 409 };
  }
  await Users.update({ status: 'A interviewer' }, { where: { id: userId } });
  await recordStatusChange(userId, progress.status, 'A interviewer');
  const user = await Users.findByPk(userId, {
    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
  });
  sendEmail(
    adminEmails(),
    `Dossier complet : ${user.first_name} ${user.last_name}`,
    `<p>${escapeHtml(user.first_name)} ${escapeHtml(
      user.last_name
    )} a complété son dossier (profil, souhaits, CV et pièce d'identité). Il est prêt pour l'entretien.</p>
    <p><b>Email :</b> ${escapeHtml(user.email)}<br><b>Téléphone :</b> ${escapeHtml(
      user.phone
    )}</p>
    <p>${emailButton(
      `${clientUrl()}/login?candidat=${user.id}`,
      'Voir la fiche du candidat'
    )}</p>`
  ).catch((err) => console.log('Submission email not sent:', err.message));

  // Confirmation to the volunteer
  sendEmail(
    user.email,
    'Nous avons bien reçu votre dossier de candidature',
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>Merci ! Nous avons bien reçu votre dossier de candidature pour devenir tuteur bénévole de l'association Séphora Berrebi.</p>
    <p>Nous allons l'étudier et vous contacterons prochainement pour organiser un entretien.</p>
    <p>Vous pouvez suivre l'avancement de votre candidature à tout moment depuis votre espace :</p>
    <p>${emailButton(`${clientUrl()}/login`, 'Accéder à mon espace')}</p>
    ${
      progress.documents.b3
        ? ''
        : "<p>Avant la signature de la convention, il vous sera demandé un extrait de casier judiciaire (B3) : vous pouvez dès maintenant le demander en ligne et le déposer dans l'onglet « Mes documents ».</p>"
    }
    <p>À très vite,<br>L'équipe MyCogniverse</p>`
  ).catch((err) =>
    console.log('Volunteer confirmation email not sent:', err.message)
  );
  return { status: 'A interviewer' };
};
