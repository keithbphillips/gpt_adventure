const express = require('express');
const { requireLogin, loadUser } = require('../middleware/auth');

const router = express.Router();

// Apply loadUser middleware to all routes
router.use(loadUser);

// Home page
router.get('/', (req, res) => {
  res.render('pages/home', { 
    title: 'GPT Adventure',
    user: req.user || null
  });
});

// Adventure game page
router.get('/adventure', requireLogin, (req, res) => {
  res.render('pages/adventure', { 
    title: 'Adventure Game',
    user: req.user,
    gameType: 'adventure'
  });
});

// Sci-fi game page
router.get('/scifi', requireLogin, (req, res) => {
  res.render('pages/scifi', { 
    title: 'Sci-Fi Adventure',
    user: req.user,
    gameType: 'scifi'
  });
});

// Mystery game page
router.get('/mystery', requireLogin, (req, res) => {
  res.render('pages/mystery', { 
    title: 'Mystery Adventure',
    user: req.user,
    gameType: 'mystery'
  });
});

// Custom game page
router.get('/custom', requireLogin, (req, res) => {
  res.render('pages/custom', { 
    title: 'Custom Adventure',
    user: req.user,
    gameType: 'custom'
  });
});


// About page
router.get('/about', (req, res) => {
  res.render('pages/about', { 
    title: 'About GPT Adventure',
    user: req.user || null
  });
});

module.exports = router;