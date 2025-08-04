const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Username is required' },
        notEmpty: { msg: 'Username cannot be empty' },
        len: [1, 150]
      }
    },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Email is required' },
        notEmpty: { msg: 'Email cannot be empty' },
        isEmail: { msg: 'Must be a valid email address' }
      }
    },
    password: {
      type: DataTypes.STRING(128),
      allowNull: false,
      validate: {
        notNull: { msg: 'Password is required' },
        notEmpty: { msg: 'Password cannot be empty' },
        len: [8, 128]
      }
    },
    firstName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'last_name'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    isStaff: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_staff'
    },
    isSuperuser: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_superuser'
    },
    dateJoined: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'date_joined'
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login'
    }
  }, {
    tableName: 'auth_user',
    timestamps: false,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      }
    }
  });

  User.prototype.validPassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  User.associate = function(models) {
    User.hasMany(models.Convo, {
      foreignKey: 'player',
      sourceKey: 'username',
      as: 'conversations'
    });
    User.hasMany(models.Picmap, {
      foreignKey: 'player',
      sourceKey: 'username',
      as: 'pictures'
    });
  };

  return User;
};