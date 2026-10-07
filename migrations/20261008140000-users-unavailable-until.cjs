'use strict';

// Applied by scripts/migrate-unavailable.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'unavailable_until', { type: Sequelize.DATEONLY });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'unavailable_until');
  },
};
