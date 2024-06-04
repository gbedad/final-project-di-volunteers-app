import express from 'express';
let router = express.Router();
import { upload, uploadConvention } from '../config/multer.js';

import {
  uploadFile,
  cancelFile,
  presignedUrl_aws_s3,
} from '../controllers/files.controllers.js';
import { prod_tt_sasportal } from 'googleapis/build/src/apis/prod_tt_sasportal/index.js';
// import fileWorker from '../controllers/files.controllers.js';

router.post('/upload/:userId', upload.single('file'), uploadFile);
router.post(
  '/upload/convention/:userId',
  uploadConvention.single('file'),
  uploadFile
);

router.delete('/files/cancel/:fileId', upload.single('file'), cancelFile);

router.post('/get-presigned-url', presignedUrl_aws_s3);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
