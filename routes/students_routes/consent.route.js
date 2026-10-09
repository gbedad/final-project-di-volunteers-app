import express from 'express';
import { adminAuth, managerAuth } from '../../middlewares/authAdmin.js';
import {
  cancelConsent,
  getConsentPage,
  listConsents,
  requestConsent,
  revokeConsent,
  signConsent,
} from '../../controllers/students_module/consent.controllers.js';

const router = express.Router();

// Team
router.get('/admin/students/:id/consents', adminAuth, listConsents);
router.post('/admin/students/:id/consents', managerAuth, requestConsent);
router.post('/admin/students/:id/consents/:consentId/cancel', managerAuth, cancelConsent);
router.post('/admin/students/:id/consents/:consentId/revoke', managerAuth, revokeConsent);

// Parent: public, the key of the link is the access (body parsed in
// server.js with a larger limit for the signature image)
router.get('/consentement/:token', getConsentPage);
router.post('/consentement/:token', signConsent);

export default router;
