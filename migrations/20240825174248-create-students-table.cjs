'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('students', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      email: {
        type: Sequelize.STRING,
      },
      first_name: {
        type: Sequelize.STRING,
      },
      last_name: {
        type: Sequelize.STRING,
      },
      birth_date: {
        type: Sequelize.DATE,
      },
      phone: {
        type: Sequelize.STRING,
      },
      comment: {
        type: Sequelize.TEXT('medium'),
      },
      status: {
        type: Sequelize.STRING,
        defaultValue: 'Compte créé',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      email_parent1: {
        type: Sequelize.STRING,
        defaultValue: '',
      },
      email_parent2: {
        type: Sequelize.STRING,
        defaultValue: '',
      },
      priority: {
        type: Sequelize.ENUM('TOP', 'P1', 'P2', 'P3', 'P4'),
      },
      topics: {
        type: Sequelize.JSONB,
      },
      street: {
        type: Sequelize.STRING,
      },
      city: {
        type: Sequelize.STRING,
      },
      zipcode: {
        type: Sequelize.STRING,
      },
      country: {
        type: Sequelize.STRING,
      },
      level: {
        type: Sequelize.STRING,
      },
      interviews: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      pre_interview: {
        type: Sequelize.JSON,
      },
      internal_thread: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('students');
  },
};
