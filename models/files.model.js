import { Sequelize } from 'sequelize';
import db from '../config/database.js';

const { DataTypes } = Sequelize;

const Files = db.define(
  'files',
  {
    filename: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mimetype: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    uploaded_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    // cv, id, b3, other or convention
    doc_type: {
      type: DataTypes.STRING,
    },
  },
  {
    timestamps: false,
  }
);

Files.associate = (models) => {
  Files.belongsTo(models.Users, {
    foreignKey: 'userId',
    onDelete: 'CASCADE',
  });
};

export default Files;
