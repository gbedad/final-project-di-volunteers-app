import express from 'express';
import { managerAuth } from '../middlewares/authAdmin.js';
import { account, pay, unpay, deposit, journal, collect, depositList } from '../controllers/accounting.controllers.js';

const router = express.Router();

// Bookkeeping of the families' payments (admins)
router.get('/admin/students/:id/compte', managerAuth, account);
router.post('/admin/students/:id/paiements', managerAuth, pay);
router.delete('/admin/paiements/:id', managerAuth, unpay);
router.patch('/admin/lignes-paiement/:id/caution', managerAuth, deposit);
router.get('/admin/encaissements', managerAuth, journal);
router.get('/admin/encaissements/a-encaisser', managerAuth, collect);
router.get('/admin/encaissements/cautions', managerAuth, depositList);

export default router;
