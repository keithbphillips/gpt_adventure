module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: { msg: 'Location name is required' },
        notEmpty: { msg: 'Location name cannot be empty' }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
      validate: {
        notNull: { msg: 'Description is required' }
      }
    },
    exits: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
      comment: 'JSON string of exits: {"north": "Location Name", "south": "Other Location"}'
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
    tableName: 'locations',
    timestamps: true,
    indexes: [
      {
        fields: ['player', 'genre']
      },
      {
        fields: ['name', 'player', 'genre'],
        unique: true
      },
      {
        fields: ['player']
      },
      {
        fields: ['genre']
      }
    ]
  });

  return Location;
};