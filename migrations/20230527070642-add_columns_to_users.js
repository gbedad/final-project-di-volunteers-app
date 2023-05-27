'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    //   await queryInterface.addColumn('Users', 'cv_received', {
    //     type: Sequelize.BOOLEAN,
    //     defaultValue: false,
    //     allowNull: false,
    //   });

    //   await queryInterface.addColumn('Users', 'id_received', {
    //     type: Sequelize.BOOLEAN,
    //     defaultValue: false,
    //     allowNull: false,
    //   });

    //   await queryInterface.addColumn('Users', 'b3_received', {
    //     type: Sequelize.BOOLEAN,
    //     defaultValue: false,
    //     allowNull: false,
    //   });

    //   await queryInterface.addColumn('Users', 'convention_received', {
    //     type: Sequelize.BOOLEAN,
    //     defaultValue: false,
    //     allowNull: false,
    //   });
    // },
    return queryInterface.sequelize.transaction((t) => {
      return Promise.all([
        queryInterface.addColumn(
          'Users',
          'cv_received',
          {
            type: Sequelize.DataTypes.BOOLEAN,
          },
          { transaction: t }
        ),
        queryInterface.addColumn(
          'Person',
          'id_received',
          {
            type: Sequelize.DataTypes.BOOLEAN,
          },
          { transaction: t }
        ),
        queryInterface.addColumn(
          'Users',
          'b3_received',
          {
            type: Sequelize.DataTypes.BOOLEAN,
          },
          { transaction: t }
        ),
        queryInterface.addColumn(
          'Person',
          'convention_received',
          {
            type: Sequelize.DataTypes.BOOLEAN,
          },
          { transaction: t }
        ),
      ]);
    });
  },

  down: async (queryInterface, Sequelize) => {
    //   await queryInterface.removeColumn('Users', 'cv_received');
    //   await queryInterface.removeColumn('Users', 'id_received');
    //   await queryInterface.removeColumn('Users', 'b3_received');
    //   await queryInterface.removeColumn('Users', 'convention_received');
    // },
    return queryInterface.sequelize.transaction((t) => {
      return Promise.all([
        queryInterface.removeColumn('Users', 'cv_received', { transaction: t }),
        queryInterface.removeColumn('Users', 'id_received', { transaction: t }),
        queryInterface.removeColumn('Users', 'b3_received', { transaction: t }),
        queryInterface.removeColumn('Users', 'convention_received', {
          transaction: t,
        }),
      ]);
    });
  },
};
