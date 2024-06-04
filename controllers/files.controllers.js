import dotenv from 'dotenv';
import File from '../models/files.model.js';
import s3 from '../config/aws.config.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

// const File = db.files;
// Code valid with AWS------
export const uploadFile = async (req, res) => {
  //   console.log(req);
  console.log('REQ.FILE', req.file);

  const userId = req.params.userId;
  console.log('userid', userId);
  try {
    const { originalname, mimetype, location } = req.file;

    const newfile = await File.create({
      filename: originalname,
      mimetype,
      path: location,
      userId,
    });
    res.status(200).json(newfile);
  } catch (err) {
    console.log(err);
    res.status(500).send('An error occurred during file upload');
  }
};

export const cancelFile = async (req, res) => {
  const fileId = req.params.fileId;

  try {
    // Find the file in the database based on the provided fileId
    const file = await File.findOne({
      where: { id: fileId },
    });

    // Check if the file exists
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    const { filename } = file;
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `documents/${filename}`,
    };
    console.log(filename);
    // Delete the file from the S3 bucket
    const response = await s3.deleteObject(params, function (err, data) {
      if (data) {
        console.log('File deleted successfully');
      } else {
        console.log('Check if you have sufficient permissions : ' + err);
      }
    });
    // Perform cancellation
    await file.destroy();

    res.json({ message: 'File canceled successfully' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'An error occurred during file deletion' });
  }
};

// export const uploadFile =async (req, res) => {
// 	try {
// 		const { body, files } = req;

// 		for (let f = 0; f < files.length; f += 1) {
// 		  await uploadFile(files[f]);
// 		}

// 		console.log(body);
// 		res.status(200).send('Form Submitted');
// 	  } catch (f) {
// 		res.send(f.message);
// 	  }
// }

// export const listAllFiles = (req, res) => {
// 	File.findAll({attributes: ['id', 'name']}).then(files => {
// 	  res.json(files);
// 	}).catch(err => {
// 		console.log(err);
// 		res.json({msg: 'Error', detail: err});
// 	});
// }

// export const downloadFile = (req, res) => {
// 	File.findById(req.params.id).then(file => {
// 		var fileContents = Buffer.from(file.data, "base64");
// 		var readStream = new stream.PassThrough();
// 		readStream.end(fileContents);

// 		res.set('Content-disposition', 'attachment; filename=' + file.name);
// 		res.set('Content-Type', file.type);

// 		readStream.pipe(res);
// 	}).catch(err => {
// 		console.log(err);
// 		res.json({msg: 'Error', detail: err});
// 	});
// }

// export const presignedUrl_aws_s3 = async (req, res) => {
//   try {
//     const { s3FilePath } = req.body;
//     console.log(s3FilePath);
//     // const params = { Bucket: process.env.AWS_BUCKET_NAME, Key: s3FilePath };
//     // const url = await s3.getSignedUrl('getObject', params);
//     const command = new GetObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Key: s3FilePath,
//     });
//     console.log(command);
//     const urlString = await getSignedUrl(s3, command, { expiresIn: 3600 });
//     const urlObject = { url: urlString };
//     const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

//     console.log(urlObject);
//     res.json(url);
//   } catch (error) {
//     console.error('Error generating presigned URL:', error);
//     res.status(500).json({ error: 'Failed to generate presigned URL' });
//   }
// };

export const presignedUrl_aws_s3 = async (req, res) => {
  try {
    const { s3FilePath } = req.body;
    const fileExtension = s3FilePath.split('.').pop().toLowerCase();
    let contentType = '';
    console.log('s3file', s3FilePath);

    // Determine content type based on file extension
    if (fileExtension === 'pdf') {
      contentType = 'application/pdf';
    } else if (['png', 'jpeg', 'jpg'].includes(fileExtension)) {
      contentType = 'image/jpeg'; // Adjust as needed for PNG or other image types
    } else {
      throw new Error('Unsupported file type');
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3FilePath,
      ResponseContentType: contentType, // Set the correct Content-Type dynamically
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ url });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
};
