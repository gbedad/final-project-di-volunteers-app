// Paid tutoring: payers, invoices, credit notes and payments. Reserved to
// the paid-tutoring managers (payantAuth), see services/invoicing.js.
import express from 'express';
import { payantAuth } from '../middlewares/authAdmin.js';
import {
  issueInvoice,
  cancelInvoice,
  recordPayment,
  listInvoices,
  listPayeurs,
  createPayeur,
} from '../services/invoicing.js';
import { searchSchools } from '../controllers/students_module/admin-students.controllers.js';
import {
  listPaidStudents,
  createPaidStudent,
  updatePaidStudent,
  listPaidPairs,
  listTutorsForPaid,
  createPaidPair,
  updatePaidPair,
} from '../services/paidTutoring.js';

const router = express.Router();

// Turn a service error (validation, missing row) into a 400, anything else
// into a 500
const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    const known = /obligatoire|invalide|introuvable|dépasse|annulée|déjà|positif|Choisissez|Élève|Tuteur|Binôme/.test(
      err.message
    );
    if (!known) console.log(err);
    const status = !known ? 500 : /introuvable/.test(err.message) ? 404 : 400;
    res.status(status).json({ error: known ? err.message : 'Erreur serveur' });
  }
};

router.get('/payant/payeurs', payantAuth, handle(() => listPayeurs()));
router.post('/payant/payeurs', payantAuth, handle((req) => createPayeur(req.body || {})));

router.get('/payant/factures', payantAuth, handle(() => listInvoices()));
router.post('/payant/factures', payantAuth, handle((req) => issueInvoice(req.body || {})));
router.post(
  '/payant/factures/:id/avoir',
  payantAuth,
  handle((req) => cancelInvoice({ facture_id: Number(req.params.id), issued_on: req.body?.issued_on }))
);
router.post(
  '/payant/factures/:id/paiements',
  payantAuth,
  handle((req) =>
    recordPayment({ ...(req.body || {}), facture_id: Number(req.params.id) })
  )
);

// Students and pairs of paid tutoring (activite 'payant')
// Establishment search, same directory as the free tutoring (read only)
router.get('/payant/schools', payantAuth, searchSchools);
router.get('/payant/eleves', payantAuth, handle(() => listPaidStudents()));
router.post('/payant/eleves', payantAuth, handle((req) => createPaidStudent(req.body || {})));
router.patch(
  '/payant/eleves/:id',
  payantAuth,
  handle((req) => updatePaidStudent(Number(req.params.id), req.body || {}))
);
router.get('/payant/tuteurs', payantAuth, handle(() => listTutorsForPaid()));
router.get('/payant/binomes', payantAuth, handle(() => listPaidPairs()));
router.post(
  '/payant/binomes',
  payantAuth,
  handle((req) => createPaidPair({ ...(req.body || {}), proposed_by: req.user?.userid }))
);
router.patch(
  '/payant/binomes/:id',
  payantAuth,
  handle((req) => updatePaidPair(Number(req.params.id), req.body || {}))
);

export default router;
