'use strict';

// Applied by scripts/migrate-application-checklist.js (which also fills it)
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('files', 'doc_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('files', 'doc_type');
  },
};
