import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';

dotenv.config();

// Activity is written at most every 2 minutes per person (one small update,
// not one per request); "connected" means seen in the last few minutes
const SEEN_EVERY = 2 * 60 * 1000;
const lastWrite = new Map();
const markSeen = (id) => {
  const now = Date.now();
  if (now - (lastWrite.get(id) || 0) < SEEN_EVERY) return;
  lastWrite.set(id, now);
  Users.update({ last_seen_at: new Date(now) }, { where: { id }, logging: false, silent: true }).catch(
    (err) => console.log('last_seen_at not saved:', err.message)
  );
};

// The database out of reach for a moment (network, DNS, pool busy): the
// lookup is tried again once before giving up
const DB_DOWN = /Connection|Timeout|ECONNRESET|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED/;
const isDbDown = (err) => DB_DOWN.test(`${err?.name} ${err?.parent?.code || ''} ${err?.message || ''}`);
const findUser = async (id) => {
  const read = () => Users.findByPk(id, { attributes: ['id', 'role', 'status'], logging: false });
  try {
    return await read();
  } catch (err) {
    if (!isDbDown(err)) throw err;
    await new Promise((r) => setTimeout(r, 300));
    return read();
  }
};

export function getAccessToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const [scheme, token] = header.split(' ');
    if (scheme && token && /^Bearer$/i.test(scheme)) {
      return token;
    }
  }

  const xAccessToken = req.headers['x-access-token'];
  if (typeof xAccessToken === 'string' && xAccessToken.length > 0) {
    return xAccessToken;
  }

  return null;
}

export function verifyToken(req, res, next) {
  const token = getAccessToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ message: 'Not authorized, token not available' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    try {
      // The role in the token may be outdated: always use the current one,
      // so that removing someone's rights takes effect immediately
      const current = await findUser(user.userid ?? user.userId);
      if (!current) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      // An archived volunteer's session stops working at once
      if (current.role === 'volunteer' && current.status === 'Archivé') {
        return res.status(403).json({ code: 'archived', message: 'Compte archivé' });
      }
      req.user = { ...user, userid: current.id, role: current.role };
      markSeen(current.id);
      next();
    } catch (error) {
      console.log('Authentication error:', error.name, error.parent?.code || error.message);
      // Database briefly unreachable: "try again", not a server bug
      if (isDbDown(error))
        return res.status(503).json({ message: 'Service momentanément indisponible, réessayez', error: 'Service momentanément indisponible, réessayez' });
      res.status(500).json({ message: 'Authentication error' });
    }
  });
}
