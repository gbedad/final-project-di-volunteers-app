'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('skills', 'hidden_topics', {
      type: Sequelize.ARRAY(Sequelize.JSONB),
      defaultValue: [],
    });
  },

  down: async (queryInterface, Sequelize) => {
    // If you need to rollback, remove the 'hidden_topics' column
    await queryInterface.removeColumn('skills', 'hidden_topics');
  },
};
