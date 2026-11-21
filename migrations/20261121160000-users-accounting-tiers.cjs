'use strict';

// Applied by scripts/migrate-users-accounting-tiers.js
// Identifier of a tutor (paid, auto-entrepreneur) as third party in the
// accounting software. Empty until the tutor is created there.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'accounting_tiers_id', { type: Sequelize.STRING });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'accounting_tiers_id');
  },
};
