module.exports = (sequelize, DataTypes) => {
  const Quest = sequelize.define('Quest', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        notNull: { msg: 'Quest title is required' },
        notEmpty: { msg: 'Quest title cannot be empty' }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notNull: { msg: 'Quest description is required' }
      }
    },
    starting_location: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: { msg: 'Starting location is required' }
      }
    },
    related_locations: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      comment: 'JSON array of related location names'
    },
    required_items: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      comment: 'JSON array of required items with locations'
    },
    success_condition: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notNull: { msg: 'Success condition is required' }
      }
    },
    xp_reward: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      validate: {
        min: 50,
        max: 500
      }
    },
    player: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: { msg: 'Player is required' },
        notEmpty: { msg: 'Player cannot be empty' }
      }
    },
    genre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'fantasy D&D',
      validate: {
        notNull: { msg: 'Genre is required' },
        notEmpty: { msg: 'Genre cannot be empty' }
      }
    },
    status: {
      type: DataTypes.ENUM('available', 'active', 'completed', 'failed'),
      defaultValue: 'available',
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    tableName: 'quests',
    timestamps: true,
    indexes: [
      {
        fields: ['player', 'genre']
      },
      {
        fields: ['player', 'status']
      },
      {
        fields: ['starting_location']
      }
    ]
  });

  return Quest;
};