// Invoices of paid tutoring (activite 'payant'). No VAT.
// Numbers are continuous and never reused: F2026-0001, F2026-0002… A credit
// note (avoir) cancels an invoice; an issued invoice is never edited or
// deleted. Amounts are integer cents.
import db from '../config/database.js';

const q = async (sql, replacements = {}, transaction) =>
  (await db.query(sql, { replacements, transaction, logging: false }))[0];

const yearOf = (day) => String(day).slice(0, 4);

// Next number of a series ('F' invoices, 'AV' credit notes) for a year. The
// advisory lock serialises the numbering: two invoices issued at the same
// time cannot take the same number. Rolled-back invoices leave no gap, since
// nothing is reserved before the commit.
export const nextNumero = async (prefix, year, transaction) => {
  await q(`select pg_advisory_xact_lock(hashtext(:key))`, { key: `factures-${prefix}${year}` }, transaction);
  const [row] = await q(
    `select numero from factures where numero like :pattern order by numero desc limit 1`,
    { pattern: `${prefix}${year}-%` },
    transaction
  );
  const last = row ? Number(row.numero.split('-')[1]) : 0;
  return `${prefix}${year}-${String(last + 1).padStart(4, '0')}`;
};

const toCents = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

// Issue an invoice to a payer
export const issueInvoice = async ({ payeur_id, binome_id = null, issued_on, label, amount_cents }) => {
  const amount = toCents(amount_cents);
  if (!payeur_id) throw new Error('Payeur manquant');
  if (!issued_on || !label?.trim()) throw new Error('Date et libellé obligatoires');
  if (!amount || amount <= 0) throw new Error('Montant positif (en centimes) obligatoire');
  return db.transaction(async (transaction) => {
    const [payeur] = await q(`select id from payeurs where id = :id`, { id: payeur_id }, transaction);
    if (!payeur) throw new Error('Payeur introuvable');
    const numero = await nextNumero('F', yearOf(issued_on), transaction);
    const [facture] = await q(
      `insert into factures (numero, payeur_id, binome_id, issued_on, label, amount_cents, status)
       values (:numero, :payeur_id, :binome_id, :issued_on, :label, :amount, 'emise') returning *`,
      { numero, payeur_id, binome_id, issued_on, label: label.trim(), amount },
      transaction
    );
    return facture;
  });
};

// Cancel an invoice by a credit note of the same amount. The invoice is
// locked, so it can be cancelled once only.
export const cancelInvoice = async ({ facture_id, issued_on }) => {
  return db.transaction(async (transaction) => {
    const [orig] = await q(`select * from factures where id = :id for update`, { id: facture_id }, transaction);
    if (!orig) throw new Error('Facture introuvable');
    if (orig.status !== 'emise') throw new Error('Cette facture est déjà annulée');
    const numero = await nextNumero('AV', yearOf(issued_on), transaction);
    const [avoir] = await q(
      `insert into factures (numero, payeur_id, binome_id, issued_on, label, amount_cents, status, cancels_facture_id)
       values (:numero, :payeur_id, :binome_id, :issued_on, :label, :amount, 'emise', :orig)
       returning *`,
      {
        numero,
        payeur_id: orig.payeur_id,
        binome_id: orig.binome_id,
        issued_on,
        label: `Avoir sur ${orig.numero}`,
        amount: orig.amount_cents,
        orig: orig.id,
      },
      transaction
    );
    await q(`update factures set status = 'annulee' where id = :id`, { id: orig.id }, transaction);
    return avoir;
  });
};

// Record a payment on an invoice. Refused when it would exceed what is due.
export const recordPayment = async ({ facture_id, paid_on, amount_cents, method = null, reference = null }) => {
  const amount = toCents(amount_cents);
  if (!amount || amount <= 0) throw new Error('Montant positif (en centimes) obligatoire');
  if (!paid_on) throw new Error('Date du paiement obligatoire');
  return db.transaction(async (transaction) => {
    const [facture] = await q(`select * from factures where id = :id for update`, { id: facture_id }, transaction);
    if (!facture) throw new Error('Facture introuvable');
    if (facture.status !== 'emise') throw new Error('Facture annulée : pas de paiement possible');
    const [{ paid }] = await q(
      `select coalesce(sum(amount_cents), 0)::int as paid from paiements where facture_id = :id`,
      { id: facture_id },
      transaction
    );
    if (paid + amount > facture.amount_cents) throw new Error('Le paiement dépasse le montant dû');
    const [row] = await q(
      `insert into paiements (facture_id, paid_on, amount_cents, method, reference)
       values (:facture_id, :paid_on, :amount, :method, :reference) returning *`,
      { facture_id, paid_on, amount, method, reference },
      transaction
    );
    return row;
  });
};

// Invoices with what is already paid (for the list)
export const listInvoices = () =>
  q(`select f.*, p.name as payeur_name, p.accounting_tiers_id,
       coalesce((select sum(amount_cents) from paiements x where x.facture_id = f.id), 0)::int as paid_cents
     from factures f join payeurs p on p.id = f.payeur_id
     order by f.issued_on desc, f.id desc`);

export const listPayeurs = () => q(`select * from payeurs order by name`);

export const createPayeur = async ({ type, name, email = null, address = null, student_id = null }) => {
  if (!['famille', 'eleve_majeur'].includes(type)) throw new Error('Type de payeur invalide');
  if (!name?.trim()) throw new Error('Nom obligatoire');
  const [row] = await q(
    `insert into payeurs (type, name, email, address, student_id)
     values (:type, :name, :email, :address, :student_id) returning *`,
    { type, name: name.trim(), email, address, student_id }
  );
  return row;
};
