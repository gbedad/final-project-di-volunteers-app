import express from 'express';
import { adminAuth, cultureAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  list,
  show,
  create,
  update,
  remove,
  addRegistration,
  checkConflicts,
  tellRegistrationTutors,
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
  note,
  createExpense,
  changeExpense,
  removeExpense,
  uploadReceipt,
  receiptLink,
  refunds,
  refund,
  memberships,
  addMembership,
  removeMembership,
  askConsent,
  consentPdf,
  consentPage,
  signConsent,
} from '../controllers/activities.controllers.js';

const router = express.Router();

// Team: cultural activities (outings), apart from the tutoring
router.get('/admin/activites', cultureAuth, list);
router.post('/admin/activites', cultureAuth, create);
router.get('/admin/activites/:id', cultureAuth, show);
router.patch('/admin/activites/:id', cultureAuth, update);
router.delete('/admin/activites/:id', cultureAuth, remove);
router.post('/admin/activites/:id/inscriptions', cultureAuth, addRegistration);
// Tutoring sessions at the time of the outing (before registering), tutors told
router.get('/admin/activites/:id/conflits', cultureAuth, checkConflicts);
router.post('/admin/inscriptions-activites/:id/prevenir', cultureAuth, tellRegistrationTutors);
router.patch('/admin/inscriptions-activites/:id', cultureAuth, changeRegistration);
router.delete('/admin/inscriptions-activites/:id', cultureAuth, removeRegistration);
router.post('/admin/activites/:id/accompagnateurs', cultureAuth, addAdult);
router.delete('/admin/accompagnateurs/:id', cultureAuth, removeAdult);
router.post('/admin/accompagnateurs/:id/nouveau-lien', cultureAuth, renewAdultLink);
router.get('/admin/students/:id/activites', adminAuth, studentActivities);
// Students to register (minimal fields), and a student of the outings only
router.get('/admin/activites-eleves', cultureAuth, studentsForActivities);
router.post('/admin/activites-eleves', cultureAuth, createActivityStudent);

// Preparation notes
router.post('/admin/activites/:id/notes', cultureAuth, note);
// Expenses, receipts, refunds (marked refunded by a manager: the treasurer)
router.post('/admin/activites/:id/depenses', cultureAuth, createExpense);
router.patch('/admin/depenses/:id', cultureAuth, changeExpense);
router.delete('/admin/depenses/:id', cultureAuth, removeExpense);
router.post('/admin/depenses/:id/justificatif', cultureAuth, uploadReceipt);
router.get('/admin/depenses/:id/justificatif', cultureAuth, receiptLink);
router.get('/admin/remboursements', cultureAuth, refunds);
router.patch('/admin/depenses/:id/rembourse', managerAuth, refund);
// Yearly membership fee (recorded from an outing too)
router.get('/admin/students/:id/cotisations', cultureAuth, memberships);
router.post('/admin/students/:id/cotisations', cultureAuth, addMembership);
router.delete('/admin/cotisations/:id', managerAuth, removeMembership);
// Outing authorisation signed online by the parent
router.post('/admin/inscriptions-activites/:id/autorisation', cultureAuth, askConsent);
router.get('/admin/inscriptions-activites/:id/autorisation-pdf', cultureAuth, consentPdf);
router.get('/autorisation-sortie/:token', consentPage);
router.post('/autorisation-sortie/:token', signConsent);

// Adult going with the students: public, the key of the link is the access
router.get('/sortie/:token', attendance);
router.post('/sortie/:token', tick);

export default router;
