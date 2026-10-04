import express from 'express';
import {
  createSkills,
  deleteSkill,
  updateSkills,
} from '../controllers/skills.controllers.js';

import { verifyToken } from '../middlewares/verifyToken.js';
import { syncStatusAfter } from '../services/application.js';
const router = express.Router();

router.post(
  '/create-skill/:userId',
  verifyToken,
  syncStatusAfter((req) => req.params.userId),
  updateSkills
);
router.delete('/delete-skill/:userId', verifyToken, deleteSkill);

export default router;
