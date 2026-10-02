import { verifyToken } from './verifyToken.js';

// Staff: everyone working on applications (interviewers included)
export const STAFF_ROLES = ['superadmin', 'admin', 'interviewer'];
// Managers: can also edit missions, delete documents, name interviewers
export const MANAGER_ROLES = ['superadmin', 'admin'];

const hasAdminAccess = (user) => !!user && STAFF_ROLES.includes(user.role);

const requireRoles = (roles) => (req, res, next) => {
  verifyToken(req, res, () => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  });
};

export const adminAuth = requireRoles(STAFF_ROLES);
export const managerAuth = requireRoles(MANAGER_ROLES);

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

// The account owner, or an admin/superadmin (e.g. deleting an account)
export const selfOrManager = (param) => (req, res, next) => {
  verifyToken(req, res, () => {
    const ownId = Number(req.user?.userid ?? req.user?.userId);
    if (
      !MANAGER_ROLES.includes(req.user?.role) &&
      ownId !== Number(req.params[param])
    ) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  });
};
