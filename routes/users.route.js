import express from 'express';
import {
  gotoHomePage,
  register,
  login,
  getUsers,
  deleteRegistration,
  updateUser,
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
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import {
  adminAuth,
  managerAuth,
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
router.put('/update/:id', verifyToken, updateUser);
router.delete('/delete-registration/:id', selfOrManager('id'), deleteRegistration);
router.get('/user-by-id/:id', verifyToken, getUserById);
router.patch('/update-status/:id', adminAuth, updateById);
router.patch('/update-active-user/:id', adminAuth, setActiveUser);
router.post('/add-activity', verifyToken, syncFromBody, saveActivity);
router.post('/update-address', verifyToken, syncFromBody, updateUserAddress);
router.post('/add-interviews/:userId', adminAuth, addUserInterviews);
router.post('/add-pre-interview/:userId', adminAuth, addUserPreInterview);
router.patch(
  '/update-user-profile/:userId',
  verifyToken,
  syncStatusAfter((req) => req.params.userId),
  updateUserProfile
);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:id/:token', resetPasswordVerify);
router.post('/reset-password/:id/:token', renewPassword);
router.patch('/update-availability', verifyToken, updateUserAvailability);

// Cohorts of a volunteer (academic years)
router.get('/admin/users/:userId/cohorts', adminAuth, getCohorts);
router.put('/admin/users/:userId/cohorts', adminAuth, updateCohorts);

// Internal team discussion about a volunteer
router.get('/admin/thread/unread', adminAuth, getUnreadCounts);
router.get('/admin/users/:userId/thread', adminAuth, getThread);
router.post('/admin/users/:userId/thread', adminAuth, addMessage);
router.delete('/admin/thread/:messageId', adminAuth, deleteMessage);

// Team page: superadmins manage every role, admins name interviewers
router.get('/admin/team', managerAuth, getTeam);
router.get('/admin/users/lookup', managerAuth, findUserByEmail);
router.patch('/admin/users/:id/role', managerAuth, updateUserRole);
router.post('/admin/team/invite', managerAuth, inviteMember);
router.post('/admin/team/:id/resend-invite', managerAuth, resendInvitation);

export default router;
