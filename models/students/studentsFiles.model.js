import { Sequelize } from 'sequelize';
import db from '../../config/database.js';
import Students from './students.model.js';

const { DataTypes } = Sequelize;

const StudentFiles = db.define(
  'student_files',
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
  },
  {
    timestamps: false,
  }
);

// Define the association
StudentFiles.associate = (models) => {
  StudentFiles.belongsTo(models.Students, {
    foreignKey: 'studentId',
    onDelete: 'CASCADE',
  });
};

export default StudentFiles;
