'use strict';

// Long text for the ambassadors who offer an outing, in the WhatsApp format
// (button « Pour les ambassadeurs » of the outing page); distinct from the
// text of the ambassadors' flyer (activities.ambassador_brief).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('activities', 'ambassador_guide', { type: Sequelize.TEXT });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('activities', 'ambassador_guide');
  },
};
