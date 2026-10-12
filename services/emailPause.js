// Pause of the e-mails to the volunteers (while the team cleans the data):
// an e-mail to a volunteer is kept in withheld_emails instead of being sent.
// E-mails to the team and to parents, and "essential" ones (password reset),
// always go.
import { Op } from 'sequelize';
import db from '../config/database.js';
import Users from '../models/users.model.js';

const KEY = 'volunteer_email_pause';
let cache = { at: 0, value: null };

// { active, since, until, by, by_name } or null; ends by itself at "until"
export const getPause = async ({ fresh = false } = {}) => {
  if (!fresh && Date.now() - cache.at < 20000) return cache.value;
  const [[row]] = await db.query('select value from app_settings where key = :k', {
    replacements: { k: KEY },
    logging: false,
  });
  let value = row?.value || null;
  if (value?.active && value.until && new Date(value.until) < new Date()) value = null;
  cache = { at: Date.now(), value: value?.active ? value : null };
  return cache.value;
};

export const setPause = async ({ active, hours = 24, user }) => {
  const now = new Date();
  const value = active
    ? {
        active: true,
        since: now.toISOString(),
        until: new Date(now.getTime() + Math.min(Math.max(Number(hours) || 24, 1), 24 * 14) * 3600000).toISOString(),
        by: user?.id || null,
        by_name: user ? `${user.first_name} ${user.last_name}`.trim() : null,
      }
    : { active: false };
  await db.query(
    `insert into app_settings (key, value, updated_at, updated_by) values (:k, :v, now(), :u)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    { replacements: { k: KEY, v: JSON.stringify(value), u: user?.id || null }, logging: false }
  );
  cache = { at: 0, value: null };
  return getPause({ fresh: true });
};

const list = (receivers) =>
  (Array.isArray(receivers) ? receivers : String(receivers || '').split(','))
    .map((r) => String(r).trim())
    .filter(Boolean);

// Splits the recipients: { send: [...], withheld: [...] }
export const splitRecipients = async (receivers) => {
  const all = list(receivers);
  if (!all.length || !(await getPause())) return { send: all, withheld: [] };
  const lower = all.map((r) => r.toLowerCase());
  const volunteers = await Users.findAll({
    where: {
      role: 'volunteer',
      [Op.or]: [
        db.where(db.fn('lower', db.col('email')), { [Op.in]: lower }),
        db.where(db.fn('lower', db.col('email2')), { [Op.in]: lower }),
      ],
    },
    attributes: ['email', 'email2'],
    raw: true,
  });
  const theirs = new Set(
    volunteers.flatMap((v) => [v.email, v.email2]).filter(Boolean).map((e) => e.toLowerCase())
  );
  return {
    send: all.filter((r) => !theirs.has(r.toLowerCase())),
    withheld: all.filter((r) => theirs.has(r.toLowerCase())),
  };
};

export const withhold = (recipients, subject, html) =>
  db.query('insert into withheld_emails (recipients, subject, html) values (:r, :s, :h)', {
    replacements: { r: recipients.join(', '), s: subject, h: html },
    logging: false,
  });
