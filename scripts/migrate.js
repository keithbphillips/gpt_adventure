#!/usr/bin/env node

const { sequelize, Quest } = require('../models');

async function migrate() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    console.log('🔄 Checking models...');
    console.log('Available models:', Object.keys(sequelize.models));
    
    console.log('🔄 Running database sync...');
    // Only sync the Quest model to avoid altering existing tables
    await Quest.sync({ force: false });
    console.log('✅ Quest table sync completed');
    
    // Verify the quests table was created
    const [results] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='quests'");
    if (results.length > 0) {
      console.log('✅ Quests table created successfully');
    } else {
      console.log('❌ Quests table was not created');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();