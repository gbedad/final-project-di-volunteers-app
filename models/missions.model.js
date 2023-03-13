import { Sequelize } from 'sequelize';
import db from '../config/database.js';


const { DataTypes } = Sequelize;

const Missions = db.define(
  'missions',
  {
    title: {
      type: DataTypes.STRING,
    },
    description: {
      type: DataTypes.TEXT('medium'),
    },
    location: {
      type: DataTypes.STRING,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
},

    { 
        timestamps: true,
        underscored: true,
        created_at: "created_at", 
        updated_at: "updated_at", 
      }

);


export default Missions;
