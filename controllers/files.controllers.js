import dotenv from 'dotenv';
import { Op } from 'sequelize';
import File from '../models/files.model.js';
import Users from '../models/users.model.js';
import { fileUrl, deleteStoredFile } from '../config/aws.config.js';

dotenv.config();

const STAFF = ['superadmin', 'admin', 'interviewer'];
const MANAGERS = ['superadmin', 'admin'];

// The access token holds "userid" after login and "userId" after a refresh
const requesterId = (user) => Number(user?.userid ?? user?.userId);

const isOwner = (user, file) => requesterId(user) === file.userId;
const canView = (user, file) => STAFF.includes(user?.role) || isOwner(user, file);
const canDelete = (user, file) =>
  MANAGERS.includes(user?.role) || isOwner(user, file);

const folderOf = (path) =>
  /(^|\/)conventions\//.test(path) ? 'Convention' : 'Document';

const removeFile = async (file) => {
  try {
    await deleteStoredFile(file.path);
  } catch (err) {
    // Still remove the database entry, e.g. if the file was already gone
    console.log('Could not delete from storage:', err.message);
  }
  await file.destroy();
};

export const uploadFile = async (req, res) => {
  const userId = req.params.userId;
  try {
    const { originalname, mimetype, key } = req.file;

    const newfile = await File.create({
      filename: originalname,
      mimetype,
      path: key,
      userId,
    });
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
        type: folderOf(f.path),
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
