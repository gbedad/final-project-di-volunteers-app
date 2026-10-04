import dotenv from 'dotenv';
import { Op } from 'sequelize';
import File from '../models/files.model.js';
import Users from '../models/users.model.js';
import { fileUrl, deleteStoredFile } from '../config/aws.config.js';
import {
  DOC_TYPES,
  updateReceivedFlag,
  applicationProgress,
  submitApplication as submit,
  documentsStatus,
  setPaperDocument,
  RECEIVED_FLAGS,
} from '../services/application.js';

dotenv.config();

const STAFF = ['superadmin', 'admin', 'interviewer'];
const MANAGERS = ['superadmin', 'admin'];

// The access token holds "userid" after login and "userId" after a refresh
const requesterId = (user) => Number(user?.userid ?? user?.userId);

const isOwner = (user, file) => requesterId(user) === file.userId;
const canView = (user, file) => STAFF.includes(user?.role) || isOwner(user, file);
const canDelete = (user, file) =>
  MANAGERS.includes(user?.role) || isOwner(user, file);

const TYPE_LABELS = {
  cv: 'CV',
  id: "Pièce d'identité",
  b3: 'Casier judiciaire',
  convention: 'Convention',
  other: 'Autre document',
};

const typeLabel = (file) =>
  TYPE_LABELS[file.doc_type] ||
  (/(^|\/)conventions\//.test(file.path) ? 'Convention' : 'Autre document');

const removeFile = async (file) => {
  try {
    await deleteStoredFile(file.path);
  } catch (err) {
    // Still remove the database entry, e.g. if the file was already gone
    console.log('Could not delete from storage:', err.message);
  }
  await file.destroy();
  await updateReceivedFlag(file.userId, file.doc_type);
};

export const uploadFile = async (req, res) => {
  const userId = req.params.userId;
  try {
    const { originalname, mimetype, key } = req.file;
    const isConvention = /^conventions\//.test(key);
    const docType = isConvention
      ? 'convention'
      : DOC_TYPES.includes(req.query.type)
      ? req.query.type
      : 'other';

    const newfile = await File.create({
      filename: originalname,
      mimetype,
      path: key,
      doc_type: docType,
      userId,
    });
    await updateReceivedFlag(Number(userId), docType);
    res.status(200).json(newfile);
  } catch (err) {
    console.log(err);
    res.status(500).send('An error occurred during file upload');
  }
};

export const cancelFile = async (req, res) => {
  try {
    const file = await File.findByPk(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!canDelete(req.user, file)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.locals.userId = file.userId;
    await removeFile(file);
    res.json({ message: 'File canceled successfully' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'An error occurred during file deletion' });
  }
};

// Temporary link to view/download a file: its owner or an admin only
export const getFileUrl = async (req, res) => {
  try {
    const file = await File.findOne({ where: { path: req.body.path } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!canView(req.user, file)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json({ url: await fileUrl(file.path) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not create the file link' });
  }
};

// ---- Admin documents page ----

export const adminListFiles = async (req, res) => {
  try {
    const files = await File.findAll({
      include: [
        {
          model: Users,
          attributes: ['id', 'first_name', 'last_name', 'email', 'status'],
        },
      ],
      order: [['id', 'DESC']],
    });
    res.json(
      files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mimetype: f.mimetype,
        path: f.path,
        type: typeLabel(f),
        doc_type: f.doc_type,
        uploaded_at: f.uploaded_at,
        user: f.user,
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list files' });
  }
};

export const adminDeleteFile = async (req, res) => {
  try {
    const file = await File.findByPk(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.locals.userId = file.userId;
    await removeFile(file);
    res.json({ message: 'File deleted' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'An error occurred during file deletion' });
  }
};

// Volunteers with at least one document not yet marked as received
export const adminMissingDocuments = async (req, res) => {
  const flags = [
    'cv_received',
    'id_received',
    'b3_received',
    'convention_received',
  ];
  try {
    const users = await Users.findAll({
      where: {
        role: 'volunteer',
        [Op.or]: flags.map((flag) => ({
          [flag]: { [Op.or]: [false, null] },
        })),
      },
      attributes: [
        'id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'status',
        ...flags,
      ],
      include: [{ model: File, as: 'file', attributes: ['id', 'path'] }],
      order: [['last_name', 'ASC']],
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        cv_received: !!u.cv_received,
        id_received: !!u.id_received,
        b3_received: !!u.b3_received,
        convention_received: !!u.convention_received,
        files_uploaded: u.file.length,
      }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not list missing documents' });
  }
};

// ---- Volunteer application checklist ----

export const getApplication = async (req, res) => {
  try {
    const progress = await applicationProgress(req.params.userId);
    if (!progress) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(progress);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the application' });
  }
};

export const submitApplication = async (req, res) => {
  try {
    const result = await submit(req.params.userId);
    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not submit the application' });
  }
};

// ---- Admin: documents received (uploaded file or paper) ----

export const getDocumentsStatus = async (req, res) => {
  try {
    const status = await documentsStatus(req.params.userId);
    if (!status) return res.status(404).json({ error: 'User not found' });
    res.json(status);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the documents' });
  }
};

// Body: { type, paper: true|false } or { voltaire: true|false }
export const updateDocumentsStatus = async (req, res) => {
  const { userId } = req.params;
  const { type, paper, voltaire } = req.body;
  try {
    if (typeof voltaire === 'boolean') {
      await Users.update(
        { test_voltaire_passed: voltaire },
        { where: { id: userId } }
      );
      return res.json(await documentsStatus(userId));
    }
    if (!RECEIVED_FLAGS[type] || typeof paper !== 'boolean') {
      return res.status(400).json({ error: 'Invalid document' });
    }
    const status = await setPaperDocument(userId, type, paper);
    if (!status) return res.status(404).json({ error: 'User not found' });
    res.json(status);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not update the documents' });
  }
};
