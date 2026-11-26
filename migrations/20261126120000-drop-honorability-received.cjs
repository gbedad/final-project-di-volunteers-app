'use strict';

// Applied by scripts/drop-honorability.js. The attestation d'honorabilité is
// no longer part of the application (see services/application.js).
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'honorability_received');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'honorability_received', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },
};
