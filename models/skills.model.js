import db from '../config/database.js';
import { Sequelize } from 'sequelize';

import Users from './users.model.js';

const { DataTypes } = Sequelize;

const Skills = db.define(
  'skills',
  {
    topics: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [] 
    },
    when_day_slot: {
        type: DataTypes.ARRAY(DataTypes.JSONB),
        defaultValue: [],
    },
    where_location: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [] 
    },
    interview1_comments: {
        type: DataTypes.TEXT
    },
    interview1_date: {
        type: DataTypes.DATEONLY
    },
    interview2_comments: {
        type: DataTypes.TEXT
    },
    interview2_date: {
        type: DataTypes.DATEONLY
    },
},
    { 
        timestamps: false,
      }
);

// db.sync()

export default Skills;