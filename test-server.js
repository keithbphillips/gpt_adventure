#!/usr/bin/env node

const http = require('http');

function testServer() {
  const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    res.on('data', (chunk) => {
    });
  });

  req.on('error', (error) => {
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.end();
}

// Test every 10 seconds
testServer();
setInterval(testServer, 10000);