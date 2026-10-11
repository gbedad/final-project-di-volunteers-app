import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middlewares/verifyToken.js';
import { managerAuth, selfOrAdmin } from '../middlewares/authAdmin.js';
import {
  countersignConvention,
  getCharte,
  getConventionSigning,
  getPresidentSignature,
  markCharteRead,
  previewConvention,
  savePresidentSignature,
  signConvention,
  updateConventionFields,
  uploadCharte,
  uploadTemplate,
} from '../controllers/conventionSigning.controllers.js';

const router = express.Router();
// Templates are checked before they replace the current ones
const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Charte: read by everyone signed in, replaced by the team
router.get('/convention/charte', verifyToken, getCharte);
router.post('/admin/convention/charte', managerAuth, memory.single('file'), uploadCharte);
// Model of the convention: form fields checked before replacing it
router.post('/admin/convention/template', managerAuth, memory.single('file'), uploadTemplate);

// The volunteer (or the team) sees the state and the preview
router.get('/users/:id/convention/signing', selfOrAdmin('id'), getConventionSigning);
router.get('/users/:id/convention/preview', selfOrAdmin('id'), previewConvention);
router.post('/users/:id/convention/charte-read', selfOrAdmin('id'), markCharteRead);
// Only the volunteer signs (checked in the handler)
router.post('/users/:id/convention/sign', selfOrAdmin('id'), signConvention);

// Team: end date and "autre" mission
router.patch('/admin/users/:id/convention-fields', managerAuth, updateConventionFields);
// President only (checked in the handlers)
router.get('/admin/president-signature', managerAuth, getPresidentSignature);
router.put('/admin/president-signature', managerAuth, savePresidentSignature);
router.post('/admin/users/:id/convention/countersign', managerAuth, countersignConvention);

export default router;
