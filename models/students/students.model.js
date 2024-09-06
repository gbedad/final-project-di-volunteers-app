import { Sequelize } from 'sequelize';
import db from '../../config/database.js';

const { DataTypes } = Sequelize;

const Students = db.define(
  'students',
  {
    email: {
      type: DataTypes.STRING,
    },

    first_name: {
      type: DataTypes.STRING,
    },
    last_name: {
      type: DataTypes.STRING,
    },
    birth_date: {
      type: DataTypes.DATE,
    },
    phone: {
      type: DataTypes.STRING,
    },
    comment: {
      type: DataTypes.TEXT('medium'),
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'Compte créé',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    email_parent1: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    email_parent2: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    priority: {
      type: DataTypes.STRING,
      enum: ['TOP', 'P1', 'P2', 'P3', 'P4'],
    },
    topics: {
      type: DataTypes.JSONB,
    },

    street: {
      type: DataTypes.STRING,
    },
    city: {
      type: DataTypes.STRING,
    },
    zipcode: {
      type: DataTypes.STRING,
    },
    country: {
      type: DataTypes.STRING,
    },
    level: {
      type: DataTypes.STRING,
    },

    interviews: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    pre_interview: {
      type: DataTypes.JSON,
    },
    internal_thread: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    launched_on: {
      type: DataTypes.DATE,
    },
    level: {
      type: DataTypes.STRING,
    },
  },
  {
    timestamps: true,
    underscored: true,
    created_at: 'created_at',
    updated_at: 'updated_at',
  }
);

// db.sync({ alter: true });

export default Students;
