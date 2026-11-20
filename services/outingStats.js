// Cultural outings over a school year (1 September - 31 August): what the
// "Sorties" view of the analysis shows, and the outings part of the annual
// report. Drafts are left out, demonstration students too.
import db from '../config/database.js';
import { yearRange, currentYear, cycleOf, CYCLES, countBy, list } from './annualReport.js';
import { hoursBetween, sessionFigures } from './outingSessionFigures.js';

const q = (sql, replacements) => db.query(sql, { replacements, logging: false }).then(([rows]) => rows);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const day = (d) => (d ? new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) : null);
const round = (n) => Math.round(n * 100) / 100;
const pct = (n, total) => (total ? Math.round((n * 100) / total) : null);

export const outingStats = async (year = currentYear()) => {
  const { from, to, complete, year: label } = yearRange(year);
  // Every outing of the school year, the coming ones included (to: end of
  // the year, not today)
  const end = `${Number(label.slice(0, 4)) + 1}-08-31`;
  const outings = await q(
    `select id, title, kind, date, start_time, end_time, status, places, companions, prep, debrief
       from activities
      where date between :from and :end and status <> 'brouillon'
      order by date, id`,
    { from, end }
  );
  const ids = outings.map((o) => o.id);
  const none = [0];
  // Registrations, adults and expenses: read together
  const [regs, staff, expenses] = await Promise.all([
  q(
    `select r.activity_id, r.student_id, r.status, r.attendance, r.paid_amount,
            s.level, s.school, s.is_demo,
            exists (select 1 from binomes b where b.student_id = s.id
                     and b.status in ('actif', 'en pause', 'terminé')) as tutored
       from activity_registrations r join students s on s.id = r.student_id
      where r.activity_id in (:ids) and coalesce(s.is_demo, false) = false`,
    { ids: ids.length ? ids : none }
  ),
  q(
    `select activity_id, user_id, name, role from activity_staff where activity_id in (:ids)`,
    { ids: ids.length ? ids : none }
  ),
  q(
    `select activity_id, amount from activity_expenses where activity_id in (:ids)`,
    { ids: ids.length ? ids : none }
  ),
  ]);

  // Children of the preparation and return sessions (not the outing itself).
  // The table only exists after its migration: no session before that.
  const sessionRows = await q(
    `select p.activity_id, p.kind, p.student_id, p.attendance
       from activity_session_participants p join students s on s.id = p.student_id
      where p.activity_id in (:ids) and coalesce(s.is_demo, false) = false`,
    { ids: ids.length ? ids : none }
  ).catch((err) => {
    if (err.parent?.code === '42P01') return [];
    throw err;
  });

  const now = today();
  const dateOf = (o) => day(o.date);
  const cancelled = outings.filter((o) => o.status === 'annulée');
  const kept = outings.filter((o) => o.status !== 'annulée');
  const held = kept.filter((o) => dateOf(o) <= now);
  const coming = kept.filter((o) => dateOf(o) > now);
  const heldIds = new Set(held.map((o) => o.id));
  const sessions = sessionFigures({
    outings: kept.map((o) => ({ ...o, date: dateOf(o) })),
    participants: sessionRows,
    now,
  });

  // Children registered (not withdrawn) to the outings that took place
  const registered = regs.filter((r) => r.status === 'inscrit' && heldIds.has(r.activity_id));
  const marked = registered.filter((r) => r.attendance);
  const present = registered.filter((r) => r.attendance === 'présent');
  const absent = registered.filter((r) => r.attendance === 'absent' || r.attendance === 'excusé');
  const children = [...new Map(registered.map((r) => [r.student_id, r])).values()];
  const adults = staff.filter((s) => heldIds.has(s.activity_id));
  const volunteers = new Set(adults.filter((s) => s.user_id).map((s) => s.user_id));
  const spent = expenses.filter((e) => heldIds.has(e.activity_id)).reduce((n, e) => n + Number(e.amount || 0), 0);
  const collected = registered.reduce((n, r) => n + Number(r.paid_amount || 0), 0);
  // Hours the children spent on outings (outing length x present children)
  const childHours = held.reduce((n, o) => {
    const h = hoursBetween(o.start_time, o.end_time);
    const count = registered.filter((r) => r.activity_id === o.id && r.attendance !== 'absent' && r.attendance !== 'excusé').length;
    return n + (h ? h * count : 0);
  }, 0);

  const perOuting = (o) => {
    const mine = regs.filter((r) => r.activity_id === o.id);
    return {
      id: o.id,
      title: o.title,
      kind: o.kind || 'Non précisé',
      date: dateOf(o),
      status: o.status === 'annulée' ? 'annulée' : dateOf(o) <= now ? 'réalisée' : 'à venir',
      registered: mine.filter((r) => r.status === 'inscrit').length,
      present: mine.filter((r) => r.status === 'inscrit' && r.attendance === 'présent').length,
      marked: mine.some((r) => r.attendance),
      places: o.places,
      adults: staff.filter((s) => s.activity_id === o.id).length,
      // Preparation and return sessions (null for a cancelled outing)
      prep: sessions.byOuting[o.id]?.prep ?? null,
      debrief: sessions.byOuting[o.id]?.debrief ?? null,
      bilan: sessions.byOuting[o.id]?.bilan ?? false,
    };
  };

  return {
    year: label,
    from,
    to,
    complete,
    figures: {
      outings: held.length,
      coming: coming.length,
      cancelled: cancelled.length,
      registrations: registered.length,
      children: children.length,
      present: present.length,
      // Rate on the outings where the presence was taken
      attendance_rate: pct(present.length, present.length + absent.length),
      marked: marked.length,
      tutored: children.filter((c) => c.tutored).length,
      adults: adults.length,
      volunteers: volunteers.size,
      child_hours: Math.round(childHours),
      spent: round(spent),
      collected: round(collected),
      cost_per_child: registered.length ? round((spent - collected) / registered.length) : null,
    },
    // Preparation sessions and bilans: apart from the outings' figures
    sessions: sessions.figures,
    kinds: list(countBy(held, (o) => o.kind || 'Non précisé')),
    cycles: list(countBy(children, (c) => cycleOf(c.level)), [...CYCLES.map(([c]) => c), 'Non renseigné']),
    priority: list(
      countBy(children, (c) =>
        !c.school?.name ? 'Établissement non renseigné' : c.school.rep ? c.school.rep : 'Hors éducation prioritaire'
      ),
      ['REP+', 'REP', 'Hors éducation prioritaire', 'Établissement non renseigné']
    ),
    months: Object.entries(countBy(held, (o) => dateOf(o).slice(0, 7)))
      .sort()
      .map(([month, count]) => ({ month, count })),
    outings: outings.map(perOuting),
  };
};
