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
