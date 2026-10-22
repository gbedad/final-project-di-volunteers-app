import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

// Session report written by the tutor of a pair (after each session or at
// least once a month)
const Seances = db.define(
  'seances',
  {
    binome_id: { type: DataTypes.INTEGER, allowNull: false },
    author_id: { type: DataTypes.INTEGER },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    duration_minutes: { type: DataTypes.INTEGER },
    // présent, absent (the student did not come), annulé
    attendance: { type: DataTypes.STRING, allowNull: false, defaultValue: 'présent' },
    // The student arrived 15 minutes late or more (incident, see the Charte)
    late: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Signature of the student at the end of an on-site session (image in the
    // private storage), or the tutor said the student could not sign
    student_signature: { type: DataTypes.STRING },
    student_signed_at: { type: DataTypes.DATE },
    no_signature: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    work: { type: DataTypes.TEXT },
    // How the student is doing, 1 to 5
    progress: { type: DataTypes.INTEGER },
    remark: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { timestamps: false }
);

export default Seances;
