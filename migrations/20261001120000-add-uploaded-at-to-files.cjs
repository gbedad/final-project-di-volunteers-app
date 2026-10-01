'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // No default for existing rows: their upload date is unknown
    await queryInterface.addColumn('files', 'uploaded_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('files', 'uploaded_at');
  },
};
