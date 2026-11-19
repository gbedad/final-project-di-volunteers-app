// Who may change an outing: the managers and "superculture" all of them;
// "culture" only the outings it is in charge of (activities.owner_id).
// Reading stays open to every cultural role (programme, dates).
import db from '../config/database.js';
import { ALL_OUTINGS_ROLES } from './authAdmin.js';

const userIdOf = (req) => Number(req.user?.userid ?? req.user?.userId);
export const changesAllOutings = (req) => ALL_OUTINGS_ROLES.includes(req.user?.role);
export const canEditActivity = (req, activity) =>
  changesAllOutings(req) || (!!activity && Number(activity.owner_id ?? activity.created_by) === userIdOf(req));

// The outing an id of the route belongs to
const OWNER_SQL = {
  activity: 'select id, owner_id, created_by from activities where id = :id',
  registration:
    'select a.id, a.owner_id, a.created_by from activity_registrations r join activities a on a.id = r.activity_id where r.id = :id',
  // A child of the preparation or return session
  annex:
    'select a.id, a.owner_id, a.created_by from activity_session_participants p join activities a on a.id = p.activity_id where p.id = :id',
  staff: 'select a.id, a.owner_id, a.created_by from activity_staff s join activities a on a.id = s.activity_id where s.id = :id',
  expense: 'select a.id, a.owner_id, a.created_by from activity_expenses e join activities a on a.id = e.activity_id where e.id = :id',
};

// After cultureAuth: refused when the outing is in someone else's charge
export const activityEditor = (kind) => async (req, res, next) => {
  if (changesAllOutings(req)) return next();
  try {
    const [[a]] = await db.query(OWNER_SQL[kind], { replacements: { id: Number(req.params.id) }, logging: false });
    if (!a) return res.status(404).json({ error: 'Activité introuvable' });
    if (!canEditActivity(req, a))
      return res.status(403).json({ error: 'Cette sortie a été rédigée par quelqu’un d’autre : vous pouvez la consulter, pas la modifier.' });
    next();
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Vérification impossible' });
  }
};
