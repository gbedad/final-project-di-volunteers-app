import express from 'express';
import { adminAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  discardZoomPending,
  listZoomPending,
  matchZoomPending,
  syncZoomNow,
  zoomWebhook,
} from '../controllers/zoom.controllers.js';

const router = express.Router();

// Body parsed in server.js (raw body kept for the signature)
router.post('/webhooks/zoom', zoomWebhook);

router.get('/admin/zoom/pending', adminAuth, listZoomPending);
router.post('/admin/zoom/pending/:id/match', managerAuth, matchZoomPending);
router.post('/admin/zoom/pending/:id/discard', managerAuth, discardZoomPending);
router.post('/admin/zoom/sync', managerAuth, syncZoomNow);

export default router;
