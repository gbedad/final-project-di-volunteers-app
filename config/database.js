import { Sequelize } from 'sequelize';
import dbconfig from './dbconfig.js';
import dotenv from 'dotenv';

dotenv.config();

// const { NODE_ENV } = process.env
const NODE_ENV = 'production';
console.log(NODE_ENV);

let selectedConfig;

if (NODE_ENV == 'production') {
  selectedConfig = dbconfig['production'];
} else if (NODE_ENV == 'production_aiven') {
  selectedConfig = dbconfig['production'];
} else if (NODE_ENV == 'development') {
  selectedConfig = dbconfig['development'];
}

// const selectedConfig = dbconfig['development'];

// const db = new Sequelize({
//   dialect: 'postgres',
//   host: process.env.AIVEN_HOST,
//   port: process.env.AIVEN_PORT,
//   database: process.env.AIVEN_DATABASE,
//   username: process.env.AIVEN_USER,
//   password: process.env.AIVEN_PASSWORD,
//   ssl: true,
//   dialectOptions: {
//     ssl: {
//       require: true,
//       rejectUnauthorized: false,
//     },
//   },
// });

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
