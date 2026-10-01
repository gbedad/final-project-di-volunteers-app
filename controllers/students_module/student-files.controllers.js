import dotenv from 'dotenv';
import File from '../../models/students/studentsFiles.model.js';
import { fileUrl, deleteStoredFile } from '../../config/aws.config.js';

dotenv.config();

// All routes using these handlers are admin-only
export const uploadFile = async (req, res) => {
  const studentId = req.params.studentId;
  try {
    const { originalname, mimetype, key } = req.file;

    const newfile = await File.create({
      filename: originalname,
      mimetype,
      path: key,
      studentId,
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
    try {
      await deleteStoredFile(file.path);
    } catch (err) {
      console.log('Could not delete from storage:', err.message);
    }
    await file.destroy();
    res.json({ message: 'File canceled successfully' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'An error occurred during file deletion' });
  }
};

export const getFileUrl = async (req, res) => {
  try {
    const file = await File.findOne({ where: { path: req.body.path } });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json({ url: await fileUrl(file.path) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not create the file link' });
  }
};
