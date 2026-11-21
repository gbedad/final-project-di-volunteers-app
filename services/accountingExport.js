// Export of paid tutoring to the accounting software (import file, modelled
// on tutoriels/template.xlsx). Each piece is balanced (debit = credit).
// Accounts (plan comptable associatif), no VAT:
//   411000 Clients (payeurs)          706002 Participation aux frais de tutorat
//   604000 Prestations (tuteurs AE)   401000 Fournisseurs (tuteurs AE)
//   512001 Banque Postale             (encaissements des élèves et paiements)
import db from '../config/database.js';

export const ACCOUNTS = {
  client: '411000',
  tutorat: '706002',
  prestations: '604000',
  fournisseur: '401000',
  banque: '512001',
};

export const EXPORT_COLUMNS = [
  'Date',
  'Libellé',
  'Numéro de pièce',
  'Compte',
  'Débit (€)',
  'Crédit (€)',
  'Commentaire',
  'ID personnalisé',
  'ID du contact',
  'ID du tiers',
  'ID du budget',
  "ID de l'organisation",
];

// Euros from integer cents, for the file (no float drift)
const euros = (cents) => {
  const n = Number(cents);
  return Math.trunc(n / 100) + (n % 100 ? (n % 100) / 100 : 0);
};

const ddmmyyyy = (day) => {
  const [y, m, d] = String(day).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// One piece: two lines (debit account, credit account) of the same amount
const piece = ({ date, label, numero, debitAccount, creditAccount, cents, tiersId, debitTiers, creditTiers }) => {
  const base = { Date: ddmmyyyy(date), Libellé: label, 'Numéro de pièce': numero, Commentaire: '' };
  return [
    {
      ...base,
      Compte: debitAccount,
      'Débit (€)': euros(cents),
      'Crédit (€)': 0,
      'ID du tiers': debitTiers ?? '',
      _numero: numero,
    },
    {
      ...base,
      Compte: creditAccount,
      'Débit (€)': 0,
      'Crédit (€)': euros(cents),
      'ID du tiers': creditTiers ?? '',
      _numero: numero,
    },
  ];
};

// Pure: the rows to export from loaded data.
//  factures: { numero, issued_on, label, amount_cents, status, cancels_facture_id,
//              payeur_name, payeur_tiers }
//  paiements: { facture_numero, paid_on, amount_cents, payeur_tiers, payeur_name }
//  remunerations: { tutor_invoice_ref, id, created_at, amount_cents, status, paid_on,
//                   tutor_name, tutor_tiers }
export const buildEntries = ({ factures = [], paiements = [], remunerations = [] }) => {
  const rows = [];
  const missing = new Map(); // name -> type, tiers identifiers to create

  const needTiers = (name, type, tiersId) => {
    if (!tiersId && name) missing.set(`${type}:${name}`, { type, name });
  };

  for (const f of factures) {
    needTiers(f.payeur_name, 'CLIENT', f.payeur_tiers);
    const cancel = !!f.cancels_facture_id;
    // Invoice: client debited, tutorat credited. Credit note: the reverse.
    rows.push(
      ...piece({
        date: f.issued_on,
        label: f.label,
        numero: f.numero,
        debitAccount: cancel ? ACCOUNTS.tutorat : ACCOUNTS.client,
        creditAccount: cancel ? ACCOUNTS.client : ACCOUNTS.tutorat,
        cents: f.amount_cents,
        debitTiers: cancel ? '' : f.payeur_tiers,
        creditTiers: cancel ? f.payeur_tiers : '',
      })
    );
  }

  for (const p of paiements) {
    needTiers(p.payeur_name, 'CLIENT', p.payeur_tiers);
    rows.push(
      ...piece({
        date: p.paid_on,
        label: `Paiement ${p.facture_numero}`,
        numero: p.facture_numero,
        debitAccount: ACCOUNTS.banque,
        creditAccount: ACCOUNTS.client,
        cents: p.amount_cents,
        creditTiers: p.payeur_tiers,
      })
    );
  }

  for (const r of remunerations) {
    needTiers(r.tutor_name, 'SUPPLIER', r.tutor_tiers);
    const numero = r.tutor_invoice_ref || `REM-${r.id}`;
    const label = `Tutorat ${r.tutor_name}`;
    // Fee owed when the tutor's invoice comes in…
    rows.push(
      ...piece({
        date: r.created_at,
        label,
        numero,
        debitAccount: ACCOUNTS.prestations,
        creditAccount: ACCOUNTS.fournisseur,
        cents: r.amount_cents,
        creditTiers: r.tutor_tiers,
      })
    );
    // …then paid
    if (r.status === 'payee' && r.paid_on) {
      rows.push(
        ...piece({
          date: r.paid_on,
          label: `Règlement ${label}`,
          numero,
          debitAccount: ACCOUNTS.fournisseur,
          creditAccount: ACCOUNTS.banque,
          cents: r.amount_cents,
          debitTiers: r.tutor_tiers,
        })
      );
    }
  }

  // Each piece must balance
  const sums = new Map();
  for (const row of rows) {
    const s = sums.get(row._numero) || { d: 0, c: 0 };
    s.d += row['Débit (€)'];
    s.c += row['Crédit (€)'];
    sums.set(row._numero, s);
  }
  const unbalanced = [...sums].filter(([, s]) => Math.abs(s.d - s.c) > 1e-9).map(([n]) => n);
  if (unbalanced.length) throw new Error(`Pièces déséquilibrées : ${unbalanced.join(', ')}`);

  const clean = rows.map(({ _numero, ...row }) => row);
  return { rows: clean, toCreate: [...missing.values()] };
};

// Loads the data between two dates (inclusive) and builds the rows
export const loadExport = async ({ from, to }) => {
  const run = async (sql, replacements) => (await db.query(sql, { replacements, logging: false }))[0];
  const factures = await run(
    `select f.numero, f.issued_on, f.label, f.amount_cents, f.status, f.cancels_facture_id,
       p.name as payeur_name, p.accounting_tiers_id as payeur_tiers
     from factures f join payeurs p on p.id = f.payeur_id
     where f.issued_on between :from and :to
     order by f.issued_on, f.id`,
    { from, to }
  );
  const paiements = await run(
    `select f.numero as facture_numero, pa.paid_on, pa.amount_cents,
       p.name as payeur_name, p.accounting_tiers_id as payeur_tiers
     from paiements pa join factures f on f.id = pa.facture_id join payeurs p on p.id = f.payeur_id
     where pa.paid_on between :from and :to
     order by pa.paid_on, pa.id`,
    { from, to }
  );
  const remunerations = await run(
    `select r.id, r.tutor_invoice_ref, r.amount_cents, r.status, r.paid_on, r.created_at,
       trim(u.first_name || ' ' || u.last_name) as tutor_name,
       u.accounting_tiers_id as tutor_tiers
     from remunerations_tuteurs r join users u on u.id = r.tuteur_id
     where r.created_at::date between :from and :to
     order by r.created_at, r.id`,
    { from, to }
  );
  return buildEntries({ factures, paiements, remunerations });
};
