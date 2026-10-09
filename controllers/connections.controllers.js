// "Connexions" page: who is connected now and when each person last came.
// Superadmin: the team and the volunteers, apart. Admin: the volunteers only.
import { Op } from 'sequelize';
import Users from '../models/users.model.js';

// Seen in the last 5 minutes = connected
export const ONLINE_MINUTES = 5;
const TEAM_ROLES = ['superadmin', 'admin', 'interviewer'];

const people = (where) =>
  Users.findAll({
    where,
    attributes: [
      'id',
      'first_name',
      'last_name',
      'email',
      'role',
      'status',
      'is_demo',
      'created_at',
      'last_login_at',
      'last_seen_at',
    ],
    order: [
      ['last_seen_at', 'DESC NULLS LAST'],
      ['last_name', 'ASC'],
    ],
  });

export const getConnections = async (req, res) => {
  try {
    const result = {
      online_minutes: ONLINE_MINUTES,
      volunteers: await people({ role: 'volunteer', status: { [Op.ne]: 'Archivé' } }),
    };
    if (req.user.role === 'superadmin') {
      result.team = await people({ role: { [Op.in]: TEAM_ROLES } });
    }
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list the connections' });
  }
};
