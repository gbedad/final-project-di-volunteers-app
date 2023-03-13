import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import db from './config/database.js';

import users_router from './routes/users.route.js';
import files_router from './routes/files.route.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(users_router);
app.use(files_router);

// Connection to database
try {
  await db.authenticate();
  console.log(`Database connected on port ${process.env.DATABASE_PORT}`);
} catch (err) {
  console.log(err);
}

// Connection to server
app.listen(process.env.PORT || 8080, () => {
  console.log(`server running on port ${process.env.PORT}`);
});
