'use strict';

// Applied by scripts/migrate-binomes.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('binomes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      student_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'CASCADE',
      },
      tutor_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      subjects: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
      schedule: { type: Sequelize.JSONB, defaultValue: [] },
      how_location: { type: Sequelize.STRING },
      site: { type: Sequelize.STRING },
      start_date: { type: Sequelize.DATEONLY },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'proposé' },
      note: { type: Sequelize.TEXT },
      proposed_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      proposed_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      responded_at: { type: Sequelize.DATE },
      decline_reason: { type: Sequelize.TEXT },
      ended_at: { type: Sequelize.DATE },
      end_reason: { type: Sequelize.TEXT },
    });
    await queryInterface.addIndex('binomes', ['student_id']);
    await queryInterface.addIndex('binomes', ['tutor_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('binomes');
  },
};
