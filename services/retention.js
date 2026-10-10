// Storage limitation (RGPD): the interview notes of a volunteer are erased
// 2 years after a declined application or after the archiving. Kept: name,
// e-mail, dates and status history (proof of what was decided and when).
// Erased: interviews, pre-interview, motivation text, internal discussion,
// CV files.
import db from '../config/database.js';
import { deleteStoredFile } from '../config/aws.config.js';

export const RETENTION_YEARS = 2;

// Volunteers whose notes are due: declined (date of the last change to
// "Déclinée", else the last update) or archived, more than 2 years ago
export const dueForPurge = async () => {
  const [rows] = await db.query(
    `select u.id, u.first_name, u.last_name, u.status,
            coalesce(
              case when u.status = 'Archivé' then u.archived_at end,
              (select max(c.changed_at) from status_changes c
                where c.user_id = u.id and c.to_status = u.status),
              u.updated_at
            ) as since
       from users u
      where u.role = 'volunteer'
        and u.status in ('Déclinée', 'Archivé')
        and u.data_purged_at is null`,
    { logging: false }
  );
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - RETENTION_YEARS);
  return rows.filter((r) => r.since && new Date(r.since) < limit);
};

export const purgeVolunteer = async (id) => {
  const [files] = await db.query(
    `select id, path from files where "userId" = :id and doc_type = 'cv'`,
    { replacements: { id }, logging: false }
  );
  for (const f of files) {
    await deleteStoredFile(f.path).catch((err) =>
      console.log('Retention: file not deleted from storage:', err.message)
    );
  }
  await db.transaction(async (transaction) => {
    const run = (sql) => db.query(sql, { replacements: { id }, transaction, logging: false });
    await run(`delete from files where "userId" = :id and doc_type = 'cv'`);
    await run('delete from internal_messages where subject_id = :id');
    await run('delete from thread_reads where subject_id = :id');
    await run(
      `update users set interviews = null, pre_interview = null, message = null,
              data_purged_at = now()
        where id = :id`
    );
  });
};

export const purgeExpired = async () => {
  const due = await dueForPurge();
  for (const v of due) await purgeVolunteer(v.id);
  return due.length;
};

// Once a day is enough (checked every 6 hours, like the other jobs)
export const scheduleRetention = () => {
  const run = () =>
    purgeExpired()
      .then((n) => n && console.log(`Retention: notes of ${n} volunteer(s) erased`))
      .catch((err) => console.log('Retention failed:', err.message));
  setTimeout(run, 3 * 60 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
};
