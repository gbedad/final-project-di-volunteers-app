import express from 'express'
let router = express.Router();
import upload from '../config/multer.js';
import { uploadFile } from '../controllers/files.controllers.js';
// import fileWorker from '../controllers/files.controllers.js';
 
router.post('/upload', upload.single("file"), uploadFile);
 
// router.get('/api/file/info', fileWorker.listAllFiles);
 
// router.get('/api/file/:id', fileWorker.downloadFile);
 
export default router;