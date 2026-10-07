'use strict';

// Applied by scripts/migrate-seances.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('seances', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      binome_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'binomes', key: 'id' },
        onDelete: 'CASCADE',
      },
      author_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      duration_minutes: { type: Sequelize.INTEGER },
      attendance: { type: Sequelize.STRING, allowNull: false, defaultValue: 'présent' },
      work: { type: Sequelize.TEXT },
      progress: { type: Sequelize.INTEGER },
      remark: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('seances', ['binome_id', 'date']);
    await queryInterface.addColumn('binomes', 'reminded_at', { type: Sequelize.DATE });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('seances');
    await queryInterface.removeColumn('binomes', 'reminded_at');
  },
};
