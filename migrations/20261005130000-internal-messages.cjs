'use strict';

// Applied by scripts/migrate-internal-thread.js (which also copies the old
// messages stored in users.internal_thread)
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('internal_messages', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      subject_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      author_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      author_name: { type: Sequelize.STRING, allowNull: false },
      kind: { type: Sequelize.STRING, allowNull: false, defaultValue: 'message' },
      content: { type: Sequelize.TEXT, allowNull: false },
      mentions: { type: Sequelize.ARRAY(Sequelize.INTEGER), defaultValue: [] },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('internal_messages', ['subject_id', 'created_at']);
    await queryInterface.createTable('thread_reads', {
      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      subject_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      last_read_at: { type: Sequelize.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('thread_reads');
    await queryInterface.dropTable('internal_messages');
  },
};
