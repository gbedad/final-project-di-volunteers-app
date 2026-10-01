import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

// S3-compatible storage (Cloudflare R2). For R2, S3_ENDPOINT is
// https://<account_id>.r2.cloudflarestorage.com and AWS_REGION is "auto".
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT || undefined,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Public bucket: mission pictures. Private bucket: volunteer/student documents.
export const PUBLIC_BUCKET = process.env.AWS_BUCKET_NAME;
export const PRIVATE_BUCKET =
  process.env.PRIVATE_BUCKET_NAME || process.env.AWS_BUCKET_NAME;

// Public URL saved in the database for an uploaded public file
export const publicFileUrl = (file) =>
  process.env.FILES_PUBLIC_URL
    ? `${process.env.FILES_PUBLIC_URL.replace(/\/$/, '')}/${file.key}`
    : file.location;

// Private files are stored in the database by key (documents/12/...),
// public ones by full URL (https://...)
export const isPrivatePath = (path) => !/^https?:\/\//.test(path);

const locate = (path) =>
  isPrivatePath(path)
    ? { Bucket: PRIVATE_BUCKET, Key: path }
    : {
        Bucket: PUBLIC_BUCKET,
        Key: decodeURIComponent(new URL(path).pathname.slice(1)),
      };

// URL the browser can open: public URL as is, private file via a 1h signed link
export const fileUrl = async (path, expiresIn = 3600) =>
  isPrivatePath(path)
    ? getSignedUrl(s3, new GetObjectCommand(locate(path)), { expiresIn })
    : path;

export const deleteStoredFile = (path) =>
  s3.send(new DeleteObjectCommand(locate(path)));

// Storage key from the uploaded file name: no spaces/accents, unique per upload
export const safeFileName = (originalname) =>
  `${Date.now()}-${originalname
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')}`;

export default s3;
