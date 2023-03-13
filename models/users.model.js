import { Sequelize } from 'sequelize';
import db from '../config/database.js';
import Missions  from './missions.model.js';

const { DataTypes } = Sequelize;

const Users = db.define(
  'users',
  {
    email: {
      type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    first_name: {
      type: DataTypes.STRING,
    },
    last_name: {
      type: DataTypes.STRING,
    },
    birth_date: {
      type: DataTypes.DATEONLY,
    },
    phone: {
      type: DataTypes.STRING,
    },
    message: {
      type: DataTypes.TEXT('medium')
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: 'volunteer'
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'created'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
},

    { 
        timestamps: true,
        underscored: true,
        created_at: "created_at", 
        updated_at: "updated_at", 
      },
);
Users.hasOne(Missions, {
  foreignKey: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
})
Missions.hasMany(Users, {
  foreignKey: "mission_id",
  as: "mission",
})
Users.belongsTo(Missions)


db.sync({alter: false})

export default Users;
