'use strict';

// Applied by scripts/migrate-students.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const add = (name, spec) => queryInterface.addColumn('students', name, spec);
    await add('referral_source', { type: Sequelize.STRING });
    await add('referral_contact', { type: Sequelize.STRING });
    await add('goals', { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] });
    await add('needs', { type: Sequelize.TEXT });
    await add('special_needs', { type: Sequelize.TEXT });
    await add('how_location', { type: Sequelize.STRING });
    await add('track', { type: Sequelize.STRING });
    await add('parental_consent_at', { type: Sequelize.DATE });
    await add('is_demo', { type: Sequelize.BOOLEAN, defaultValue: false });
  },
  down: async (queryInterface) => {
    for (const name of [
      'referral_source',
      'referral_contact',
      'goals',
      'needs',
      'special_needs',
      'how_location',
      'track',
      'parental_consent_at',
      'is_demo',
    ]) {
      await queryInterface.removeColumn('students', name);
    }
  },
};
