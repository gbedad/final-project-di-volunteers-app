import { Sequelize } from 'sequelize';
import db from '../../config/database.js';

const { DataTypes } = Sequelize;

// One link sent to a parent to give their consent online. The key of the
// link is never stored, only its SHA-256 (token_hash).
const ParentalConsents = db.define(
  'parental_consents',
  {
    student_id: { type: DataTypes.INTEGER, allowNull: false },
    token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    // 'email' (sent by the application) or 'whatsapp' (sent by the team)
    channel: { type: DataTypes.STRING },
    sent_to: { type: DataTypes.STRING },
    parent_name: { type: DataTypes.STRING },
    requested_by: { type: DataTypes.INTEGER },
    requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    // Wrong birth dates entered; the link is locked after a few
    failed_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    cancelled_at: { type: DataTypes.DATE },
    signed_at: { type: DataTypes.DATE },
    signer_name: { type: DataTypes.STRING },
    signer_relation: { type: DataTypes.STRING },
    // { [item id]: { accepted, text } }: the texts as the parent saw them
    choices: { type: DataTypes.JSONB },
    texts_version: { type: DataTypes.STRING },
    ip: { type: DataTypes.STRING },
    user_agent: { type: DataTypes.TEXT },
    // SHA-256 of the signed PDF
    document_hash: { type: DataTypes.CHAR(64) },
    file_id: { type: DataTypes.INTEGER },
    revoked_at: { type: DataTypes.DATE },
    revoked_by: { type: DataTypes.INTEGER },
  },
  { timestamps: false }
);

export default ParentalConsents;
