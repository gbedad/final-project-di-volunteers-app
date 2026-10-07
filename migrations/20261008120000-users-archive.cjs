'use strict';

// Applied by scripts/migrate-archive.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'archived_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('users', 'archive_reason', { type: Sequelize.TEXT });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'archived_at');
    await queryInterface.removeColumn('users', 'archive_reason');
  },
};
