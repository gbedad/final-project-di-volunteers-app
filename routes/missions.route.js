import express from 'express';
import upload from '../config/multer.js';

import {
  createMission,
  updateMission,
  getMissions,
} from '../controllers/missions.controllers.js';

const router = express.Router();

// Route for creating a new mission
router.get('/missions', getMissions);
router.post('/missions/create', upload.single('image'), createMission);
router.put('/missions/update', updateMission);

export default router;
