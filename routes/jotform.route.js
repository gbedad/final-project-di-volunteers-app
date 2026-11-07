import express from 'express';
import multer from 'multer';
import { adminAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  discardPending,
  jotformWebhook,
  listPending,
  matchPending,
  syncNow,
} from '../controllers/jotform.controllers.js';

const router = express.Router();

// Jotform posts multipart form data, without files
router.post('/webhooks/jotform/:secret', multer().none(), jotformWebhook);

router.get('/admin/jotform/pending', adminAuth, listPending);
router.post('/admin/jotform/pending/:id/match', managerAuth, matchPending);
router.post('/admin/jotform/pending/:id/discard', managerAuth, discardPending);
router.post('/admin/jotform/sync', managerAuth, syncNow);

export default router;
