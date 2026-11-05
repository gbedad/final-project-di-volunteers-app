// Tutor profiles whose subjects / slots were saved encoded twice (an import
// of 2026-10-26): the tutor page crashed on them. Dry run by default;
// --apply writes, in one transaction.
import db from '../config/database.js';
import '../models/users.model.js';
import Skills from '../models/skills.model.js';

const apply = process.argv.includes('--apply');
const twice = (e) => {
  try {
    return typeof JSON.parse(e) === 'string';
  } catch {
    return false;
  }
};
// Stored as objects, like the profile page saves them
const unwrap = (arr) => (arr || []).map((e) => (twice(e) ? JSON.parse(JSON.parse(e)) : e));
const label = (e) => (typeof e === 'string' ? JSON.parse(e) : e);

await db.transaction(async (transaction) => {
  const skills = await Skills.findAll({ transaction });
  const bad = skills.filter((s) => [...(s.topics || []), ...(s.when_day_slot || [])].some(twice));
  for (const s of bad) {
    const topics = unwrap(s.topics);
    const when_day_slot = unwrap(s.when_day_slot);
    console.log(
      `tuteur #${s.userId} :`,
      topics.map((t) => label(t).subject).join(', '),
      '|',
      when_day_slot.map((t) => `${label(t).day} ${label(t).startTime}`).join(', ')
    );
    if (apply) await s.update({ topics, when_day_slot }, { transaction });
  }
  console.log(`${bad.length} profil(s) ${apply ? 'corrigé(s)' : 'à corriger (simulation)'}`);
});
await db.close();
