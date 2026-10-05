import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

// Internal team discussion about a volunteer (never shown to the volunteer)
export const InternalMessages = db.define(
  'internal_messages',
  {
    // The volunteer the discussion is about
    subject_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Null when the author's account was deleted or unknown (old messages)
    author_id: {
      type: DataTypes.INTEGER,
    },
    // Kept with the message so it still reads well if the author leaves
    author_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // "message", or "whatsapp" when the author contacted the volunteer
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'message',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Team members mentioned with @, notified by email
    mentions: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: [],
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  { timestamps: false }
);

// When each team member last opened the discussion of a volunteer
export const ThreadReads = db.define(
  'thread_reads',
  {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    subject_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    last_read_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  { timestamps: false }
);
