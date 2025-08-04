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
    console.log(`Server is responding: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    res.on('data', (chunk) => {
      console.log('Response received (first 200 chars):', chunk.toString().substring(0, 200));
    });
  });

  req.on('error', (error) => {
    console.error('Server test failed:', error.message);
  });

  req.on('timeout', () => {
    console.error('Server test timed out');
    req.destroy();
  });

  req.end();
}

// Test every 10 seconds
console.log('Starting server monitoring...');
testServer();
setInterval(testServer, 10000);