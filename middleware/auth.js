const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Flexible authentication middleware (JWT or Session)
const authenticateUser = async (req, res, next) => {
  try {
    // First, try JWT authentication
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findByPk(decoded.userId);
        
        if (user && user.isActive) {
          req.user = user;
          return next();
        }
      } catch (jwtError) {
        console.error('JWT verification error:', jwtError);
      }
    }

    // Fallback to session authentication
    if (req.session.userId) {
      const user = await User.findByPk(req.session.userId);
      if (user && user.isActive) {
        req.user = user;
        return next();
      }
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication server error' });
  }
};

// JWT Authentication middleware (strict JWT only)
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findByPk(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token or user not active' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Session-based authentication middleware
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/auth/login');
  }
  next();
};

// Load user from session
const loadUser = async (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId);
      if (user && user.isActive) {
        req.user = user;
        res.locals.user = user;
      } else {
        req.session.destroy();
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }
  next();
};

// Check if user is already authenticated
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  next();
};

// Admin middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isStaff) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = {
  authenticateUser,
  authenticateToken,
  requireLogin,
  loadUser,
  redirectIfAuthenticated,
  requireAdmin
};