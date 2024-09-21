'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('students', 'internal_thread', {
      type: Sequelize.JSONB,
      defaultValue: [],
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('students', 'internal_thread', {
      type: Sequelize.ARRAY(Sequelize.JSONB),
      defaultValue: [],
    });
  },
};
