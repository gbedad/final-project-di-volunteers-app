import express from 'express';
import { adminAuth, cultureAuth } from '../middlewares/authAdmin.js';
import {
  list,
  show,
  create,
  update,
  remove,
  addRegistration,
  changeRegistration,
  removeRegistration,
  addAdult,
  removeAdult,
  renewAdultLink,
  studentActivities,
  studentsForActivities,
  createActivityStudent,
  attendance,
  tick,
} from '../controllers/activities.controllers.js';

const router = express.Router();

// Team: cultural activities (outings), apart from the tutoring
router.get('/admin/activites', cultureAuth, list);
router.post('/admin/activites', cultureAuth, create);
router.get('/admin/activites/:id', cultureAuth, show);
router.patch('/admin/activites/:id', cultureAuth, update);
router.delete('/admin/activites/:id', cultureAuth, remove);
router.post('/admin/activites/:id/inscriptions', cultureAuth, addRegistration);
router.patch('/admin/inscriptions-activites/:id', cultureAuth, changeRegistration);
router.delete('/admin/inscriptions-activites/:id', cultureAuth, removeRegistration);
router.post('/admin/activites/:id/accompagnateurs', cultureAuth, addAdult);
router.delete('/admin/accompagnateurs/:id', cultureAuth, removeAdult);
router.post('/admin/accompagnateurs/:id/nouveau-lien', cultureAuth, renewAdultLink);
router.get('/admin/students/:id/activites', adminAuth, studentActivities);
// Students to register (minimal fields), and a student of the outings only
router.get('/admin/activites-eleves', cultureAuth, studentsForActivities);
router.post('/admin/activites-eleves', cultureAuth, createActivityStudent);

// Adult going with the students: public, the key of the link is the access
router.get('/sortie/:token', attendance);
router.post('/sortie/:token', tick);

export default router;
