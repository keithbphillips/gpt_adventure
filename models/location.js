module.exports = (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: { msg: 'Genre is required' },
        notEmpty: { msg: 'Genre cannot be empty' }
      }
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
      allowNull: true
    },
    shortDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'short_description'
    },
    exits: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON string containing available exits like {"north": "Forest Path", "south": "Village Square"}'
    },
    visited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    visitCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'visit_count'
    },
    lastVisited: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_visited'
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'locations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['player', 'genre', 'name'],
        unique: true
      },
      {
        fields: ['player', 'genre']
      },
      {
        fields: ['last_visited']
      }
    ]
  });

  Location.associate = function(models) {
    Location.belongsTo(models.User, {
      foreignKey: 'player',
      targetKey: 'username',
      as: 'user'
    });
    
    Location.hasMany(models.Picmap, {
      foreignKey: 'location',
      sourceKey: 'name',
      as: 'pictures'
    });
  };

  return Location;
};