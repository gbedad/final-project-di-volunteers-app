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
  listPairs,
  pairSessions,
  addSession,
  signIn,
  signSession,
  skipSignature,
  signatureUrl,
  deleteSession,
} from '../controllers/binomes.controllers.js';

const router = express.Router();

// Team: tutors who fit a student, pairs of a student, proposal and changes
router.get('/admin/students/:id/matches', adminAuth, getMatches);
router.get('/admin/students/:id/binomes', adminAuth, listStudentPairs);
router.post('/admin/binomes', managerAuth, proposePair);
router.patch('/admin/binomes/:id', managerAuth, updatePair);
// Follow-up: every pair with figures and alerts, reports of a pair
router.get('/admin/binomes', adminAuth, listPairs);
router.get('/admin/binomes/:id/seances', adminAuth, pairSessions);

// Tutor: their students, answer to a proposal
router.get('/my/binomes', verifyToken, myPairs);
router.post('/my/binomes/:id/answer', verifyToken, answerPair);
// Tutor: session reports (after each session, at least once a month)
router.post('/my/binomes/:id/seances', verifyToken, addSession);
// Attendance sheet: one tap, date and time set by the server
router.post('/my/binomes/:id/emargement', verifyToken, signIn);
router.delete('/seances/:id', verifyToken, deleteSession);
// Signature of the student at the end of the session (the tutor's phone)
router.post('/my/seances/:id/signature', verifyToken, signSession);
router.post('/my/seances/:id/no-signature', verifyToken, skipSignature);
router.get('/admin/seances/:id/signature', adminAuth, signatureUrl);

export default router;
