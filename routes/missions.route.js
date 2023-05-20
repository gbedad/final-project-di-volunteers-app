import express from 'express';
import { createMission, updateMission, getMissions} from '../controllers/missions.controllers.js';


const router = express.Router();

// Route for creating a new mission
router.get('/missions', getMissions);
router.post('/missions/create', createMission);
router.put('/missions/update', updateMission);

export default router;