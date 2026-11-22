// Video tutorials, for the tutors (phone): the CATALOGUE below says which
// exist; the video of each is sent by the team from the "Documents" page and
// kept in the private storage (table tutorial_videos, one row per slug).
// To add a tutorial: see CLAUDE.md, section "Tutoriels vidéo".
import db from '../config/database.js';
import { deleteStoredFile, fileUrl } from '../config/aws.config.js';

export const CATALOGUE = [
  {
    slug: 'emargement',
    title: 'Émarger une séance et écrire le compte-rendu',
    description:
      "À la fin de la séance : indiquer la présence de l'élève, faire signer l'élève, puis écrire le compte-rendu.",
    audience: 'tuteurs',
    minutes: 1,
  },
  {
    slug: 'seance-supplementaire',
    title: 'Séance supplémentaire : écrire le compte-rendu',
    description:
      "Une séance ajoutée par l'association (souvent à distance, sur Zoom) : écrire le compte-rendu sans émarger, en corrigeant la durée réelle.",
    audience: 'tuteurs',
    minutes: 1,
  },
  {
    slug: 'seance-hors-creneau',
    title: 'Séance en plus : la déclarer',
    description:
      "Une deuxième séance le même jour, en plus du créneau : la déclarer avec ses horaires, puis émarger la séance en plus.",
    audience: 'tuteurs',
    minutes: 1,
  },
  {
    slug: 'seance-deplacee',
    title: 'Créneau déplacé : le déclarer',
    description:
      "Le créneau du jour a eu lieu à un autre horaire : indiquer le nouvel horaire, puis émarger la séance déplacée.",
    audience: 'tuteurs',
    minutes: 1,
  },
  {
    slug: 'seance-sans-creneau',
    title: 'Séance sans créneau : la déclarer',
    description:
      "Une séance le jour où l'élève n'a pas de créneau : la déclarer depuis la fiche de l'élève, puis l'émarger.",
    audience: 'tuteurs',
    minutes: 1,
  },
];

export const findTutorial = (slug) => CATALOGUE.find((t) => t.slug === slug) || null;

const q = (sql, replacements) => db.query(sql, { replacements, logging: false }).then(([rows]) => rows);
// Before the migration the table does not exist: no video yet
const rows = async (sql, replacements) => {
  try {
    return await q(sql, replacements);
  } catch (err) {
    if (err.parent?.code === '42P01') return [];
    throw err;
  }
};

// has_file: the video is in the storage (team); has_video: the tutors see it,
// which needs the video to be published (team switch in Documents)
const shown = (tutorial, video) => ({
  ...tutorial,
  has_file: !!video,
  has_video: !!video && !!video.published,
  published: !!video && !!video.published,
  filename: video?.filename || null,
  size: video ? Number(video.size) : null,
  uploaded_at: video?.uploaded_at || null,
});

// Every tutorial of the catalogue, with whether its video is there and published
export const listTutorials = async () => {
  const videos = await rows('select slug, filename, size, uploaded_at, published from tutorial_videos');
  return CATALOGUE.map((t) => shown(t, videos.find((v) => v.slug === t.slug)));
};

// One tutorial with a link to play its video (6 hours: long enough to watch it)
export const getTutorial = async (slug) => {
  const tutorial = findTutorial(slug);
  if (!tutorial) return null;
  const [video] = await rows('select * from tutorial_videos where slug = :slug', { slug });
  const published = !!video && !!video.published;
  return {
    ...shown(tutorial, video),
    url: published ? await fileUrl(video.video_key, 6 * 3600) : null,
  };
};

// Team: the tutors see the video (or not). Needs a video in the storage.
export const setPublished = async (slug, published) => {
  const [video] = await rows('select slug from tutorial_videos where slug = :slug', { slug });
  if (!video) return false;
  await q('update tutorial_videos set published = :published where slug = :slug', { slug, published: !!published });
  return true;
};

// The new video replaces the previous one (same link for the tutors)
export const saveVideo = async (slug, file, userId) => {
  const [old] = await rows('select video_key from tutorial_videos where slug = :slug', { slug });
  await q(
    `insert into tutorial_videos (slug, video_key, filename, size, content_type, uploaded_by, uploaded_at)
     values (:slug, :key, :filename, :size, :type, :userId, now())
     on conflict (slug) do update set video_key = :key, filename = :filename, size = :size,
       content_type = :type, uploaded_by = :userId, uploaded_at = now()`,
    { slug, key: file.key, filename: file.originalname, size: file.size, type: file.contentType || file.mimetype, userId }
  );
  if (old && old.video_key !== file.key) await deleteStoredFile(old.video_key).catch(() => {});
};

export const removeVideo = async (slug) => {
  const [old] = await rows('select video_key from tutorial_videos where slug = :slug', { slug });
  if (!old) return false;
  await q('delete from tutorial_videos where slug = :slug', { slug });
  await deleteStoredFile(old.video_key).catch(() => {});
  return true;
};
