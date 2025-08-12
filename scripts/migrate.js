#!/usr/bin/env node

const { sequelize } = require('../models');

async function migrate() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    console.log('🔄 Checking models...');
    console.log('Available models:', Object.keys(sequelize.models));
    
    console.log('🔄 Running database sync...');
    // Sync all models to create all necessary tables
    await sequelize.sync({ force: false });
    console.log('✅ All tables synchronized');
    
    // Verify tables were created
    const dialect = sequelize.getDialect();
    let query;
    if (dialect === 'sqlite') {
      query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    } else {
      query = "SELECT tablename FROM pg_tables WHERE schemaname = 'public'";
    }
    
    const [results] = await sequelize.query(query);
    const tableNames = results.map(row => row.name || row.tablename);
    console.log('✅ Created tables:', tableNames.join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();