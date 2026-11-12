import express from 'express';
import { adminAuth, managerAuth } from '../middlewares/authAdmin.js';
import {
  list,
  preview,
  send,
  cancel,
  paper,
  pdfLink,
  page,
  parentPreview,
  sign,
  addressSearch,
  parentAddressSearch,
} from '../controllers/familyConvention.controllers.js';

const router = express.Router();

// Team: the student's family convention (sent at registration)
router.get('/admin/students/:id/conventions-famille', adminAuth, list);
router.post('/admin/students/:id/conventions-famille/apercu', managerAuth, preview);
router.post('/admin/students/:id/conventions-famille', managerAuth, send);
router.post('/admin/students/:id/conventions-famille/papier', managerAuth, paper);
router.post('/admin/conventions-famille/:cid/annuler', managerAuth, cancel);
router.get('/admin/conventions-famille/:cid/pdf', adminAuth, pdfLink);
// Address suggestions (national address base): team, and the parent signing
router.get('/admin/adresses', adminAuth, addressSearch);
router.get('/convention-famille/:token/adresses', parentAddressSearch);

// Parent: read, fill in and sign (public, the key of the link is the access)
router.get('/convention-famille/:token', page);
router.get('/convention-famille/:token/apercu', parentPreview);
router.post('/convention-famille/:token', sign);

export default router;
