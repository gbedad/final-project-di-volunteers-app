import { Sequelize } from 'sequelize';
import dbconfig from './dbconfig.js';
import dotenv from 'dotenv';

dotenv.config();

const { NODE_ENV } = process.env;
console.log(NODE_ENV);

const selectedConfig = dbconfig[NODE_ENV || 'development'];

console.log(selectedConfig.username);
const db = new Sequelize(
  selectedConfig.database,
  selectedConfig.username,
  selectedConfig.password,
  {
    host: selectedConfig.host,
    port: selectedConfig.port,
    dialect: selectedConfig.dialect,
  }
);

export default db;

// const db = new Sequelize(
//   process.env.DATABASE_NAME,
//   process.env.DATABASE_USER,
//   process.env.DATABASE_PASSWORD,
//   {
//     host: process.env.DATABASE_HOST,
//     port: process.env.DATABASE_PORT,
//     dialect: 'postgres',
//   },
//   {
//     pool: {
//       max: 5, // Maximum number of connections allowed in the pool
//       min: 0, // Minimum number of connections to be kept in the pool
//       idle: 10000, // Maximum time (in milliseconds) that a connection can be idle before being released
//       acquire: 30000, // Maximum time (in milliseconds) to acquire a connection from the pool
//     },
//   }
// );
