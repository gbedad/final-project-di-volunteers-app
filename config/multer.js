import multerS3 from 'multer-s3';
import multer from 'multer';
import s3, {
  PUBLIC_BUCKET,
  PRIVATE_BUCKET,
  safeFileName,
} from './aws.config.js';

// Private document upload into <folder>/<owner id>/<timestamp>-<name>
const privateUpload = (folder, ownerParam) =>
  multer({
    storage: multerS3({
      s3,
      bucket: PRIVATE_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        // The document type in the name makes the bucket easy to browse:
        // documents/155/cv-1790...-dupont.pdf
        const type =
          folder === 'conventions'
            ? 'convention'
            : ['cv', 'id', 'b3'].includes(req.query.type)
            ? req.query.type
            : 'autre';
        cb(
          null,
          `${folder}/${req.params[ownerParam]}/${type}-${safeFileName(
            file.originalname
          )}`
        );
      },
    }),
  });

const upload = privateUpload('documents', 'userId');
const uploadConvention = privateUpload('conventions', 'userId');
const uploadStudentDocuments = privateUpload('student-documents', 'studentId');

// Mission pictures are shown to every visitor, so they stay public
const uploadMissionImage = multer({
  storage: multerS3({
    s3,
    bucket: PUBLIC_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, `missions/${safeFileName(file.originalname)}`);
    },
  }),
});

// const uploadFile = async (fileObject) => {
//   const bufferStream = new stream.PassThrough();
//   bufferStream.end(fileObject.buffer);
//   const { data } = await google.drive({ version: 'v3' }).files.create({
//     media: {
//       mimeType: fileObject.mimeType,
//       body: bufferStream,
//     },
//     requestBody: {
//       name: fileObject.originalname,
//       parents: ['DRIVE_FOLDER_ID'],
//     },
//     fields: 'id,name',
//   });
//   console.log(`Uploaded file ${data.name} ${data.id}`);
// };
export { upload, uploadConvention, uploadStudentDocuments, uploadMissionImage };
