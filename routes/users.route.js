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
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { isAdmin } from '../middlewares/isAdmin.js';

const router = express.Router();

router.get('/', gotoHomePage);
router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);
router.get('/all-users', verifyToken, isAdmin, getUsers);
router.put('/update/:id', updateUser);
router.delete('/delete-registration/:id', deleteRegistration);
router.get('/user-by-id/:id', getUserById);
router.patch('/update-status/:id', updateById);
router.patch('/update-active-user/:id', setActiveUser);
router.post('/update-files-received/:id', updateReceivedFields);

export default router;
