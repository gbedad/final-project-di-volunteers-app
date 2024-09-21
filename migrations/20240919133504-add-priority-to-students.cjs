'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'priority', {
      type: Sequelize.ENUM('TOP', 'P1', 'P2', 'P3', 'P4'),
      allowNull: true, // or false, depending on your requirements
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('students', 'priority');

    // Remove the ENUM type after removing the column
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_students_priority";'
    );
  },
};
