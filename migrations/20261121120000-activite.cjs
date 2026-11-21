'use strict';

// Applied by scripts/migrate-activite.js
// Activity of a student, a pair and a session: 'benevolat' (existing, free
// tutoring) or 'payant' (paid tutoring, managed in its own space).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    for (const table of ['students', 'binomes', 'seances']) {
      await queryInterface.addColumn(table, 'activite', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'benevolat',
      });
    }
  },
  down: async (queryInterface) => {
    for (const table of ['students', 'binomes', 'seances']) {
      await queryInterface.removeColumn(table, 'activite');
    }
  },
};
