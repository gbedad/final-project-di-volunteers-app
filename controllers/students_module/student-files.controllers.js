import dotenv from 'dotenv';
import File from '../../models/students/studentsFiles.model.js';
import s3, { publicFileUrl } from '../../config/aws.config.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

// const File = db.files;
// Code valid with AWS------
export const uploadFile = async (req, res) => {
  //   console.log(req);
  console.log('REQ.FILE', req.file);

  const studentId = req.params.studentId;
  console.log('studentid', studentId);
  try {
    const { originalname, mimetype } = req.file;

    const newfile = await File.create({
      filename: originalname,
      mimetype,
      path: publicFileUrl(req.file),
      studentId,
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
      Key: `students-documents/${filename}`,
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
