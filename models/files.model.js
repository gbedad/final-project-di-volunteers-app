import { Sequelize } from 'sequelize';
import db from '../config/database.js';

import Users from './users.model.js';


const { DataTypes } = Sequelize;

const Files = db.define(
    'files',
    {
    filename: {
		type: DataTypes.STRING,
        allowNull: false
	  },
	mimetype: {
		type: DataTypes.STRING,
        allowNull: false
	  },
	path: {
		type: DataTypes.STRING,
        allowNull: false
	  }
  },
  
      { 
        timestamps: false,
         
        },
  );


export default Files;