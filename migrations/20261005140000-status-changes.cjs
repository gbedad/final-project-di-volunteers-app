'use strict';

// Applied by scripts/migrate-status-history.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('status_changes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      from_status: { type: Sequelize.STRING },
      to_status: { type: Sequelize.STRING, allowNull: false },
      changed_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      changed_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('status_changes', ['user_id', 'changed_at']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('status_changes');
  },
};
