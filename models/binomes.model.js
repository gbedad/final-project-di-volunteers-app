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
    // Zoom meeting of the pair (created by Moodle), learnt at the first match
    zoom_meeting_id: { type: DataTypes.STRING },
    // Slots over time: [{ since: 'YYYY-MM-DD' | null, schedule }], schedule
    // being the current one (see services/pairSchedule.js)
    schedule_history: { type: DataTypes.JSONB },
    // Sessions go on during the school holidays (expected then too)
    during_holidays: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // New slot told by the tutor, until the team applies it:
    // { schedule, since, note, at }
    schedule_request: { type: DataTypes.JSONB },
    // School return of the last "back to school" e-mail to the tutor
    resume_notice: { type: DataTypes.DATEONLY },
  },
  { timestamps: false }
);

export default Binomes;
