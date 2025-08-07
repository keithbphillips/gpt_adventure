const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { redirectIfAuthenticated, loadUser } = require('../middleware/auth');

const router = express.Router();

// Helper function to generate redirect message
function getRedirectMessage(session) {
  if (!session.redirectAfterLogin) return null;
  
  const gameRoutes = {
    '/adventure': 'Fantasy Adventure',
    '/scifi': 'Sci-Fi Adventure', 
    '/mystery': 'Mystery Investigation',
    '/custom': 'Custom Universe'
  };
  
  const gameName = gameRoutes[session.redirectAfterLogin];
  return gameName ? `You'll be taken to ${gameName} after login.` : null;
}

// Apply loadUser middleware to all routes
router.use(loadUser);

// Login page
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', { 
    title: 'Login',
    error: null,
    redirectMessage: getRedirectMessage(req.session)
  });
});

// Login POST
router.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/login', {
        title: 'Login',
        error: errors.array()[0].msg,
        redirectMessage: getRedirectMessage(req.session)
      });
    }

    const { username, password } = req.body;
    
    // Find user by username or email
    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username: username },
          { email: username }
        ]
      }
    });

    if (!user || !user.isActive) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid credentials',
        redirectMessage: getRedirectMessage(req.session)
      });
    }

    const isValidPassword = await user.validPassword(password);
    if (!isValidPassword) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid credentials',
        redirectMessage: getRedirectMessage(req.session)
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Set session
    req.session.userId = user.id;

    // Check for stored redirect URL and use it, otherwise go to home
    const redirectUrl = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin; // Clean up the stored URL
    
    res.redirect(redirectUrl);
  } catch (error) {
    res.render('auth/login', {
      title: 'Login',
      error: 'An error occurred during login',
      redirectMessage: getRedirectMessage(req.session)
    });
  }
});

// Register page
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('auth/register', { 
    title: 'Register',
    error: null,
    redirectMessage: getRedirectMessage(req.session)
  });
});

// Register POST
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 150 })
    .withMessage('Username must be between 3 and 150 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('auth/register', {
        title: 'Register',
        error: errors.array()[0].msg,
        redirectMessage: getRedirectMessage(req.session)
      });
    }

    const { username, email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username: username },
          { email: email }
        ]
      }
    });

    if (existingUser) {
      return res.render('auth/register', {
        title: 'Register',
        error: 'Username or email already exists',
        redirectMessage: getRedirectMessage(req.session)
      });
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      firstName: firstName || null,
      lastName: lastName || null
    });

    // Set session
    req.session.userId = user.id;

    // Check for stored redirect URL and use it, otherwise go to home
    const redirectUrl = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin; // Clean up the stored URL
    
    res.redirect(redirectUrl);
  } catch (error) {
    res.render('auth/register', {
      title: 'Register',
      error: 'An error occurred during registration',
      redirectMessage: getRedirectMessage(req.session)
    });
  }
});

// API token endpoint (for API authentication)
router.post('/api-token', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username: username },
          { email: username }
        ]
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await user.validPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/');
  });
});

// Logout GET (for convenience)
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/');
  });
});

module.exports = router;