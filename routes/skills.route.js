import express from 'express';
import cors from 'cors';
import {
  createSkills,
  deleteSkill,
  updateSkills,
} from '../controllers/skills.controllers.js';

import { verifyToken } from '../middlewares/verifyToken.js';
const router = express.Router();
const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'],
  credentials: true,
};

router.use(cors(corsOptions));

router.post('/create-skill/:userId', updateSkills);
// router.put('/update-skills/:userId', verifyToken, updateSkills);
router.delete('/delete-skill/:userId', verifyToken, deleteSkill);

export default router;
