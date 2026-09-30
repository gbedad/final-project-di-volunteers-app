'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('skills', 'how_location', {
      type: Sequelize.STRING,
      validate: {
        isIn: [['Sur site', 'A distance', 'Sur site ou à distance', 'Hybride (alternance site et à distance)']]
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('skills', 'how_location');
  }
};
