// Bookkeeping: a student's account, collections, deposits (managers)
import {
  METHODS,
  studentAccount,
  recordPayment,
  deletePayment,
  setDepositStatus,
  ledger,
  toCollect,
  deposits,
} from '../services/accounting.js';

const me = (req) => Number(req.user?.userid ?? req.user?.userId);
const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const account = async (req, res) => {
  try {
    const a = await studentAccount(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Élève introuvable' });
    res.json({ ...a, methods: METHODS });
  } catch (err) {
    fail(res, err, 'Compte indisponible');
  }
};
export const pay = async (req, res) => {
  try {
    const out = await recordPayment(Number(req.params.id), req.body, me(req));
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    res.status(201).json(out.payment);
  } catch (err) {
    fail(res, err, "Le paiement n'a pas pu être enregistré");
  }
};
export const unpay = async (req, res) => {
  try {
    if (!(await deletePayment(Number(req.params.id)))) return res.status(404).json({ error: 'Paiement introuvable' });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "Le paiement n'a pas pu être supprimé");
  }
};
// Body: { status: 'reçue' | 'rendue' | 'encaissée' }
export const deposit = async (req, res) => {
  try {
    const l = await setDepositStatus(Number(req.params.id), req.body.status);
    if (!l) return res.status(400).json({ error: 'Caution ou état inconnu' });
    res.json(l);
  } catch (err) {
    fail(res, err, "L'état de la caution n'a pas pu être enregistré");
  }
};
export const journal = async (req, res) => {
  try {
    const from = DAY.test(req.query.from || '') ? req.query.from : '2000-01-01';
    const to = DAY.test(req.query.to || '') ? req.query.to : '2999-12-31';
    res.json({ ...(await ledger(from, to)), methods: METHODS });
  } catch (err) {
    fail(res, err, 'Encaissements indisponibles');
  }
};
export const collect = async (req, res) => {
  try {
    res.json(await toCollect());
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};
export const depositList = async (req, res) => {
  try {
    res.json(await deposits());
  } catch (err) {
    fail(res, err, 'Liste indisponible');
  }
};
