'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('Files', 'studentId', 'userId');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('Files', 'userId', 'studentId');
  },
};
