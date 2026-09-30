import express from 'express';
let router = express.Router();
import cors from 'cors';
import { upload, uploadConvention } from '../config/multer.js';

import {
  uploadFile,
  cancelFile,
  presignedUrl_aws_s3,
} from '../controllers/files.controllers.js';
import { verifyToken } from '../middlewares/verifyToken.js';
// import fileWorker from '../controllers/files.controllers.js';

const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'],
  credentials: true,
};

router.use(cors(corsOptions));

router.post(
  '/upload/:userId',
  verifyToken,
  upload.single('file'),
  uploadFile
);
router.post(
  '/upload/convention/:userId',
  verifyToken,
  uploadConvention.single('file'),
  uploadFile
);

router.delete('/files/cancel/:fileId', verifyToken, cancelFile);

router.post('/get-presigned-url', verifyToken, presignedUrl_aws_s3);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
