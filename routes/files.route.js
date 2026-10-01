import express from 'express';
let router = express.Router();
import { upload, uploadConvention } from '../config/multer.js';

import {
  uploadFile,
  cancelFile,
  getFileUrl,
  adminListFiles,
  adminDeleteFile,
  adminMissingDocuments,
} from '../controllers/files.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { adminAuth, selfOrAdmin } from '../middlewares/authAdmin.js';
// import fileWorker from '../controllers/files.controllers.js';


router.post(
  '/upload/:userId',
  selfOrAdmin('userId'),
  upload.single('file'),
  uploadFile
);
router.post(
  '/upload/convention/:userId',
  selfOrAdmin('userId'),
  uploadConvention.single('file'),
  uploadFile
);

router.delete('/files/cancel/:fileId', verifyToken, cancelFile);

router.post('/files/url', verifyToken, getFileUrl);

// Admin documents page
router.get('/admin/files', adminAuth, adminListFiles);
router.delete('/admin/files/:id', adminAuth, adminDeleteFile);
router.get('/admin/missing-documents', adminAuth, adminMissingDocuments);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
