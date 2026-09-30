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
  updateUserAvailability,
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { adminAuth } from '../middlewares/authAdmin.js';

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
router.put('/update/:id', verifyToken, updateUser);
router.delete('/delete-registration/:id', verifyToken, deleteRegistration);
router.get('/user-by-id/:id', verifyToken, getUserById);
router.patch('/update-status/:id', adminAuth, updateById);
router.patch('/update-active-user/:id', adminAuth, setActiveUser);
router.post('/update-files-received/:id', verifyToken, updateReceivedFields);
router.post('/add-activity', verifyToken, saveActivity);
router.post('/update-address', verifyToken, updateUserAddress);
router.post('/add-interviews/:userId', adminAuth, addUserInterviews);
router.post('/add-pre-interview/:userId', adminAuth, addUserPreInterview);
router.patch('/update-user-profile/:userId', verifyToken, updateUserProfile);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:id/:token', resetPasswordVerify);
router.post('/reset-password/:id/:token', renewPassword);
router.post('/add-internalthread/:userId', adminAuth, addUserInternalThread);
router.patch('/update-availability', verifyToken, updateUserAvailability);

export default router;
