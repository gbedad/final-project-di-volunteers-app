import db from '../config/database.js';
import { Sequelize } from 'sequelize';

import Users from './users.model.js';

const { DataTypes } = Sequelize;

const Skills = db.define(
  'skills',
  {
    topics: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    hidden_topics: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    when_day_slot: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    where_location: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
  },
  {
    timestamps: false,
  }
);

// Synchronize the database
// db.sync()
//   .then(() => {
//     console.log('Database synchronized');
//   })
//   .catch((error) => {
//     console.error('Error synchronizing database:', error);
//   });

export default Skills;
