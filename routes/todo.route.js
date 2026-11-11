import express from 'express';
import { adminAuth } from '../middlewares/authAdmin.js';
import { getTodo } from '../controllers/todo.controllers.js';

const router = express.Router();
router.get('/admin/todo', adminAuth, getTodo);

export default router;
