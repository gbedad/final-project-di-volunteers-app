import db from '../config/database.js';
import { Sequelize } from 'sequelize';

const { DataTypes } = Sequelize;

const Skills = db.define(
  'skills',
  {
    topics: {
        type: DataTypes.ARRAY(Datatypes.TEXT),
        defaultValue: [] 
    },
    when: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [] 
    },
    where: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: [] 
    },
    interview1_comments: {
        type: DataTypes.Text
    },
    interview1_date: {
        type: DataTypes.DATEONLY
    },
    interview2_comments: {
        type: DataTypes.Text
    },
    interview2_date: {
        type: DataTypes.DATEONLY
    },
    volunteer_cv: {
        type: DataTypes.BLOB,
        allowNull: true
    },
    volunteer_id: {
        type: DataTypes.BLOB,
        allowNull: true
    },
    volunteer_b3: {
        type: DataTypes.BLOB,
        allowNull: true
    }
},

    { 
        timestamps: false,
       
      }

);

export default Skills;