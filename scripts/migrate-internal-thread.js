// One-off migration for the internal discussion:
//  - creates the internal_messages and thread_reads tables
//  - copies the old messages of users.internal_thread (the column is kept
//    untouched as a backup); the author is found from the first name when
//    only one team member has it
//  - marks the copied messages as read for the whole team
//   node scripts/migrate-internal-thread.js          -> dry run, changes nothing
//   node scripts/migrate-internal-thread.js --apply  -> writes the changes
import db from '../config/database.js';

const apply = process.argv.includes('--apply');
const q = async (sql, replacements) =>
  (await db.query(sql, { replacements, logging: false }))[0];

const team = await q(
  `select id, first_name, last_name from users
   where role in ('superadmin', 'admin', 'interviewer')`
);
const authorOf = (sender) => {
  const matches = team.filter((u) => u.first_name === sender);
  return matches.length === 1 ? matches[0] : null;
};

const users = await q(
  `select id, first_name, last_name, internal_thread from users
   where cardinality(internal_thread) > 0`
);
const messages = users.flatMap((u) =>
  u.internal_thread
    .filter((m) => m && String(m.content || '').trim())
    .map((m) => {
      const author = authorOf(m.sender);
      return {
        subject_id: u.id,
        subject: `${u.first_name} ${u.last_name}`,
        author_id: author ? author.id : null,
        author_name: author
          ? `${author.first_name} ${author.last_name}`
          : m.sender || 'Inconnu',
        content: String(m.content).trim(),
        created_at: new Date(m.timestamp || Date.now()),
      };
    })
);
console.log(`${messages.length} message(s) to copy:`);
for (const m of messages) {
  console.log(
    `  #${m.subject_id} ${m.subject} | ${m.author_name} (id ${m.author_id}) | ${m.created_at.toISOString()} | ${m.content.slice(0, 60)}`
  );
}

if (apply) {
  await db.transaction(async (transaction) => {
    const run = (sql, replacements) =>
      db.query(sql, { replacements, transaction, logging: false });
    await run(`CREATE TABLE IF NOT EXISTS internal_messages (
      id SERIAL PRIMARY KEY,
      subject_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(255) NOT NULL,
      kind VARCHAR(255) NOT NULL DEFAULT 'message',
      content TEXT NOT NULL,
      mentions INTEGER[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
    await run(`CREATE INDEX IF NOT EXISTS internal_messages_subject_id_created_at
      ON internal_messages (subject_id, created_at)`);
    await run(`CREATE TABLE IF NOT EXISTS thread_reads (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, subject_id)
    )`);
    // Copy only once: skip volunteers whose discussion already has messages
    const [existing] = await run(
      'select distinct subject_id from internal_messages'
    );
    const done = new Set(existing.map((r) => r.subject_id));
    for (const m of messages.filter((m) => !done.has(m.subject_id))) {
      await run(
        `insert into internal_messages
           (subject_id, author_id, author_name, kind, content, created_at)
         values (:subject_id, :author_id, :author_name, 'message', :content, :created_at)`,
        m
      );
    }
    for (const subjectId of new Set(messages.map((m) => m.subject_id))) {
      for (const member of team) {
        await run(
          `insert into thread_reads (user_id, subject_id, last_read_at)
           values (:user, :subject, now()) on conflict do nothing`,
          { user: member.id, subject: subjectId }
        );
      }
    }
    await run(
      `insert into "SequelizeMeta"(name) values ('20261005130000-internal-messages.cjs')
       on conflict do nothing`
    );
  });
  console.log('Applied.');
} else {
  console.log('Dry run only. Add --apply to write these changes.');
}
await db.close();
