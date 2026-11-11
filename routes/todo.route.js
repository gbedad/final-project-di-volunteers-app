import express from 'express';
import { adminAuth } from '../middlewares/authAdmin.js';
import { getTodo } from '../controllers/todo.controllers.js';
import { getControls } from '../controllers/controls.controllers.js';

const router = express.Router();
router.get('/admin/todo', adminAuth, getTodo);
// Inconsistencies in the data
router.get('/admin/controls', adminAuth, getControls);

export default router;
