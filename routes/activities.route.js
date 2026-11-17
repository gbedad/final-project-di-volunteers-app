import express from 'express';
import { adminAuth, cultureAuth, managerAuth } from '../middlewares/authAdmin.js';
import { activityEditor } from '../middlewares/activityAccess.js';
import {
  list,
  owners,
  chat,
  postChat,
  deleteChat,
  organizers,
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
  editAdult,
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
  paperConsent,
  consentPage,
  signConsent,
} from '../controllers/activities.controllers.js';

const router = express.Router();

// Team: cultural activities (outings), apart from the tutoring. Changes:
// "culture" only on the outings it is in charge of (activityEditor)
router.get('/admin/activites', cultureAuth, list);
// People who can be in charge of an outing
router.get('/admin/activites-responsables', cultureAuth, owners);
// Names the organiser of an outing is chosen from
router.get('/admin/activites-organisateurs', cultureAuth, organizers);
router.post('/admin/activites', cultureAuth, create);
router.get('/admin/activites/:id', cultureAuth, show);
router.patch('/admin/activites/:id', cultureAuth, activityEditor('activity'), update);
router.delete('/admin/activites/:id', cultureAuth, activityEditor('activity'), remove);
router.post('/admin/activites/:id/inscriptions', cultureAuth, activityEditor('activity'), addRegistration);
// Tutoring sessions at the time of the outing (before registering), tutors told
router.get('/admin/activites/:id/conflits', cultureAuth, checkConflicts);
// Telling the tutor (session cancelled): the admins only
router.post('/admin/inscriptions-activites/:id/prevenir', managerAuth, tellRegistrationTutors);
router.patch('/admin/inscriptions-activites/:id', cultureAuth, activityEditor('registration'), changeRegistration);
router.delete('/admin/inscriptions-activites/:id', cultureAuth, activityEditor('registration'), removeRegistration);
router.post('/admin/activites/:id/accompagnateurs', cultureAuth, activityEditor('activity'), addAdult);
router.patch('/admin/accompagnateurs/:id', cultureAuth, activityEditor('staff'), editAdult);
router.delete('/admin/accompagnateurs/:id', cultureAuth, activityEditor('staff'), removeAdult);
router.post('/admin/accompagnateurs/:id/nouveau-lien', cultureAuth, activityEditor('staff'), renewAdultLink);
router.get('/admin/students/:id/activites', adminAuth, studentActivities);
// Students to register (minimal fields), and a student of the outings only
router.get('/admin/activites-eleves', cultureAuth, studentsForActivities);
router.post('/admin/activites-eleves', cultureAuth, createActivityStudent);

// Chat of the outing: read and written by everyone who sees it
router.get('/admin/activites/:id/chat', cultureAuth, chat);
router.post('/admin/activites/:id/chat', cultureAuth, postChat);
// The author deletes their own message (body: { at })
router.delete('/admin/activites/:id/chat', cultureAuth, deleteChat);
// Preparation notes
router.post('/admin/activites/:id/notes', cultureAuth, activityEditor('activity'), note);
// Expenses, receipts, refunds (marked refunded by a manager: the treasurer)
router.post('/admin/activites/:id/depenses', cultureAuth, activityEditor('activity'), createExpense);
router.patch('/admin/depenses/:id', cultureAuth, activityEditor('expense'), changeExpense);
router.delete('/admin/depenses/:id', cultureAuth, activityEditor('expense'), removeExpense);
router.post('/admin/depenses/:id/justificatif', cultureAuth, activityEditor('expense'), uploadReceipt);
router.get('/admin/depenses/:id/justificatif', cultureAuth, receiptLink);
router.get('/admin/remboursements', cultureAuth, refunds);
router.patch('/admin/depenses/:id/rembourse', managerAuth, refund);
// Yearly membership fee (recorded from an outing too)
router.get('/admin/students/:id/cotisations', cultureAuth, memberships);
router.post('/admin/students/:id/cotisations', cultureAuth, addMembership);
router.delete('/admin/cotisations/:id', managerAuth, removeMembership);
// Outing authorisation signed online by the parent
router.post('/admin/inscriptions-activites/:id/autorisation', cultureAuth, activityEditor('registration'), askConsent);
router.get('/admin/inscriptions-activites/:id/autorisation-pdf', cultureAuth, consentPdf);
// Authorisation received on paper: its scan
router.post('/admin/inscriptions-activites/:id/autorisation-papier', cultureAuth, activityEditor('registration'), paperConsent);
router.get('/autorisation-sortie/:token', consentPage);
router.post('/autorisation-sortie/:token', signConsent);

// Adult going with the students: public, the key of the link is the access
router.get('/sortie/:token', attendance);
router.post('/sortie/:token', tick);

export default router;
