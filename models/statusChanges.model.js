import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

// Every change of a volunteer's status, to measure how long each step takes
const StatusChanges = db.define(
  'status_changes',
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Null for the first status, given at registration
    from_status: {
      type: DataTypes.STRING,
    },
    to_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // Team member who made the change; null when automatic or by the volunteer
    changed_by: {
      type: DataTypes.INTEGER,
    },
    changed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  { timestamps: false }
);

export default StatusChanges;
