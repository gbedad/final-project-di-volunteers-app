import express from 'express';
import {
  createSkills,
  deleteSkill,
  updateSkills,
} from '../controllers/skills.controllers.js';

import { selfOrAdmin } from '../middlewares/authAdmin.js';
import { syncStatusAfter } from '../services/application.js';
const router = express.Router();

router.post(
  '/create-skill/:userId',
  selfOrAdmin('userId'),
  syncStatusAfter((req) => req.params.userId),
  updateSkills
);
router.delete('/delete-skill/:userId', selfOrAdmin('userId'), deleteSkill);

export default router;
