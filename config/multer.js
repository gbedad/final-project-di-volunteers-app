import stream from 'stream';
import multerS3 from 'multer-s3';
import multer from 'multer';
import s3 from './aws.config.js';
import {google} from 'googleapis';

// const upload = multer({dest: 'uploads/'})
const upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: process.env.AWS_BUCKET_NAME,
    //   acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      

      key: (req, file, cb) => {
        cb(null, 'documents/' + Date.now().toString() + '-' + file.originalname);
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
  

export default upload;