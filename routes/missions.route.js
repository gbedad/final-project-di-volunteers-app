import express from 'express';
import { upload } from '../config/multer.js';

import { adminAuth } from '../middlewares/authAdmin.js';

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
router.post(
  '/missions/create',
  adminAuth,
  upload.single('image'),
  createMission
);
router.patch(
  '/missions/update/:id',
  adminAuth,
  upload.single('image'),
  updateMission
);

export default router;
