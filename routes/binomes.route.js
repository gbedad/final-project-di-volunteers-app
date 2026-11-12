import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { adminAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  getMatches,
  listStudentPairs,
  proposePair,
  updatePair,
  updatePairDetails,
  confirmSession,
  myPairs,
  answerPair,
  listPairs,
  pairSessions,
  listSessionLog,
  addSession,
  signIn,
  signSession,
  skipSignature,
  signatureUrl,
  deleteSession,
} from '../controllers/binomes.controllers.js';
import {
  myAddBreak,
  myDeleteBreak,
  mySlotRequest,
  listBreaks,
  teamAddBreak,
  teamDeleteBreak,
} from '../controllers/pairBreaks.controllers.js';

const router = express.Router();

// Team: tutors who fit a student, pairs of a student, proposal and changes
router.get('/admin/students/:id/matches', adminAuth, getMatches);
router.get('/admin/students/:id/binomes', adminAuth, listStudentPairs);
router.post('/admin/binomes', managerAuth, proposePair);
router.patch('/admin/binomes/:id', managerAuth, updatePair);
// Slot, modality and place agreed for the pair
router.patch('/admin/binomes/:id/details', managerAuth, updatePairDetails);
// Session confirmed by the team (no sign-in: call, message…)
router.post('/admin/binomes/:id/seances', managerAuth, confirmSession);
// Follow-up: every pair with figures and alerts, reports of a pair
router.get('/admin/binomes', adminAuth, listPairs);
router.get('/admin/binomes/:id/seances', adminAuth, pairSessions);
// Sessions log of the team (recorded and expected sessions of a period)
router.get('/admin/seances', adminAuth, listSessionLog);

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
// "Pas de séance" said in advance (tutor or team), new slot told by the tutor
router.post('/my/binomes/:id/pas-de-seance', verifyToken, myAddBreak);
router.delete('/my/pas-de-seance/:id', verifyToken, myDeleteBreak);
router.post('/my/binomes/:id/creneau', verifyToken, mySlotRequest);
router.get('/admin/binomes/:id/pas-de-seance', adminAuth, listBreaks);
router.post('/admin/binomes/:id/pas-de-seance', managerAuth, teamAddBreak);
router.delete('/admin/pas-de-seance/:id', managerAuth, teamDeleteBreak);

export default router;
