'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('students', 'email_parent1');
    await queryInterface.removeColumn('students', 'email_parent2');
    await queryInterface.removeColumn('students', 'priority');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'email_parent1', {
      type: Sequelize.STRING,
      defaultValue: '',
    });
    await queryInterface.addColumn('students', 'email_parent2', {
      type: Sequelize.STRING,
      defaultValue: '',
    });
    await queryInterface.addColumn('students', 'priority', {
      type: Sequelize.ENUM('TOP', 'P1', 'P2', 'P3', 'P4'),
    });
  },
};
