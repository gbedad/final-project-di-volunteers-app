'use strict';

// Applied by scripts/migrate-cohorts.js (which also fixes the existing data)
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'validated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.changeColumn('users', 'cohorte_year', {
      type: Sequelize.ARRAY(Sequelize.STRING),
      defaultValue: [],
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'validated_at');
  },
};
