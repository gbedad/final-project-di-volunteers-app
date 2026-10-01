import { S3Client } from '@aws-sdk/client-s3';
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

// Public URL saved in the database for an uploaded file
export const publicFileUrl = (file) =>
  process.env.FILES_PUBLIC_URL
    ? `${process.env.FILES_PUBLIC_URL.replace(/\/$/, '')}/${file.key}`
    : file.location;

export default s3;
