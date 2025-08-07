#!/usr/bin/env node

const { sequelize } = require('../models');

async function migrate() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: false, alter: true });
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

migrate();