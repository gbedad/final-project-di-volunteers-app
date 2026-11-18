import express from 'express';
import { managerAuth } from '../middlewares/authAdmin.js';
import {
  deleteVideo,
  knownTutorial,
  list,
  one,
  receiveVideo,
  sendVideo,
} from '../controllers/tutorials.controllers.js';

const router = express.Router();

// Public: the link of a tutorial is sent to the tutors (no sign-in needed)
router.get('/tutorials', list);
router.get('/tutorials/:slug', one);
// Managers: send, replace or remove the video of a tutorial
router.post('/admin/tutorials/:slug/video', managerAuth, knownTutorial, receiveVideo, sendVideo);
router.delete('/admin/tutorials/:slug/video', managerAuth, knownTutorial, deleteVideo);

export default router;
