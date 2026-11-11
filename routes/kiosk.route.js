import express from 'express';
import { managerAuth } from '../middlewares/authAdmin.js';
import {
  createKiosk,
  kioskAuth,
  kioskNoSignature,
  kioskReport,
  kioskSignIn,
  kioskSignature,
  kioskToday,
  kioskVerify,
  listKiosks,
  revokeKiosk,
} from '../controllers/kiosk.controllers.js';

const router = express.Router();

// The team: tablets activated, created, deactivated
router.get('/admin/kiosks', managerAuth, listKiosks);
router.post('/admin/kiosks', managerAuth, createKiosk);
router.post('/admin/kiosks/:id/revoke', managerAuth, revokeKiosk);

// The tablet (no login: its own secret, then the tutor's code)
router.get('/kiosk/today', kioskAuth, kioskToday);
router.post('/kiosk/pairs/:id/verify', kioskAuth, kioskVerify);
router.post('/kiosk/pairs/:id/sign-in', kioskAuth, kioskSignIn);
router.post('/kiosk/seances/:id/signature', kioskAuth, kioskSignature);
router.post('/kiosk/seances/:id/no-signature', kioskAuth, kioskNoSignature);
router.post('/kiosk/seances/:id/report', kioskAuth, kioskReport);

export default router;
