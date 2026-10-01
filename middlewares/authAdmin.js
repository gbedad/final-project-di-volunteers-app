import { verifyToken } from './verifyToken.js';

const hasAdminAccess = (user) =>
  user && (user.role === 'admin' || user.role === 'interviewer');

export const adminAuth = (req, res, next) => {
  verifyToken(req, res, () => {
    if (!hasAdminAccess(req.user)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  });
};

export const userAuth = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user?.role !== 'volunteer') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  });
};

// Admins, or the volunteer whose id is in the URL (e.g. /upload/:userId)
export const selfOrAdmin = (param) => (req, res, next) => {
  verifyToken(req, res, () => {
    const user = req.user;
    const ownId = Number(user?.userid ?? user?.userId);
    if (!hasAdminAccess(user) && ownId !== Number(req.params[param])) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  });
};
