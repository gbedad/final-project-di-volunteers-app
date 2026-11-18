import { uploadTutorialVideo, TUTORIAL_VIDEO_MAX } from '../config/multer.js';
import { deleteStoredFile } from '../config/aws.config.js';
import { findTutorial, getTutorial, listTutorials, removeVideo, saveVideo } from '../services/tutorials.js';

const fail = (res, err, message) => {
  console.log(err);
  res.status(500).json({ error: message });
};

// Public (the link is sent to the tutors): the tutorials and their video
export const list = async (req, res) => {
  try {
    res.json(await listTutorials());
  } catch (err) {
    fail(res, err, 'Les tutoriels ne sont pas disponibles');
  }
};
export const one = async (req, res) => {
  try {
    const tutorial = await getTutorial(req.params.slug);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    res.json(tutorial);
  } catch (err) {
    fail(res, err, 'Le tutoriel n’est pas disponible');
  }
};

// Team (managers): the slug is checked before anything is sent to the storage
export const knownTutorial = (req, res, next) =>
  findTutorial(req.params.slug) ? next() : res.status(404).json({ error: 'Tutoriel introuvable' });
export const receiveVideo = (req, res, next) =>
  uploadTutorialVideo.single('video')(req, res, (err) => {
    if (!err) return next();
    res.status(400).json({
      error:
        err.code === 'LIMIT_FILE_SIZE'
          ? `Vidéo trop lourde (${Math.round(TUTORIAL_VIDEO_MAX / 1024 / 1024)} Mo au maximum)`
          : err.message || 'La vidéo n’a pas pu être envoyée',
    });
  });
export const sendVideo = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune vidéo' });
  try {
    await saveVideo(req.params.slug, req.file, req.user.userid);
    res.json(await getTutorial(req.params.slug));
  } catch (err) {
    // Not recorded: the file just sent is removed
    await deleteStoredFile(req.file.key).catch(() => {});
    fail(res, err, 'La vidéo n’a pas pu être enregistrée');
  }
};
export const deleteVideo = async (req, res) => {
  try {
    await removeVideo(req.params.slug);
    res.json(await getTutorial(req.params.slug));
  } catch (err) {
    fail(res, err, 'La vidéo n’a pas pu être supprimée');
  }
};
