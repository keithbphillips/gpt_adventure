#!/usr/bin/env node

const { sequelize } = require('../models');

async function removeUnusedFields() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    console.log('🔄 Removing unused fields from convos table...');
    
    // Remove the summary, query, and temp columns
    const queries = [
      'ALTER TABLE convos DROP COLUMN summary',
      'ALTER TABLE convos DROP COLUMN query', 
      'ALTER TABLE convos DROP COLUMN temp'
    ];
    
    for (const query of queries) {
      try {
        await sequelize.query(query);
        console.log(`✅ Executed: ${query}`);
      } catch (error) {
        if (error.message.includes('no such column')) {
          console.log(`⚠️  Column already removed: ${query}`);
        } else {
          console.error(`❌ Error executing ${query}:`, error.message);
        }
      }
    }
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

removeUnusedFields();