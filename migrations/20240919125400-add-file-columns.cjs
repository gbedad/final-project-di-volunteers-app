'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'fileName', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('students', 'fileMimeType', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('students', 'filePath', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('students', 'fileName');
    await queryInterface.removeColumn('students', 'fileMimeType');
    await queryInterface.removeColumn('students', 'filePath');
  },
};
