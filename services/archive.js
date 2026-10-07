// Archiving of former volunteers: the account and its history are kept,
// the person no longer appears day to day and can no longer log in
import { Op } from 'sequelize';
import Users from '../models/users.model.js';
import Files from '../models/files.model.js';
import Binomes from '../models/binomes.model.js';
import Students from '../models/students/students.model.js';
import StatusChanges from '../models/statusChanges.model.js';
import { deleteStoredFile } from '../config/aws.config.js';
import { updateReceivedFlag } from './application.js';
import { recordStatusChange } from './statusHistory.js';
import { OPEN_PAIR_STATUSES } from './matching.js';

export const ARCHIVED = 'Archivé';
// Documents not to keep once the person has left (CNIL)
const SENSITIVE_TYPES = ['b3', 'id'];

// Pairs that must be ended first: [{ id, student }]
export const openPairsOf = async (userId) => {
  const pairs = await Binomes.findAll({
    where: { tutor_id: userId, status: { [Op.in]: OPEN_PAIR_STATUSES } },
    attributes: ['id', 'student_id', 'status'],
    raw: true,
  });
  const students = await Students.findAll({
    where: { id: pairs.map((p) => p.student_id) },
    attributes: ['id', 'first_name', 'last_name'],
    raw: true,
  });
  return pairs.map((p) => {
    const s = students.find((x) => x.id === p.student_id);
    return { id: p.id, status: p.status, student: s ? `${s.first_name} ${s.last_name}` : '' };
  });
};

const deleteSensitiveFiles = async (userId) => {
  const files = await Files.findAll({
    where: { userId, doc_type: { [Op.in]: SENSITIVE_TYPES } },
  });
  for (const file of files) {
    try {
      await deleteStoredFile(file.path);
    } catch (err) {
      console.log('Could not delete from storage:', err.message);
    }
    await file.destroy();
  }
  for (const type of SENSITIVE_TYPES) await updateReceivedFlag(userId, type);
  return files.length;
};

// { ok, deletedFiles } or { error, code, openPairs }
export const archiveUser = async (userId, { reason, deleteSensitive, by } = {}) => {
  const user = await Users.findOne({
    where: { id: userId, role: 'volunteer' },
    attributes: ['id', 'status'],
  });
  if (!user) return { error: 'Bénévole introuvable', code: 404 };
  if (user.status === ARCHIVED) return { error: 'Déjà archivé', code: 409 };
  const openPairs = await openPairsOf(user.id);
  if (openPairs.length) {
    return {
      error: 'Des binômes sont en cours : terminez-les avant d’archiver',
      code: 409,
      openPairs,
    };
  }
  const deletedFiles = deleteSensitive ? await deleteSensitiveFiles(user.id) : 0;
  await Users.update(
    {
      status: ARCHIVED,
      is_active: false,
      is_available: false,
      archived_at: new Date(),
      archive_reason: reason?.trim() || null,
    },
    { where: { id: user.id } }
  );
  await recordStatusChange(user.id, user.status, ARCHIVED, by);
  return { ok: true, deletedFiles };
};

// Back to the status before the archiving (from the status history)
export const unarchiveUser = async (userId, { by } = {}) => {
  const user = await Users.findOne({
    where: { id: userId, role: 'volunteer' },
    attributes: ['id', 'status'],
  });
  if (!user) return { error: 'Bénévole introuvable', code: 404 };
  if (user.status !== ARCHIVED) return { error: 'Ce compte n’est pas archivé', code: 409 };
  const last = await StatusChanges.findOne({
    where: { user_id: user.id, to_status: ARCHIVED },
    order: [['changed_at', 'DESC']],
  });
  const status = last?.from_status && last.from_status !== ARCHIVED ? last.from_status : 'Validé';
  await Users.update(
    { status, archived_at: null, archive_reason: null },
    { where: { id: user.id } }
  );
  await recordStatusChange(user.id, ARCHIVED, status, by);
  return { ok: true, status };
};
