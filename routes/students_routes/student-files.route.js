import express from 'express';
let router = express.Router();
import { uploadStudentDocuments } from '../../config/multer.js';

import {
  uploadFile,
  cancelFile,
  getFileUrl,
} from '../../controllers/students_module/student-files.controllers.js';
import { adminAuth } from '../../middlewares/authAdmin.js';
// import fileWorker from '../controllers/files.controllers.js';


router.post(
  '/students/upload/:studentId',
  adminAuth,
  uploadStudentDocuments.single('file'),
  uploadFile
);

router.delete(
  '/students/files/cancel/:fileId',
  adminAuth,
  cancelFile
);

router.post('/students/files/url', adminAuth, getFileUrl);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
