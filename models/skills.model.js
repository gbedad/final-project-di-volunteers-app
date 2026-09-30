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
    // hidden_topics: {
    //   type: DataTypes.ARRAY(DataTypes.JSONB),
    //   defaultValue: [],
    // },
    when_day_slot: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    where_location: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    availability: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    number_of_students: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    how_location: {
      type: DataTypes.STRING,
      enum: ['Sur site', 'A distance', 'Sur site ou à distance', 'Hybride (alternance site et à distance)']
    }
  },
  {
    timestamps: false,
  }
);

//Synchronize the database
// db.sync()
//   .then(() => {
//     console.log('Database synchronized');
//   })
//   .catch((error) => {
//     console.error('Error synchronizing database:', error);
//   });

export default Skills;
