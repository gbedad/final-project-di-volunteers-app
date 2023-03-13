import db from '../config/database.js'
import File from '../models/files.model.js'

// const File = db.files;
export const uploadFile =async (req, res) => {
	const { originalname, mimetype, location } = req.file;
  	const file = await File.create({ filename: originalname, mimetype, path: location });
	res.json(file)
}

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
