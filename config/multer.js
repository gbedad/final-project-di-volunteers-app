import multerS3 from 'multer-s3';
import multer from 'multer';
import s3 from './aws.config.js'

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

export default upload;