import express from 'express';
let router = express.Router();
import cors from 'cors';
import { uploadStudentDocuments } from '../../config/multer.js';

import {
  uploadFile,
  cancelFile,
  presignedUrl_aws_s3,
} from '../../controllers/students_module/student-files.controllers.js';
import { prod_tt_sasportal } from 'googleapis/build/src/apis/prod_tt_sasportal/index.js';
// import fileWorker from '../controllers/files.controllers.js';

const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'],
  credentials: true,
};

router.use(cors(corsOptions));

router.post(
  '/students/upload/:studentId',
  uploadStudentDocuments.single('file'),
  uploadFile
);

router.delete(
  '/students/files/cancel/:fileId',
  uploadStudentDocuments.single('file'),
  cancelFile
);

router.post('/get-presigned-url', presignedUrl_aws_s3);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
