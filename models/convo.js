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
      allowNull: false,
      defaultValue: ''
    },
    playerClass: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: '',
      field: 'player_class'
    },
    race: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: ''
    },
    contentUser: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'content_user'
    },
    contentAssistant: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      field: 'content_assistant'
    },
    turn: {
      type: DataTypes.STRING(6),
      allowNull: false,
      defaultValue: ''
    },
    timePeriod: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '',
      field: 'time_period'
    },
    dayNumber: {
      type: DataTypes.STRING(6),
      allowNull: false,
      defaultValue: '',
      field: 'day_number'
    },
    weather: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: ''
    },
    health: {
      type: DataTypes.STRING(4),
      allowNull: false,
      defaultValue: ''
    },
    xp: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: ''
    },
    ac: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: ''
    },
    level: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: ''
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    quest: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: ''
    },
    location: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: ''
    },
    inventory: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    action: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    genre: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    gender: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    registered: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    stats: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    gold: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ''
    },
    conversation: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      comment: 'Raw OpenAI response content for debugging and analysis'
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

  // Removed associations - no foreign key constraints needed

  return Convo;
};