'use strict';

// Applied by scripts/migrate-paper-documents.js (which also fills it)
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'paper_documents', {
      type: Sequelize.JSONB,
      defaultValue: [],
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'paper_documents');
  },
};
