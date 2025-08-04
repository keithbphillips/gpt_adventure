module.exports = (sequelize, DataTypes) => {
  const Convo = sequelize.define('Convo', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    datetime: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    player: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: { msg: 'Player is required' },
        notEmpty: { msg: 'Player cannot be empty' }
      }
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    playerClass: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'player_class'
    },
    race: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    temp: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    contentUser: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'content_user'
    },
    contentAssistant: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'content_assistant'
    },
    turn: {
      type: DataTypes.STRING(6),
      allowNull: true
    },
    timePeriod: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'time_period'
    },
    dayNumber: {
      type: DataTypes.STRING(6),
      allowNull: true,
      field: 'day_number'
    },
    weather: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    health: {
      type: DataTypes.STRING(4),
      allowNull: true
    },
    xp: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    ac: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    level: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    quest: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    location: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    exits: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    inventory: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    action: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    genre: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gender: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    registered: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    stats: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gold: {
      type: DataTypes.STRING(100),
      allowNull: true
    }
  }, {
    tableName: 'convos',
    timestamps: false,
    indexes: [
      {
        fields: ['player']
      },
      {
        fields: ['player', 'location']
      },
      {
        fields: ['datetime']
      }
    ]
  });

  Convo.associate = function(models) {
    Convo.belongsTo(models.User, {
      foreignKey: 'player',
      targetKey: 'username',
      as: 'user'
    });
  };

  return Convo;
};