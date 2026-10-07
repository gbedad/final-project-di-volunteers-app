import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

// A tutor and a student working together. Status: proposé (waiting for the
// tutor's answer), refusé, annulé, actif, en pause, terminé
const Binomes = db.define(
  'binomes',
  {
    student_id: { type: DataTypes.INTEGER, allowNull: false },
    tutor_id: { type: DataTypes.INTEGER },
    subjects: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    // Agreed slots: [{ day, startTime, endTime }]
    schedule: { type: DataTypes.JSONB, defaultValue: [] },
    how_location: { type: DataTypes.STRING },
    site: { type: DataTypes.STRING },
    start_date: { type: DataTypes.DATEONLY },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'proposé' },
    note: { type: DataTypes.TEXT },
    proposed_by: { type: DataTypes.INTEGER },
    proposed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    responded_at: { type: DataTypes.DATE },
    decline_reason: { type: DataTypes.TEXT },
    ended_at: { type: DataTypes.DATE },
    end_reason: { type: DataTypes.TEXT },
    // Last monthly reminder sent to the tutor (no session report)
    reminded_at: { type: DataTypes.DATE },
  },
  { timestamps: false }
);

export default Binomes;
