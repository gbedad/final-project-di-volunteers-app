import express from 'express';
let router = express.Router();
import upload from '../config/multer.js';

import { uploadFile, cancelFile } from '../controllers/files.controllers.js';
// import fileWorker from '../controllers/files.controllers.js';

router.post('/upload/:userId', upload.single('file'), uploadFile);

router.delete('/files/cancel/:fileId', upload.single('file'), cancelFile);
// router.post('/upload', upload.any(), uploadFile);

// router.get('/api/file/info', fileWorker.listAllFiles);

// router.get('/api/file/:id', fileWorker.downloadFile);

export default router;
