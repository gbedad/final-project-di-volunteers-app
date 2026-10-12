import db from '../config/database.js';
import Users from '../models/users.model.js';
import sendEmail from '../config/sendEmails.js';
import { getPause, setPause } from '../services/emailPause.js';

const fail = (res, err, msg) => {
  console.log(err);
  res.status(500).json({ error: msg });
};
const pending = async () => {
  const [[{ n }]] = await db.query(
    'select count(*)::int n from withheld_emails where sent_at is null and discarded_at is null',
    { logging: false }
  );
  return n;
};

// The whole team sees the banner
export const getEmailPause = async (req, res) => {
  try {
    res.json({ pause: await getPause({ fresh: true }), withheld: await pending() });
  } catch (err) {
    fail(res, err, 'Could not read the pause');
  }
};

// Superadmin. Body: { active, hours }
export const updateEmailPause = async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.userid, { attributes: ['id', 'first_name', 'last_name'] });
    const pause = await setPause({ active: !!req.body.active, hours: req.body.hours, user });
    res.json({ pause, withheld: await pending() });
  } catch (err) {
    fail(res, err, "La pause n'a pas pu être modifiée");
  }
};

export const listWithheld = async (req, res) => {
  try {
    const [rows] = await db.query(
      `select id, recipients, subject, html, created_at from withheld_emails
        where sent_at is null and discarded_at is null order by created_at desc limit 500`,
      { logging: false }
    );
    res.json(rows);
  } catch (err) {
    fail(res, err, 'Could not list the withheld e-mails');
  }
};

// Body: { ids, action: 'send' | 'discard' }
export const handleWithheld = async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'Aucun e-mail choisi' });
  try {
    if (req.body.action === 'discard') {
      await db.query('update withheld_emails set discarded_at = now() where id in (:ids) and sent_at is null', {
        replacements: { ids },
        logging: false,
      });
      return res.json({ discarded: ids.length, withheld: await pending() });
    }
    const [rows] = await db.query(
      'select id, recipients, subject, html from withheld_emails where id in (:ids) and sent_at is null and discarded_at is null',
      { replacements: { ids }, logging: false }
    );
    let sent = 0;
    for (const r of rows) {
      // Chosen by the team: sent even if the pause is still on
      await sendEmail(r.recipients, r.subject, r.html, undefined, { essential: true });
      await db.query('update withheld_emails set sent_at = now() where id = :id', { replacements: { id: r.id }, logging: false });
      sent += 1;
    }
    res.json({ sent, withheld: await pending() });
  } catch (err) {
    fail(res, err, "Les e-mails n'ont pas pu être traités");
  }
};
