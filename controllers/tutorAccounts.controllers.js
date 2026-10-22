// Tutors entered by the team (people already tutoring outside the
// application, or candidates met in person): account without a password,
// access sent by e-mail when the team chooses
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';
import sendEmail from '../config/sendEmails.js';
import { clientUrl, escapeHtml } from '../config/notify.js';
import { formatName } from '../services/names.js';
import { recordStatusChange } from '../services/statusHistory.js';
import { onMembershipChange } from '../services/cohorts.js';

// "Validé": already tutoring, can be paired at once; "A renseigner": new
// candidate, same path as after the public registration
export const START_STATUSES = ['Validé', 'A renseigner'];

// Same format as the registration form (international, "+33612345678"):
// "06 12 34 56 78" or "0033…" are converted, anything else kept as typed
const phoneOf = (value) => {
  const raw = String(value || '').trim();
  const digits = raw.replace(/[\s.\-()]/g, '');
  if (/^0\d{9}$/.test(digits)) return `+33${digits.slice(1)}`;
  if (/^00\d{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return raw || null;
};

const me = (req) => Number(req.user?.userid ?? req.user?.userId);

// Same secret as the password reset: the link stops working once a
// password has been chosen (the stored hash changes)
const sendAccess = async (user) => {
  const secret = process.env.ACCESS_TOKEN_SECRET + user.password;
  const token = jwt.sign({ email: user.email, id: user.id }, secret, {
    expiresIn: '7d',
  });
  const link = `${clientUrl()}/reset-password/${user.id}/${token}?invitation=1`;
  const what =
    user.status === 'Validé'
      ? 'vous y retrouverez vos élèves, la feuille de présence des séances et vos documents'
      : 'vous pourrez y compléter votre candidature';
  await sendEmail(
    user.email,
    'Votre espace tuteur MyCogniverse',
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>L'association Séphora Berrebi a créé votre espace de tuteur bénévole sur MyCogniverse : ${what}.</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#00695c;color:#fff;text-decoration:none;border-radius:4px">Choisir mon mot de passe</a></p>
    <p>Ce lien est valable 7 jours. Vous pourrez ensuite vous connecter avec votre e-mail (${escapeHtml(user.email)}) et ce mot de passe. Passé ce délai, utilisez « Mot de passe oublié » sur la page de connexion.</p>
    <p>À très vite,<br>L'équipe de MyCogniverse</p>`,
    undefined,
    // Sent on purpose by the team for this person, even during a pause
    { essential: true }
  );
};

// Body: { first_name, last_name, email, phone, birth_date, status, send_access }
export const createTutor = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { first_name, last_name } = req.body;
  const status = START_STATUSES.includes(req.body.status) ? req.body.status : null;
  try {
    if (!first_name?.trim() || !last_name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Prénom, nom et e-mail valides requis' });
    }
    if (!status) return res.status(400).json({ error: 'Choisissez le statut de départ' });
    const existing = await Users.findOne({
      where: { email },
      attributes: ['id', 'first_name', 'last_name', 'role', 'status'],
    });
    if (existing) {
      return res.status(409).json({
        error: 'Un compte existe déjà avec cet e-mail',
        user: existing,
      });
    }
    // Date only: noon, so that no time zone moves it to the day before
    const birth = /^\d{4}-\d{2}-\d{2}$/.test(req.body.birth_date || '')
      ? new Date(`${req.body.birth_date}T12:00:00Z`)
      : null;
    const tutor = await Users.create({
      email,
      password: null,
      first_name: formatName(first_name),
      last_name: formatName(last_name),
      phone: phoneOf(req.body.phone),
      birth_date: birth,
      role: 'volunteer',
      status,
      mission_id: 1,
      // Active once a pair is created
      is_active: false,
    });
    await recordStatusChange(tutor.id, null, status, me(req));
    if (status === 'Validé') await onMembershipChange(tutor.id, { justValidated: true });
    console.log(`Tutor ${tutor.id} created (${status}) by user ${me(req)}`);
    let accessSent = false;
    if (req.body.send_access) {
      try {
        await sendAccess(tutor);
        accessSent = true;
      } catch (err) {
        console.log('Access e-mail not sent:', err.message);
      }
    }
    res.status(201).json({ id: tutor.id, access_sent: accessSent });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Le tuteur n'a pas pu être créé" });
  }
};

// Access e-mail to a tutor who has not chosen a password yet
export const sendTutorAccess = async (req, res) => {
  try {
    const tutor = await Users.findOne({
      where: { id: req.params.id, role: 'volunteer' },
    });
    if (!tutor) return res.status(404).json({ error: 'Tuteur introuvable' });
    if (tutor.password !== null) {
      return res
        .status(409)
        .json({ error: 'Ce tuteur a déjà un mot de passe : « Mot de passe oublié » suffit' });
    }
    await sendAccess(tutor);
    res.json({ message: 'Accès envoyé' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'e-mail n'a pas pu être envoyé" });
  }
};
