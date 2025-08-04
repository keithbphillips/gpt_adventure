#!/usr/bin/env node

const { sequelize } = require('../models');

async function migrate() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Running migrations...');
    await sequelize.sync({ force: false, alter: true });
    console.log('Database synchronized successfully.');

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();