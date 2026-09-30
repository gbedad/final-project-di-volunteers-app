import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

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

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    req.user = user;
    next();
  });
}
