import dotenv from 'dotenv';

dotenv.config();

const dbconfig = {
  development: {
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    dialect: 'postgres',
  },
  production: {
    username: process.env.DATABASE_PRODUCTION_USER,
    password: process.env.DATABASE_PRODUCTION_PASSWORD,
    database: process.env.DATABASE_PRODUCTION_NAME,
    host: process.env.DATABASE_PRODUCTION_HOST,
    port: process.env.DATABASE_PRODUCTION_PORT,
    dialect: 'postgres',
  },
};

export default dbconfig;
