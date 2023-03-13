import express from 'express';
import {
  gotoHomePage,
  register,
  login,
  getUsers,
  deleteRegistration,
  updateUser,
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

router.get('/', gotoHomePage);
router.post('/register', register);
router.post('/login', login);
router.post('/all-users', verifyToken, getUsers);
router.put('/update/:id', verifyToken, updateUser)
router.delete('/delete-registration/:id', verifyToken, deleteRegistration);

export default router;
