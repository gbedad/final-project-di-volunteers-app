import express from 'express';
import { upload } from '../config/multer.js';

import { verifyToken } from '../middlewares/verifyToken.js';
import { isAdmin } from '../middlewares/isAdmin.js';
import { adminAuth, userAuth } from '../middlewares/authAdmin.js';

import {
  createMission,
  updateMission,
  getMissions,
  getAllMissions,
} from '../controllers/missions.controllers.js';

const router = express.Router();

// Route for creating a new mission
router.get('/all-missions', adminAuth, getAllMissions);
router.get('/missions', getMissions);
router.post('/missions/create', upload.single('image'), createMission);
router.patch('/missions/update/:id', upload.single('image'), updateMission);

export default router;
