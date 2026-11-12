// Simple bookkeeping of what the families pay: each collection (total,
// means, date, reference: an AssoConnect link often covers the membership
// and the participation together) and what it pays for (lines). What each
// student owes for the school year: membership, participation per term (or
// 5-hour packages for the hourly rate), deposit and its fate.
import db from '../config/database.js';
import { feeOf } from './fees.js';
import { MEMBERSHIP_FEE, schoolYearOf } from './activities.js';

// AssoConnect link: the usual means; the others are exceptional
export const METHODS = [
  { value: 'assoconnect', label: 'Lien AssoConnect', exceptional: false },
  { value: 'espèces', label: 'Espèces', exceptional: true },
  { value: 'chèque', label: 'Chèque', exceptional: true },
  { value: 'virement', label: 'Virement', exceptional: true },
  { value: 'carte', label: 'Carte', exceptional: true },
  { value: 'autre', label: 'Autre', exceptional: true },
];
const METHOD_VALUES = METHODS.map((m) => m.value);
export const NATURES = ['cotisation', 'participation', 'forfait', 'caution'];
export const DEPOSIT_STATUSES = ['reçue', 'rendue', 'encaissée'];
// A term unpaid this long after its start is late
const LATE_MONTHS = 1;
const DEFAULT_DEPOSIT = 200;
const PACK_HOURS = 5;
const IN_PROGRESS = ['actif', 'en pause', 'terminé'];

const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];
const one = async (sql, replacements) => (await q(sql, replacements))[0] || null;
const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const parisToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const addMonths = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
};

// Terms of a school year: September-December, January-March, April-August
export const termsOf = (year) => {
  const y = Number(String(year).slice(0, 4));
  return [
    { key: `${y}-T1`, label: '1er trimestre', start: `${y}-09-01`, end: `${y}-12-31` },
    { key: `${y}-T2`, label: '2e trimestre', start: `${y + 1}-01-01`, end: `${y + 1}-03-31` },
    { key: `${y}-T3`, label: '3e trimestre', start: `${y + 1}-04-01`, end: `${y + 1}-08-31` },
  ];
};

// Participation tracked in the application from this term on: before it,
// payments were followed in the Excel file. An earlier term shows only when
// a payment is recorded for it.
export const TRACKED_FROM = '2026-T2';

const lineOf = (l) => ({ ...l, amount: Number(l.amount), hours: l.hours === null ? null : Number(l.hours), paid_at: day(l.paid_at) });

// The account from what is loaded (one student or all of them at once)
const computeAccount = ({ student, lines, membership, pairs, minutes, year, today }) => {
  const fee = feeOf(student);
  // Tutoring period: from the first pair's start to the last one's end
  const starts = pairs.map((p) => day(p.start_date || p.responded_at)).filter(Boolean).sort();
  const open = pairs.some((p) => p.status !== 'terminé');
  const ends = pairs.map((p) => day(p.ended_at)).filter(Boolean).sort();
  const began = starts[0] || null;
  const ended = open ? null : ends[ends.length - 1] || null;
  const sum = (filter) => round(lines.filter(filter).reduce((n, l) => n + l.amount, 0));

  const items = [];
  // Terms before the tracking: offered when recording, never claimed
  const earlier = [];
  // Membership (also recorded alone, before the collections existed)
  const membershipPaid = sum((l) => l.nature === 'cotisation') || (membership ? Number(membership.amount) : 0);
  items.push({
    nature: 'cotisation',
    label: `Cotisation ${year}`,
    due: MEMBERSHIP_FEE,
    paid: membershipPaid,
    status: membershipPaid >= MEMBERSHIP_FEE || membership ? 'payé' : 'à payer',
  });
  // Participation
  let hourly = null;
  if (fee?.mode === 'term' && fee.amount) {
    for (const t of termsOf(year)) {
      // Terms of the tutoring; those not begun yet can be paid in advance
      const followed = began && began <= t.end && (!ended || ended >= t.start);
      if (!followed) continue;
      const paid = sum((l) => l.nature === 'participation' && l.term === t.key);
      if (t.key < TRACKED_FROM && !paid) {
        earlier.push({ nature: 'participation', term: t.key, label: `Participation, ${t.label}`, due: fee.amount, paid: 0, status: 'antérieur' });
        continue;
      }
      const status =
        paid >= fee.amount
          ? 'payé'
          : t.start > today
            ? 'à venir'
            : today >= addMonths(t.start, LATE_MONTHS)
              ? 'en retard'
              : 'à payer';
      items.push({ nature: 'participation', term: t.key, label: `Participation, ${t.label}`, due: fee.amount, paid, status });
    }
  } else if (fee?.mode === 'hourly' && fee.amount) {
    const done = round(minutes / 60);
    const bought = round(lines.filter((l) => l.nature === 'forfait').reduce((n, l) => n + (l.hours || 0), 0));
    const left = round(bought - done);
    hourly = { done, bought, left, pack_hours: PACK_HOURS, pack_price: fee.pack5 || round(fee.amount * PACK_HOURS) };
    if (began && (left < 1 || !bought)) {
      items.push({
        nature: 'forfait',
        label: `Forfait de ${PACK_HOURS} heures`,
        due: hourly.pack_price,
        paid: 0,
        status: left < 0 ? 'en retard' : 'à payer',
        detail: bought ? `${done} h faites sur ${bought} h payées` : 'aucun forfait payé',
      });
    }
  }
  // Deposit
  const deposit = fee ? fee.deposit || DEFAULT_DEPOSIT : null;
  const depositLine = [...lines].reverse().find((l) => l.nature === 'caution') || null;
  if (deposit && began) {
    items.push({
      nature: 'caution',
      label: 'Caution',
      due: deposit,
      paid: depositLine ? depositLine.amount : 0,
      status: depositLine ? depositLine.deposit_status || 'reçue' : 'à payer',
      line_id: depositLine?.id || null,
    });
  }
  return {
    year,
    fee: fee ? { mode: fee.mode, amount: fee.amount, deposit, pack5: fee.pack5 || null, text: fee.text } : null,
    began,
    hourly,
    items,
    earlier,
    owed: round(items.filter((i) => i.status === 'à payer' || i.status === 'en retard').reduce((n, i) => n + (i.due - i.paid), 0)),
  };
};

const LINES_SQL = `select l.*, p.paid_at, p.method from payment_lines l join payments p on p.id = l.payment_id
  where l.school_year = :year and l.student_id in (:ids) order by p.paid_at, l.id`;
const MINUTES_SQL = `select b.student_id, coalesce(sum(s.duration_minutes), 0)::int as minutes from seances s
  join binomes b on b.id = s.binome_id
  where b.student_id in (:ids) and s.attendance = 'présent' and s.date between :from and :to group by b.student_id`;

// Everything the accounts of these students need, in four queries
const loadAccounts = async (students, year) => {
  const ids = students.map((s) => s.id);
  if (!ids.length) return [];
  const terms = termsOf(year);
  const [lines, memberships, pairs, minutes] = await Promise.all([
    q(LINES_SQL, { year, ids }),
    q('select * from student_memberships where school_year = :year and student_id in (:ids)', { year, ids }),
    q('select * from binomes where student_id in (:ids) and status in (:statuses)', { ids, statuses: IN_PROGRESS }),
    q(MINUTES_SQL, { ids, from: terms[0].start, to: terms[2].end }),
  ]);
  const group = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.student_id, [...(m.get(r.student_id) || []), r]);
    return m;
  };
  const linesBy = group(lines.map(lineOf));
  const pairsBy = group(pairs);
  const membershipBy = new Map(memberships.map((m) => [m.student_id, m]));
  const minutesBy = new Map(minutes.map((m) => [m.student_id, m.minutes]));
  const today = parisToday();
  return students.map((student) =>
    computeAccount({
      student,
      lines: linesBy.get(student.id) || [],
      membership: membershipBy.get(student.id) || null,
      pairs: pairsBy.get(student.id) || [],
      minutes: minutesBy.get(student.id) || 0,
      year,
      today,
    })
  );
};

// What a student owes and paid for the school year
export const studentAccount = async (studentId, year = schoolYearOf()) => {
  const student = await one('select * from students where id = :studentId', { studentId });
  if (!student) return null;
  const [account] = await loadAccounts([student], year);
  const payments = await q(
    `select p.*, coalesce(json_agg(l order by l.id) filter (where l.id is not null), '[]') as lines
       from payments p left join payment_lines l on l.payment_id = p.id
      where p.student_id = :studentId group by p.id order by p.paid_at desc, p.id desc`,
    { studentId }
  );
  return {
    ...account,
    tracked_from: TRACKED_FROM,
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount), paid_at: day(p.paid_at) })),
  };
};

// Body: { paid_at, method, reference, note, lines: [{ nature, term, hours,
// amount }] }; the total is the sum of the lines
export const recordPayment = async (studentId, body, userId) => {
  const student = await one('select id from students where id = :studentId', { studentId });
  if (!student) return { error: 'Élève introuvable', status: 404 };
  if (!METHOD_VALUES.includes(body.method)) return { error: 'Choisissez le moyen de paiement' };
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at || '') ? body.paid_at : parisToday();
  const year = schoolYearOf(paidAt);
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({
      nature: l.nature,
      term: l.nature === 'participation' ? String(l.term || '') : null,
      hours: l.nature === 'forfait' ? Number(l.hours) || PACK_HOURS : null,
      amount: round(l.amount),
      school_year: /^\d{4}-\d{4}$/.test(l.school_year || '') ? l.school_year : year,
    }))
    .filter((l) => NATURES.includes(l.nature) && l.amount > 0);
  if (!lines.length) return { error: 'Indiquez ce que le paiement règle' };
  if (lines.some((l) => l.nature === 'participation' && !/^\d{4}-T[123]$/.test(l.term))) return { error: 'Trimestre invalide' };
  const total = round(lines.reduce((n, l) => n + l.amount, 0));
  return db.transaction(async (transaction) => {
    const [[payment]] = await db.query(
      `insert into payments (student_id, paid_at, amount, method, reference, note, recorded_by)
       values (:studentId, :paidAt, :total, :method, :reference, :note, :userId) returning *`,
      {
        replacements: {
          studentId,
          paidAt,
          total,
          method: body.method,
          reference: String(body.reference || '').trim().slice(0, 120) || null,
          note: String(body.note || '').trim().slice(0, 300) || null,
          userId,
        },
        transaction,
        logging: false,
      }
    );
    for (const l of lines) {
      await db.query(
        `insert into payment_lines (payment_id, student_id, nature, school_year, term, hours, amount, deposit_status, deposit_status_at)
         values (:paymentId, :studentId, :nature, :schoolYear, :term, :hours, :amount, :depositStatus, :depositAt)`,
        {
          replacements: {
            paymentId: payment.id,
            studentId,
            nature: l.nature,
            schoolYear: l.school_year,
            term: l.term,
            hours: l.hours,
            amount: l.amount,
            depositStatus: l.nature === 'caution' ? 'reçue' : null,
            depositAt: l.nature === 'caution' ? paidAt : null,
          },
          transaction,
          logging: false,
        }
      );
      // The membership, as the outings see it
      if (l.nature === 'cotisation') {
        await db.query(
          `insert into student_memberships (student_id, school_year, amount, paid_at, method, recorded_by, payment_id)
           values (:studentId, :schoolYear, :amount, :paidAt, :method, :userId, :paymentId)
           on conflict (student_id, school_year) do update set amount = excluded.amount, paid_at = excluded.paid_at,
             method = excluded.method, recorded_by = excluded.recorded_by, payment_id = excluded.payment_id`,
          {
            replacements: { studentId, schoolYear: l.school_year, amount: l.amount, paidAt, method: body.method, userId, paymentId: payment.id },
            transaction,
            logging: false,
          }
        );
      }
    }
    return { payment: { ...payment, amount: Number(payment.amount), paid_at: day(payment.paid_at) } };
  });
};

// A collection entered by mistake: removed with its lines (and the
// membership it recorded)
export const deletePayment = async (id) => {
  await q('delete from student_memberships where payment_id = :id', { id });
  return one('delete from payments where id = :id returning id', { id });
};

export const setDepositStatus = (lineId, status) =>
  DEPOSIT_STATUSES.includes(status)
    ? one(
        `update payment_lines set deposit_status = :status, deposit_status_at = :today where id = :lineId and nature = 'caution' returning *`,
        { lineId, status, today: parisToday() }
      )
    : null;

const methodOf = (v) => METHODS.find((m) => m.value === v) || { value: v, label: v || '—', exceptional: true };

// Every collection of a period, line by line: participation, membership,
// package, deposit, outings; memberships recorded alone; totals
export const ledger = async (from, to) => {
  const rows = [];
  for (const l of await q(
    `select l.*, p.paid_at, p.method, p.reference, p.id as payment_id, p.amount as payment_amount,
            s.first_name, s.last_name
       from payment_lines l join payments p on p.id = l.payment_id join students s on s.id = l.student_id
      where p.paid_at between :from and :to order by p.paid_at desc, p.id desc, l.id`,
    { from, to }
  )) {
    rows.push({
      date: day(l.paid_at),
      student_id: l.student_id,
      student: `${l.first_name} ${l.last_name || ''}`.trim(),
      nature: l.nature,
      detail: l.nature === 'participation' ? l.term : l.nature === 'forfait' ? `${Number(l.hours)} h` : l.nature === 'caution' ? l.deposit_status : '',
      amount: Number(l.amount),
      method: l.method,
      reference: l.reference,
      payment_id: l.payment_id,
    });
  }
  // Memberships recorded on their own (outings, Excel)
  for (const m of await q(
    `select m.*, s.first_name, s.last_name from student_memberships m join students s on s.id = m.student_id
      where m.payment_id is null and m.paid_at between :from and :to`,
    { from, to }
  )) {
    rows.push({
      date: day(m.paid_at),
      student_id: m.student_id,
      student: `${m.first_name} ${m.last_name || ''}`.trim(),
      nature: 'cotisation',
      detail: 'saisie à part',
      amount: Number(m.amount),
      method: m.method,
      reference: null,
    });
  }
  // Outings' participations
  for (const r of await q(
    `select r.*, a.title, s.first_name, s.last_name from activity_registrations r
       join activities a on a.id = r.activity_id join students s on s.id = r.student_id
      where r.paid_amount > 0 and r.paid_at between :from and :to`,
    { from, to }
  )) {
    rows.push({
      date: day(r.paid_at),
      student_id: r.student_id,
      student: `${r.first_name} ${r.last_name || ''}`.trim(),
      nature: 'sortie',
      detail: r.title,
      amount: Number(r.paid_amount),
      method: r.paid_method,
      reference: null,
    });
  }
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  for (const r of rows) {
    const m = methodOf(r.method);
    r.method_label = m.label;
    r.exceptional = m.exceptional;
  }
  const by = (key) => {
    const out = {};
    for (const r of rows) out[r[key]] = round((out[r[key]] || 0) + r.amount);
    return out;
  };
  const [{ undated }] = await q(`select count(*)::int as undated from student_memberships where payment_id is null and paid_at is null`);
  return {
    from,
    to,
    rows,
    total: round(rows.reduce((n, r) => n + r.amount, 0)),
    by_method: Object.entries(by('method_label')).map(([label, amount]) => ({ label, amount })),
    by_nature: Object.entries(by('nature')).map(([label, amount]) => ({ label, amount })),
    exceptional: round(rows.filter((r) => r.exceptional).reduce((n, r) => n + r.amount, 0)),
    undated_memberships: undated,
  };
};

// Students with something to collect (late first), for the treasurer
export const toCollect = async (year = schoolYearOf()) => {
  const students = await q(
    `select * from students
      where not coalesce(is_demo, false)
        and status in ('Nouvelle demande', 'En attente de tuteur', 'Binôme en cours', 'En pause', 'Terminé', 'Activités culturelles seulement')`
  );
  const accounts = await loadAccounts(students, year);
  const out = [];
  students.forEach((s, k) => {
    const account = accounts[k];
    const due = account.items.filter((i) => i.status === 'à payer' || i.status === 'en retard');
    if (!due.length) return;
    out.push({
      id: s.id,
      name: `${s.first_name} ${s.last_name || ''}`.trim(),
      parent: [s.parent1_firstname, s.parent1_phone].filter(Boolean).join(' · '),
      late: due.some((i) => i.status === 'en retard'),
      owed: round(due.reduce((n, i) => n + (i.due - i.paid), 0)),
      items: due.map((i) => ({ label: i.label, amount: round(i.due - i.paid), status: i.status })),
      no_fee: !account.fee,
    });
  });
  return out.sort((a, b) => Number(b.late) - Number(a.late) || b.owed - a.owed);
};

// Deposits of the year and their fate
export const deposits = async (year = schoolYearOf()) =>
  (
    await q(
      `select l.*, p.paid_at, p.method, s.first_name, s.last_name from payment_lines l
         join payments p on p.id = l.payment_id join students s on s.id = l.student_id
        where l.nature = 'caution' and l.school_year = :year order by s.first_name`,
      { year }
    )
  ).map((l) => ({
    id: l.id,
    student_id: l.student_id,
    student: `${l.first_name} ${l.last_name || ''}`.trim(),
    amount: Number(l.amount),
    paid_at: day(l.paid_at),
    method_label: methodOf(l.method).label,
    status: l.deposit_status || 'reçue',
    status_at: day(l.deposit_status_at),
  }));
