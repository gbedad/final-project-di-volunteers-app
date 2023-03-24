import express from 'express';
import {
  gotoHomePage,
  register,
  login,
  getUsers,
  deleteRegistration,
  updateUser,
  logout, updateById, getUserById
} from '../controllers/users.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import {validateUserRole} from '../middlewares/validateUserRole.js'
import {isAdmin} from '../middlewares/isAdmin.js'
 
const router = express.Router();

router.get('/', gotoHomePage);
router.post('/register', register);
router.post('/login', login);
router.get('/logout', verifyToken, logout)
router.post('/all-users',verifyToken, getUsers);
router.put('/update/:id', verifyToken, updateUser)
router.delete('/delete-registration/:id', verifyToken, deleteRegistration);
router.get('/user-by-id/:id', verifyToken,getUserById)
router.patch('/update-status/:id', verifyToken, updateById);

export default router;
