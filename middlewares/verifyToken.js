import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';

dotenv.config();

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
      const current = await Users.findByPk(user.userid ?? user.userId, {
        attributes: ['id', 'role', 'status'],
      });
      if (!current) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      // An archived volunteer's session stops working at once
      if (current.role === 'volunteer' && current.status === 'Archivé') {
        return res.status(403).json({ code: 'archived', message: 'Compte archivé' });
      }
      req.user = { ...user, userid: current.id, role: current.role };
      next();
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Authentication error' });
    }
  });
}
