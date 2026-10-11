import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

// Proof of each signature of a volunteer's convention: the volunteer's, then
// the president's (countersignature)
const ConventionSignatures = db.define(
  'convention_signatures',
  {
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    signer_id: { type: DataTypes.INTEGER },
    // volunteer or president
    kind: { type: DataTypes.STRING, allowNull: false },
    signed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    consents: { type: DataTypes.JSONB },
    // Values written in the convention
    fields: { type: DataTypes.JSONB },
    charte_version: { type: DataTypes.STRING },
    template_version: { type: DataTypes.STRING },
    ip: { type: DataTypes.STRING },
    user_agent: { type: DataTypes.TEXT },
    document_hash: { type: DataTypes.CHAR(64) },
    file_id: { type: DataTypes.INTEGER },
  },
  { timestamps: false }
);

export default ConventionSignatures;
