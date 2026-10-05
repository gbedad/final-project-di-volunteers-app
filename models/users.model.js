import { Sequelize } from 'sequelize';
import db from '../config/database.js';
import Missions from './missions.model.js';
import Files from './files.model.js';
import Skills from './skills.model.js';

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
    genre: {
    type: DataTypes.STRING,
    enum: ["Homme", "Femme", "Autre"]
    },
    first_name: {
      type: DataTypes.STRING,
    },
    last_name: {
      type: DataTypes.STRING,
    },
    birth_date: {
      type: DataTypes.DATE,
    },
    phone: {
      type: DataTypes.STRING,
    },
    message: {
      type: DataTypes.TEXT('medium'),
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: 'volunteer',
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'Compte créé',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    email2: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    cv_received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    id_received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    b3_received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    convention_received: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    test_voltaire_passed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    street: {
      type: DataTypes.STRING,
    },
    city: {
      type: DataTypes.STRING,
    },
    zipcode: {
      type: DataTypes.STRING,
    },
    country: {
      type: DataTypes.STRING,
    },
    activity: {
      type: DataTypes.STRING,
    },

    interviews: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    pre_interview: {
      type: DataTypes.JSON,
    },
    internal_thread: {
      type: DataTypes.ARRAY(DataTypes.JSONB),
      defaultValue: [],
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,
    },
    // Documents an admin received on paper: ['cv', 'id', 'b3', 'convention']
    paper_documents: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    // Academic years the volunteer belonged to, e.g. ['2024/2025', '2025/2026']
    cohorte_year: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    // Date the application was first validated (status "Validé")
    validated_at: {
      type: DataTypes.DATE,
    },
  },
  {
    timestamps: true,
    underscored: true,
    created_at: 'created_at',
    updated_at: 'updated_at',
  }
);
Users.hasOne(Missions, {
  foreignKey: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

Users.hasMany(Files, {
  foreignKey: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  onDelete: 'CASCADE',
});

Missions.hasMany(Users, {
  foreignKey: 'mission_id',
  as: 'mission',
});
Users.belongsTo(Missions);

Users.hasMany(Files, {
  foreignKey: 'userId',
  as: 'file',
  onDelete: 'CASCADE',
});
Files.belongsTo(Users);

Users.hasOne(Skills, {
  onDelete: 'CASCADE',
  foreignKey: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

Skills.belongsTo(Users);

// db.sync({ alter: true });

export default Users;
