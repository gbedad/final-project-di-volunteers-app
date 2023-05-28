import db from '../config/database.js';
import File from '../models/files.model.js';

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

    // Perform cancellation logic, e.g., deleting the file from the system or updating its status
    await file.destroy(); // Assuming you have a remove method on your File model

    res.json({ message: 'File canceled successfully' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
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
