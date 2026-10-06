import express from 'express';
let router = express.Router();
import {
  upload,
  uploadConvention,
  uploadConventionTemplate,
} from '../config/multer.js';

import {
  uploadFile,
  cancelFile,
  getFileUrl,
  adminListFiles,
  adminDeleteFile,
  adminMissingDocuments,
  getApplication,
  submitApplication,
  getDocumentsStatus,
  updateDocumentsStatus,
  getConventionTemplate,
  uploadConventionTemplateDone,
} from '../controllers/files.controllers.js';
import { syncStatusAfter } from '../services/application.js';

// Recompute the application status after a successful upload/deletion
const syncFromParam = syncStatusAfter((req) => req.params.userId);
const syncFromFile = syncStatusAfter((req, res) => res.locals.userId);
import { verifyToken } from '../middlewares/verifyToken.js';
import { adminAuth, managerAuth, selfOrAdmin } from '../middlewares/authAdmin.js';
// import fileWorker from '../controllers/files.controllers.js';


router.post(
  '/upload/:userId',
  selfOrAdmin('userId'),
  syncFromParam,
  upload.single('file'),
  uploadFile
);
// ?type=final: convention countersigned by the president (team only)
const countersignedByTeam = (req, res, next) =>
  req.query.type === 'final' ? managerAuth(req, res, next) : next();
router.post(
  '/upload/convention/:userId',
  selfOrAdmin('userId'),
  countersignedByTeam,
  uploadConvention.single('file'),
  uploadFile
);

// Model of the convention: downloaded by volunteers, replaced by the team
router.get('/convention/template', verifyToken, getConventionTemplate);
router.post(
  '/admin/convention/template',
  managerAuth,
  uploadConventionTemplate.single('file'),
  uploadConventionTemplateDone
);

router.delete('/files/cancel/:fileId', verifyToken, syncFromFile, cancelFile);

router.post('/files/url', verifyToken, getFileUrl);

// Admin documents page
router.get('/admin/files', adminAuth, adminListFiles);
router.delete('/admin/files/:id', managerAuth, syncFromFile, adminDeleteFile);

// Admin: documents received (uploaded or on paper) and test Voltaire
router.get('/admin/users/:userId/documents', adminAuth, getDocumentsStatus);
router.patch('/admin/users/:userId/documents', adminAuth, updateDocumentsStatus);

// Volunteer application checklist and "Envoyer mon dossier"
router.get('/application/:userId', selfOrAdmin('userId'), getApplication);
router.post(
  '/application/:userId/submit',
  selfOrAdmin('userId'),
  submitApplication
);
router.get('/admin/missing-documents', adminAuth, adminMissingDocuments);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
