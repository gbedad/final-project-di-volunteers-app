import express from 'express';
import cors from 'cors';
import { upload } from '../config/multer.js';

import { adminAuth } from '../middlewares/authAdmin.js';

import {
  createMission,
  updateMission,
  getMissions,
  getAllMissions,
} from '../controllers/missions.controllers.js';

const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'],
  credentials: true,
};

const router = express.Router();

router.use(cors(corsOptions));

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
