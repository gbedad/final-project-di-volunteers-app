// Preparation sessions ("prep") and return sessions ("debrief", with its bilan)
// of the cultural outings: figures for the "Sorties" view and the outings part
// of the annual report. Pure functions: the caller reads the rows and gives
// "now" (YYYY-MM-DD, Paris). These sessions are not outings: their children
// are counted apart and never added to the outing figures.

// Émargement values (SESSION_ATTENDANCES in activities.js): late counts as present
const PRESENT = ["à l'heure", 'en retard'];
const ABSENT = ['excusé(e)', 'non excusé(e)'];
const pct = (n, total) => (total ? Math.round((n * 100) / total) : null);

// "11:00" - "16:30" -> 5.5 hours (null when unknown)
export const hoursBetween = (start, end) => {
  const m = (t) => /^(\d{1,2})[:h](\d{2})/.exec(t || '');
  const a = m(start);
  const b = m(end);
  if (!a || !b) return null;
  const h = (Number(b[1]) * 60 + Number(b[2]) - Number(a[1]) * 60 - Number(a[2])) / 60;
  return h > 0 ? h : null;
};

// The session of an outing, when it has a date: { date, start_time, end_time, … }
const sessionOf = (o, kind) => (o[kind]?.date ? o[kind] : null);

// Figures of one kind of session over the kept outings (not cancelled).
// outings: [{ id, date ('YYYY-MM-DD'), prep, debrief }] ; participants:
// [{ activity_id, kind, student_id, attendance }], children of demo students
// already left out.
const kindFigures = (kind, outings, participants, now) => {
  const planned = outings.filter((o) => sessionOf(o, kind));
  const done = planned.filter((o) => sessionOf(o, kind).date <= now);
  const doneIds = new Set(done.map((o) => o.id));
  const rows = participants.filter((p) => p.kind === kind && doneIds.has(p.activity_id));
  const present = rows.filter((p) => PRESENT.includes(p.attendance)).length;
  const absent = rows.filter((p) => ABSENT.includes(p.attendance)).length;
  // Hours the children spent (session length x children who came)
  const hours = done.reduce((n, o) => {
    const s = sessionOf(o, kind);
    const h = hoursBetween(s.start_time, s.end_time);
    const count = participants.filter(
      (p) => p.kind === kind && p.activity_id === o.id && !ABSENT.includes(p.attendance)
    ).length;
    return n + (h ? h * count : 0);
  }, 0);
  return {
    sessions: done.length,
    coming: planned.length - done.length,
    participations: rows.length,
    children: new Set(rows.map((p) => p.student_id)).size,
    marked: rows.filter((p) => p.attendance).length,
    present,
    // Rate on the sessions where the presence was taken
    attendance_rate: pct(present, present + absent),
    hours: Math.round(hours),
  };
};

// The sessions of one outing, as shown in the table of the "Sorties" view
const perOuting = (o, participants, now) => {
  const of = (kind) => {
    const s = sessionOf(o, kind);
    if (!s) return null;
    const mine = participants.filter((p) => p.kind === kind && p.activity_id === o.id);
    return {
      date: s.date,
      status: s.date <= now ? 'réalisée' : 'à venir',
      children: mine.length,
      marked: mine.some((p) => p.attendance),
    };
  };
  return {
    prep: of('prep'),
    debrief: of('debrief'),
    // Only whether a bilan was written, never its text (children are named in it)
    bilan: Boolean(String(o.debrief?.bilan || '').trim()),
  };
};

// outings: the kept outings of the year, dates as 'YYYY-MM-DD'
export const sessionFigures = ({ outings, participants, now }) => {
  const realised = outings.filter((o) => o.date <= now);
  const written = realised.filter((o) => String(o.debrief?.bilan || '').trim()).length;
  return {
    figures: {
      prep: kindFigures('prep', outings, participants, now),
      debrief: kindFigures('debrief', outings, participants, now),
      // Bilans written over the outings that took place
      bilans: { outings: realised.length, written },
    },
    // Per outing, keyed by its id
    byOuting: Object.fromEntries(outings.map((o) => [o.id, perOuting(o, participants, now)])),
  };
};
