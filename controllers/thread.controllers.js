import { Op } from 'sequelize';
import db from '../config/database.js';
import Users from '../models/users.model.js';
import { InternalMessages, ThreadReads } from '../models/thread.model.js';
import { STAFF_ROLES } from '../middlewares/authAdmin.js';
import sendEmail from '../config/sendEmails.js';
import { escapeHtml, clientUrl, emailButton } from '../config/notify.js';

const MAX_LENGTH = 5000;

const fullName = (user) =>
  [user.first_name, user.last_name].filter(Boolean).join(' ');

const currentUserId = (req) => Number(req.user.userid ?? req.user.userId);

const teamMembers = () =>
  Users.findAll({
    where: { role: { [Op.in]: STAFF_ROLES } },
    attributes: ['id', 'first_name', 'last_name', 'email'],
    order: [['first_name', 'ASC']],
  });

const markRead = (userId, subjectId) =>
  ThreadReads.upsert({
    user_id: userId,
    subject_id: subjectId,
    last_read_at: new Date(),
  });

// Messages about a volunteer; opening the discussion marks it as read
export const getThread = async (req, res) => {
  const subjectId = Number(req.params.userId);
  const me = currentUserId(req);
  try {
    const messages = await InternalMessages.findAll({
      where: { subject_id: subjectId },
      order: [['created_at', 'ASC']],
    });
    const team = await teamMembers();
    await markRead(me, subjectId);
    res.json({
      me,
      messages,
      team: team.map((u) => ({ id: u.id, name: fullName(u) })),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the discussion' });
  }
};

const notifyMentions = async ({ author, subject, message, team }) => {
  const recipients = team.filter(
    (u) => message.mentions.includes(u.id) && u.id !== author.id && u.email
  );
  for (const recipient of recipients) {
    sendEmail(
      recipient.email,
      `${fullName(author)} vous a mentionné sur la fiche de ${fullName(subject)}`,
      `<p>Bonjour ${escapeHtml(recipient.first_name)},</p>
      <p>${escapeHtml(fullName(author))} vous a mentionné dans le fil de discussion interne de <b>${escapeHtml(
        fullName(subject)
      )}</b> :</p>
      <blockquote style="border-left:3px solid #00695c;margin:0;padding:4px 12px;white-space:pre-wrap">${escapeHtml(
        message.content
      )}</blockquote>
      <p>${emailButton(
        `${clientUrl()}/login?candidat=${subject.id}`,
        'Voir la fiche'
      )}</p>`
    ).catch((err) => console.log('Mention email not sent:', err.message));
  }
};

// Body: { content, mentions: [userId] } or { kind: 'whatsapp' }
export const addMessage = async (req, res) => {
  const subjectId = Number(req.params.userId);
  const me = currentUserId(req);
  const kind = req.body.kind === 'whatsapp' ? 'whatsapp' : 'message';
  try {
    const subject = await Users.findByPk(subjectId, {
      attributes: ['id', 'first_name', 'last_name'],
    });
    if (!subject) return res.status(404).json({ error: 'User not found' });
    const author = await Users.findByPk(me, {
      attributes: ['id', 'first_name', 'last_name'],
    });

    let content;
    let mentions = [];
    let team = [];
    if (kind === 'whatsapp') {
      content = `a contacté ${fullName(subject)} par WhatsApp`;
    } else {
      content = String(req.body.content || '').trim();
      if (!content) return res.status(400).json({ error: 'Message vide' });
      if (content.length > MAX_LENGTH) {
        return res.status(400).json({ error: 'Message trop long' });
      }
      // Only team members can be mentioned
      team = await teamMembers();
      const wanted = new Set((req.body.mentions || []).map(Number));
      mentions = team.filter((u) => wanted.has(u.id)).map((u) => u.id);
    }

    const message = await InternalMessages.create({
      subject_id: subjectId,
      author_id: me,
      author_name: fullName(author),
      kind,
      content,
      mentions,
    });
    await markRead(me, subjectId);
    if (mentions.length) notifyMentions({ author, subject, message, team });
    res.status(201).json(message);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not save the message' });
  }
};

// Everyone can only delete their own messages
export const deleteMessage = async (req, res) => {
  try {
    const message = await InternalMessages.findByPk(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.author_id !== currentUserId(req)) {
      return res
        .status(403)
        .json({ error: 'Vous ne pouvez supprimer que vos messages' });
    }
    await message.destroy();
    res.json({ deleted: message.id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not delete the message' });
  }
};

// Unread messages per volunteer for the current team member:
// { [volunteerId]: count }, own messages excluded
export const getUnreadCounts = async (req, res) => {
  try {
    const rows = await db.query(
      `select m.subject_id, count(*)::int as unread
       from internal_messages m
       left join thread_reads r
         on r.subject_id = m.subject_id and r.user_id = :me
       where m.author_id is distinct from :me
         and (r.last_read_at is null or m.created_at > r.last_read_at)
       group by m.subject_id`,
      { replacements: { me: currentUserId(req) }, type: 'SELECT' }
    );
    res.json(Object.fromEntries(rows.map((r) => [r.subject_id, r.unread])));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not count unread messages' });
  }
};
