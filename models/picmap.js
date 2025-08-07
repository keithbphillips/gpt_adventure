module.exports = (sequelize, DataTypes) => {
  const Picmap = sequelize.define('Picmap', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    player: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: { msg: 'Player is required' },
        notEmpty: { msg: 'Player cannot be empty' }
      }
    },
    location: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: { msg: 'Location is required' },
        notEmpty: { msg: 'Location cannot be empty' }
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
    picfile: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: { msg: 'Picture file is required' },
        notEmpty: { msg: 'Picture file cannot be empty' }
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    tableName: 'picmaps',
    timestamps: false,
    indexes: [
      {
        fields: ['player', 'location', 'genre']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Removed associations - no foreign key constraints needed

  return Picmap;
};