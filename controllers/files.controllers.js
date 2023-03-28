import db from '../config/database.js'
import File from '../models/files.model.js'

// const File = db.files;
// Code valid with AWS------
export const uploadFile = async (req, res) => {
	console.log(req);

	const userId = req.params.userId
	console.log(userId);
	try {

		const { originalname, mimetype, location} = req.file;
		  const newfile = await File.create({ filename: originalname, mimetype, path: location , userId});
		res.json(newfile)
	}
	catch (err) {
		console.log(err)
	}

}

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
