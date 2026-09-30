'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'cohorte_year', {
      type: Sequelize.ARRAY(Sequelize.STRING),
      defaultValue: ['2023/2024']
    });

    await queryInterface.addColumn('users', 'genre', {
      type: Sequelize.STRING,
      validate: {
        isIn: [['Homme', 'Femme', 'Autre']]
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('users', 'cohorte_year');
    await queryInterface.removeColumn('users', 'genre');
  }
};
