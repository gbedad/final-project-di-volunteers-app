// Moves volunteer/student documents from the public bucket to the private one
// and stores their key instead of a public URL.
//   node scripts/move-documents-private.js           -> dry run, changes nothing
//   node scripts/move-documents-private.js --apply   -> moves files, updates DB
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import db from '../config/database.js';
import s3, { PUBLIC_BUCKET, PRIVATE_BUCKET } from '../config/aws.config.js';

const apply = process.argv.includes('--apply');

if (!PRIVATE_BUCKET || PRIVATE_BUCKET === PUBLIC_BUCKET) {
  console.log('PRIVATE_BUCKET_NAME must be set to a different bucket.');
  process.exit(1);
}

const exists = async (Key, Bucket = PUBLIC_BUCKET) => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch {
    return false;
  }
};

const copyToPrivate = (Key) =>
  s3.send(
    new CopyObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key,
      CopySource: `${PUBLIC_BUCKET}/${Key.split('/').map(encodeURIComponent).join('/')}`,
    })
  );

let moved = 0;
const missing = [];

for (const table of ['files', 'student_files']) {
  const [rows] = await db.query(
    `select id, path from ${table} where path like 'http%'`,
    { logging: false }
  );
  for (const { id, path } of rows) {
    const Key = decodeURIComponent(new URL(path).pathname.slice(1));
    if (!(await exists(Key))) {
      missing.push(`${table} #${id}: ${Key}`);
      continue;
    }
    if (apply) {
      await copyToPrivate(Key);
      await db.query(`update ${table} set path = :Key where id = :id`, {
        replacements: { Key, id },
        logging: false,
      });
      await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key }));
    }
    moved++;
  }

  // Already stored as a private key but uploaded to the public bucket
  // (before PRIVATE_BUCKET_NAME was set): move the file, the DB is already right
  const [keyRows] = await db.query(
    `select id, path from ${table} where path not like 'http%'`,
    { logging: false }
  );
  for (const { id, path: Key } of keyRows) {
    if (await exists(Key, PRIVATE_BUCKET)) continue;
    if (!(await exists(Key))) {
      missing.push(`${table} #${id}: ${Key}`);
      continue;
    }
    if (apply) {
      await copyToPrivate(Key);
      await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key }));
    }
    moved++;
  }
}

console.log(`${apply ? 'Moved' : 'Would move'}: ${moved} file(s)`);
console.log(`Not found in the public bucket (left unchanged): ${missing.length}`);
missing.forEach((m) => console.log('  -', m));
if (!apply) console.log('\nDry run only. Add --apply to do it.');
await db.close();
