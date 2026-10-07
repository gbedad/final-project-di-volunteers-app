import express from 'express';
import {
  gotoHomePage,
  register,
  login,
  getUsers,
  deleteRegistration,
  logout,
  updateById,
  getUserById,
  setActiveUser,
  saveActivity,
  updateUserAddress,
  addUserInterviews,
  addUserPreInterview,
  updateUserProfile,
  forgotPassword,
  resetPasswordVerify,
  renewPassword,
  checkToken,
  refreshTokenFunc,
  updateUserAvailability,
  bulkUpdateUsers,
  setUnavailableUntil,
} from '../controllers/users.controllers.js';
import {
  adminAuth,
  managerAuth,
  selfOrAdmin,
  selfOrAdminBody,
  selfOrManager,
} from '../middlewares/authAdmin.js';
import {
  getTeam,
  findUserByEmail,
  updateUserRole,
  inviteMember,
  resendInvitation,
} from '../controllers/team.controllers.js';
import { syncStatusAfter } from '../services/application.js';
import {
  getCohorts,
  updateCohorts,
} from '../controllers/cohorts.controllers.js';
import {
  archive,
  unarchive,
  archiveMany,
} from '../controllers/archive.controllers.js';
import {
  getAnalytics,
  getStudentAnalytics,
} from '../controllers/analytics.controllers.js';
import {
  getThread,
  addMessage,
  deleteMessage,
  getUnreadCounts,
} from '../controllers/thread.controllers.js';

// Recompute the application status after profile changes
const syncFromBody = syncStatusAfter((req) => req.body.userId);

const router = express.Router();

router.get('/', gotoHomePage);
router.post('/register', register);
router.post('/login', login);
router.get('/check-token', checkToken);
router.post('/refresh-token', refreshTokenFunc);
router.get('/logout', logout);
router.get('/all-users', adminAuth, getUsers);
router.delete(
  '/delete-registration/:id',
  selfOrManager('id'),
  deleteRegistration
);
router.get('/user-by-id/:id', selfOrAdmin('id'), getUserById);
router.patch('/update-status/:id', adminAuth, updateById);
router.patch('/update-active-user/:id', adminAuth, setActiveUser);
// Dashboard: change the status / active flag of several volunteers
router.patch('/admin/users/bulk', managerAuth, bulkUpdateUsers);
// Former volunteers: archived (account kept, no login), or back
router.post('/admin/users/bulk-archive', managerAuth, archiveMany);
router.post('/admin/users/:id/archive', managerAuth, archive);
router.post('/admin/users/:id/unarchive', managerAuth, unarchive);
router.post('/add-activity', selfOrAdminBody(), syncFromBody, saveActivity);
router.post(
  '/update-address',
  selfOrAdminBody(),
  syncFromBody,
  updateUserAddress
);
router.post('/add-interviews/:userId', adminAuth, addUserInterviews);
router.post('/add-pre-interview/:userId', adminAuth, addUserPreInterview);
router.patch(
  '/update-user-profile/:userId',
  selfOrAdmin('userId'),
  syncStatusAfter((req) => req.params.userId),
  updateUserProfile
);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:id/:token', resetPasswordVerify);
router.post('/reset-password/:id/:token', renewPassword);
router.patch('/update-availability', selfOrAdminBody(), updateUserAvailability);
// Not available for a new student until a date (tutor or team)
router.patch('/users/:id/unavailable', selfOrAdmin('id'), setUnavailableUntil);

// Cohorts of a volunteer (academic years)
router.get('/admin/users/:userId/cohorts', adminAuth, getCohorts);
router.put('/admin/users/:userId/cohorts', adminAuth, updateCohorts);

// Internal discussion between admins about a volunteer; interviewers can
// only log a WhatsApp contact (checked in addMessage)
router.get('/admin/thread/unread', managerAuth, getUnreadCounts);
router.get('/admin/users/:userId/thread', managerAuth, getThread);
router.post('/admin/users/:userId/thread', adminAuth, addMessage);
router.delete('/admin/thread/:messageId', managerAuth, deleteMessage);

// Admin "Analyse" page
router.get('/admin/analytics', managerAuth, getAnalytics);
router.get('/admin/analytics/students', managerAuth, getStudentAnalytics);

// Team page: superadmins manage every role, admins name interviewers
router.get('/admin/team', managerAuth, getTeam);
router.get('/admin/users/lookup', managerAuth, findUserByEmail);
router.patch('/admin/users/:id/role', managerAuth, updateUserRole);
router.post('/admin/team/invite', managerAuth, inviteMember);
router.post('/admin/team/:id/resend-invite', managerAuth, resendInvitation);

export default router;
