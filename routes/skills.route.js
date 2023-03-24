import express from 'express';

import { createSkills, deleteSkill, updateSkills} from '../controllers/skills.controllers.js';

import { verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

router.post('/create-skill/:userId', verifyToken, updateSkills);
// router.put('/update-skills/:userId', verifyToken, updateSkills);
router.delete('/delete-skill/:userId', verifyToken, deleteSkill)

export default router;