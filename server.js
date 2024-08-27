import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);
console.log(__dirname);
import db from './config/database.js';

import users_router from './routes/users.route.js';
import files_router from './routes/files.route.js';
import skills_router from './routes/skills.route.js';
import missions_router from './routes/missions.route.js';

import students_router from './routes/students_routes/students.route.js';

dotenv.config();

const app = express();

const corsOptions = {
  origin: ['https://www.mycogniverse.org', 'http://localhost:3000'], // Add your frontend URL and any other allowed origins
  credentials: true, // If you're using cookies or authentication headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// app.use(cors());
app.use(cookieParser());

app.use('/', express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/s3-proxy', (req, res) => {
  const s3Url =
    'https://volunteers-app.s3.eu-central-1.amazonaws.com/documents' + req.url;
  req.pipe(request(s3Url)).pipe(res);
});

// app.use(function (req, res, next) {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header(
//     'Access-Control-Allow-Headers',
//     'Origin, X-Requested-With, Content-Type, Accept'
//   );
//   next();
// });

app.use(users_router);
app.use(files_router);
app.use(skills_router);
app.use(missions_router);

app.use(students_router);

// Serve static files from the Next.js build directory
app.use('/_next', express.static(path.join(__dirname, '.next')));

// Connection to database
try {
  await db.authenticate();
  console.log(
    `Database connected on port ${process.env.AIVEN_PORT} || ${process.env.DATABASE_PORT}`
  );
} catch (err) {
  console.log(err);
}

// Connection to server
app.listen(process.env.PORT || 3030, () => {
  console.log(`server running on port ${process.env.PORT}`);
});
