// Which activity ('benevolat' | 'payant') the current user may see or change.
// Free tutoring stays with the team (admins, interviewers); paid tutoring with
// the paid-tutoring managers. A superadmin sees both.
import { STAFF_ROLES, PAYANT_ROLES } from './authAdmin.js';
import { verifyToken } from './verifyToken.js';
import db from '../config/database.js';

export const ACTIVITES = ['benevolat', 'payant'];

export const activitesOf = (user) => {
  const role = user?.role;
  const list = [];
  if (role === 'superadmin') return [...ACTIVITES];
  if (STAFF_ROLES.includes(role)) list.push('benevolat');
  if (PAYANT_ROLES.includes(role)) list.push('payant');
  return list;
};

export const canSeeActivite = (user, activite) => activitesOf(user).includes(activite);

// Sequelize `where` fragment limiting a query to the activities the user sees
export const activiteWhere = (user) => ({ activite: activitesOf(user) });

// Route guard for the row named by a numeric id in the URL (students, binomes,
// seances). It checks the token itself, so it can sit in front of the route's
// own role check. A row of an activity the user does not see is refused as
// missing (404), so its existence is not revealed.
const TABLES = new Set(['students', 'binomes', 'seances']);
export const guardActivite = (table, param = 'id') => {
  if (!TABLES.has(table)) throw new Error(`Table non autorisée : ${table}`);
  return (req, res, next) =>
    verifyToken(req, res, async () => {
      const id = req.params[param];
      if (!/^\d+$/.test(String(id))) return next();
      try {
        const [[row]] = await db.query(`select activite from ${table} where id = :id`, {
          replacements: { id: Number(id) },
          logging: false,
        });
        if (!row || !canSeeActivite(req.user, row.activite)) {
          return res.status(404).json({ error: 'Introuvable' });
        }
        next();
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Vérification impossible' });
      }
    });
};
