// "Consignes" of the cultural outings: one text for all the outings, in the
// WhatsApp format (*bold*, _italic_, ~struck~, "- " lists), copied into the
// messages to the families.
import db from '../config/database.js';

export const MAX_LENGTH = 10000;
const q = async (sql, replacements = {}) => (await db.query(sql, { replacements, logging: false }))[0];

const empty = { body: '', updated_at: null, updated_by: null };
const read = async () => {
  try {
    const [row] = await q(
      `select g.body, g.updated_at,
              nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') as updated_by
         from outing_guidelines g left join users u on u.id = g.updated_by where g.id = 1`
    );
    return row || empty;
  } catch (err) {
    // Before the migration the table does not exist: no text yet
    if (err.parent?.code === '42P01') return empty;
    throw err;
  }
};
export const getGuidelines = read;

export const saveGuidelines = async (body, userId) => {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  if (text.length > MAX_LENGTH) return { error: `Texte trop long (${MAX_LENGTH} caractères au maximum)` };
  await q(
    `insert into outing_guidelines (id, body, updated_by, updated_at) values (1, :text, :userId, now())
     on conflict (id) do update set body = :text, updated_by = :userId, updated_at = now()`,
    { text, userId }
  );
  return { guidelines: await read() };
};
