import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { adminAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  getMatches,
  listStudentPairs,
  proposePair,
  updatePair,
  myPairs,
  answerPair,
} from '../controllers/binomes.controllers.js';

const router = express.Router();

// Team: tutors who fit a student, pairs of a student, proposal and changes
router.get('/admin/students/:id/matches', adminAuth, getMatches);
router.get('/admin/students/:id/binomes', adminAuth, listStudentPairs);
router.post('/admin/binomes', managerAuth, proposePair);
router.patch('/admin/binomes/:id', managerAuth, updatePair);

// Tutor: their students, answer to a proposal
router.get('/my/binomes', verifyToken, myPairs);
router.post('/my/binomes/:id/answer', verifyToken, answerPair);

export default router;
