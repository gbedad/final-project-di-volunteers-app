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
  updateReceivedFields,
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
  addUserInternalThread,
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { isAdmin } from '../middlewares/isAdmin.js';
import { adminAuth, userAuth } from '../middlewares/authAdmin.js';

import cors from 'cors';
const router = express.Router();
const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'],
  credentials: true,
};

router.use(cors(corsOptions));

router.get('/', gotoHomePage);
router.post('/register', register);
router.post('/login', login);
router.get('/check-token', checkToken);
router.post('/refresh-token', refreshTokenFunc);
router.get('/logout', logout);
router.get('/all-users', adminAuth, getUsers);
// router.get('/user-by-id', getUserById);
router.put('/update/:id', updateUser);
router.delete('/delete-registration/:id', deleteRegistration);
router.get('/user-by-id/:id', getUserById);
router.patch('/update-status/:id', updateById);
router.patch('/update-active-user/:id', setActiveUser);
router.post('/update-files-received/:id', updateReceivedFields);
router.post('/add-activity', saveActivity);
router.post('/update-address', updateUserAddress);
router.post('/add-interviews/:userId', addUserInterviews);
router.post('/add-internalthread/:userId', addUserInternalThread);
router.post('/add-pre-interview/:userId', addUserPreInterview);
router.patch('/update-user-profile/:userId', updateUserProfile);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:id/:token', resetPasswordVerify);
router.post('/reset-password/:id/:token', renewPassword);

export default router;
