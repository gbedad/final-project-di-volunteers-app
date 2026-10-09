import { Sequelize } from 'sequelize';
import db from '../../config/database.js';

import StudentFiles from './studentsFiles.model.js';

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
      defaultValue: 'Nouvelle demande',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    topics: {
      type: DataTypes.JSONB,
    },
    address: {
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
    priority: {
      type: DataTypes.ENUM('TOP', 'P1', 'P2', 'P3', 'P4'),
      allowNull: true, // or false, matching your migration
    },

    interviews: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    pre_interview: {
      type: DataTypes.JSON,
    },
    internal_thread: {
      type: DataTypes.JSONB, // Use JSONB to store an array of JSON objects
      defaultValue: [],
    },
    launched_on: {
      type: DataTypes.DATE,
    },
    level: {
      type: DataTypes.STRING,
    },
    is_family: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    school: {
      type: DataTypes.JSON,
      defaultValue: null,
    },
    parent1_firstname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent1_lastname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent1_email: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent1_phone: {
      type: DataTypes.STRING,
      defaultValue: null,
    },

    parent2_firstname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent2_lastname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent2_email: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    parent2_phone: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    other_firstname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    other_lastname: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    other_email: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    other_phone: {
      type: DataTypes.STRING,
      defaultValue: null,
    },
    when_day_slot: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    where_location: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    school_history: {
      type: DataTypes.JSON,
      defaultValue: null,
    },
    // Who referred the student (school, social worker, family…) and contact
    referral_source: {
      type: DataTypes.STRING,
    },
    referral_contact: {
      type: DataTypes.STRING,
    },
    // Remise à niveau, méthodologie, préparation du brevet…
    goals: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    needs: {
      type: DataTypes.TEXT,
    },
    // Health-related information (dys…): only seen by the team
    special_needs: {
      type: DataTypes.TEXT,
    },
    // Same modalities as the tutors (sur site, à distance…)
    how_location: {
      type: DataTypes.STRING,
    },
    // Lycée: générale, technologique, professionnelle
    track: {
      type: DataTypes.STRING,
    },
    parental_consent_at: {
      type: DataTypes.DATE,
    },
    // Participation to the costs (services/fees.js): quotient familial, its
    // proof (caf / avis / none) and the document, "Autres" hourly rate for
    // special needs, amount changed by hand and why
    qf: { type: DataTypes.DECIMAL(10, 2) },
    qf_proof: { type: DataTypes.STRING },
    qf_file_id: { type: DataTypes.INTEGER },
    fee_special: { type: DataTypes.BOOLEAN, defaultValue: false },
    fee_override: { type: DataTypes.DECIMAL(10, 2) },
    fee_override_reason: { type: DataTypes.TEXT },
    // Fictitious student used to try the features (removable at once)
    is_demo: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_mime_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    created_at: 'created_at',
    updated_at: 'updated_at',
  }
);
Students.hasMany(StudentFiles, {
  foreignKey: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  onDelete: 'CASCADE',
});
// db.sync({ alter: true });

export default Students;
