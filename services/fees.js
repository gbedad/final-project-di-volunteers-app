// Participation of the families to the costs ("participation aux frais").
//  - QF (quotient familial) proven, tranches 1 to 7: a fixed amount per
//    term and a deposit (caution), whatever the needs
//  - QF above 2 500 € (tranche 8 and beyond), or QF not given: an hourly
//    rate by level ("Autres" row for special needs), no deposit; the amount
//    due follows the hours of the session reports
// One scale per school year: a signed consent keeps the amount it was given.

export const FEES_YEAR = '2026-2027';

// Tranches 1-7: upper limit of the QF (included), amount per term, deposit
export const TRANCHES = [
  { tranche: 1, max: 234, term: 5, deposit: 20 },
  { tranche: 2, max: 384, term: 10, deposit: 40 },
  { tranche: 3, max: 548, term: 15, deposit: 60 },
  { tranche: 4, max: 959, term: 20, deposit: 80 },
  { tranche: 5, max: 1370, term: 30, deposit: 100 },
  { tranche: 6, max: 1900, term: 45, deposit: 150 },
  { tranche: 7, max: 2500, term: 130, deposit: 200 },
];

// Hourly rates: [1 hour, 5 hours] for tranche 8 and beyond / without proof
export const HOURLY = [
  { key: 'primaire', label: 'Primaire', levels: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'], t8: [30, 140], none: [40, 186] },
  { key: 'college', label: 'Collège (6ème-4ème)', levels: ['6ème', '5ème', '4ème'], t8: [35, 163], none: [45, 209] },
  { key: 'troisieme', label: 'Collège (3ème)', levels: ['3ème'], t8: [40, 186], none: [50, 233] },
  { key: 'seconde', label: '2nde', levels: ['Seconde'], t8: [50, 233], none: [55, 256] },
  { key: 'premiere', label: '1ère', levels: ['Première'], t8: [55, 256], none: [65, 302] },
  { key: 'terminale', label: 'Terminale', levels: ['Terminale'], t8: [60, 279], none: [75, 349] },
  { key: 'superieur', label: 'Supérieur', levels: ['L1', 'L2', 'L3'], t8: [70, 326], none: [85, 395] },
  // Learning disorders, remediation, STEM private lessons…
  { key: 'autres', label: 'Autres (besoins particuliers)', levels: [], t8: [65, 302], none: [85, 395] },
];

export const QF_PROOFS = {
  caf: 'Attestation CAF',
  avis: "Avis d'imposition",
  none: 'QF non communiqué',
};

const euros = (n) =>
  `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

// QF from the tax notice: revenu fiscal de référence / 12 / nombre de parts
export const qfFromTaxNotice = (income, parts) =>
  income > 0 && parts > 0 ? Math.round((income / 12 / parts) * 100) / 100 : null;

export const trancheOf = (qf) => {
  if (qf === null || qf === undefined || qf === '' || isNaN(Number(qf))) return null;
  const t = TRANCHES.find((x) => Number(qf) <= x.max);
  return t ? t.tranche : 8;
};

// Participation of a student. Returns null while nothing is known (no QF and
// "not given" not chosen). Fields:
//   mode 'term' (tranches 1-7) or 'hourly'; tranche; amount (per term or
//   per hour); deposit; pack5 (5 hours, hourly mode); computed (before a
//   manual change); text (sentence shown to the parents)
export const feeOf = (student) => {
  const qf = student.qf === null || student.qf === undefined ? null : Number(student.qf);
  const noProof = student.qf_proof === 'none';
  if (qf === null && !noProof) return null;
  const tranche = noProof ? null : trancheOf(qf);

  let fee;
  if (tranche && tranche <= 7) {
    const t = TRANCHES[tranche - 1];
    fee = { mode: 'term', tranche, amount: t.term, deposit: t.deposit };
  } else {
    const row = student.fee_special
      ? HOURLY.find((r) => r.key === 'autres')
      : HOURLY.find((r) => r.levels.includes(student.level));
    if (!row) return { mode: 'hourly', tranche, missing: 'level', year: FEES_YEAR };
    const [hour, pack5] = noProof ? row.none : row.t8;
    fee = { mode: 'hourly', tranche, row: row.label, amount: hour, pack5, deposit: 0 };
  }
  fee.year = FEES_YEAR;
  fee.computed = fee.amount;
  if (student.fee_override !== null && student.fee_override !== undefined && student.fee_override !== '') {
    fee.amount = Number(student.fee_override);
    fee.override_reason = student.fee_override_reason || null;
  }
  const basis = noProof
    ? 'QF non communiqué'
    : `tranche ${tranche}, QF de ${euros(qf)}`;
  fee.text =
    fee.mode === 'term'
      ? `${euros(fee.amount)} par trimestre et une caution de ${euros(fee.deposit)} (${basis})`
      : `${euros(fee.amount)} par heure de tutorat réalisée, selon les comptes-rendus de séance (${basis}${
          fee.row ? `, ${fee.row}` : ''
        })`;
  return fee;
};

// School terms: September-December, January-March, April-August
export const termOf = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 9) return { key: `${y}-T1`, label: `1er trimestre ${y}-${y + 1}` };
  if (m <= 3) return { key: `${y - 1}-T2`, label: `2e trimestre ${y - 1}-${y}` };
  return { key: `${y - 1}-T3`, label: `3e trimestre ${y - 1}-${y}` };
};

// Hours held (session reports "présent") per term, and the amount due when
// the family pays by the hour
export const hoursByTerm = (sessions, fee) => {
  const terms = {};
  for (const s of sessions) {
    if (s.attendance !== 'présent') continue;
    const t = termOf(s.date);
    terms[t.key] = terms[t.key] || { ...t, minutes: 0 };
    terms[t.key].minutes += s.duration_minutes || 0;
  }
  return Object.values(terms)
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((t) => {
      const hours = Math.round((t.minutes / 60) * 100) / 100;
      return {
        key: t.key,
        label: t.label,
        hours,
        due:
          fee?.mode === 'hourly' && fee.amount !== undefined
            ? Math.round(hours * fee.amount * 100) / 100
            : fee?.mode === 'term'
            ? fee.amount
            : null,
      };
    });
};
