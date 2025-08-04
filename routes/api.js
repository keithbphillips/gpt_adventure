const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateUser } = require('../middleware/auth');
const { Convo, Picmap, Location } = require('../models');
const db = require('../models');
const openaiService = require('../services/openaiService');
const { Op } = require('sequelize');

const router = express.Router();

// Adventure API endpoint
router.post('/adv-api', authenticateUser, [
  body('input_text').notEmpty().withMessage('Input text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    // Check if starting new game
    if (inputData.toLowerCase().includes('start a new game')) {
      console.log('Executing - Start New Game.');
      await Convo.destroy({ where: { player: username, genre: 'Fantasy Adventure' } });
      // Could also clear vector DB here if implemented
    }

    // Get saved conversation data
    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Fantasy Adventure',
        description: { [Op.ne]: '' }
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    let messages = savedData.reverse();

    // Get location-specific context
    try {
      const contextData = await Convo.findAll({
        where: { 
          player: username, 
          genre: 'Fantasy Adventure',
          location: mylocation 
        },
        order: [['id', 'DESC']],
        limit: 2,
        raw: true
      });

      if (contextData.length > 0) {
        const context = contextData.reverse();
        messages = [...context, ...messages];
      }
    } catch (error) {
      console.error('Context data error:', error);
    }

    // Process the game turn
    const responseData = await openaiService.processGameTurn(
      username, 
      messages, 
      inputData,
      'adventure'
    );

    // Save conversation to database
    if (responseData.data) {
      await Convo.create({
        player: username,
        contentUser: inputData,
        summary: '',
        action: responseData.content,
        genre: responseData.data.Genre || '',
        query: responseData.data.Query || '',
        temp: responseData.data.Temp || '',
        name: responseData.data.Name || '',
        playerClass: responseData.data.Class || '',
        race: responseData.data.Race || '',
        turn: responseData.data.Turn || '',
        timePeriod: responseData.data.Time || '',
        dayNumber: responseData.data.Day || '',
        weather: responseData.data.Weather || '',
        health: responseData.data.Health || '',
        xp: responseData.data.XP || '',
        ac: responseData.data.AC || '',
        level: responseData.data.Level || '',
        description: responseData.data.Description || '',
        location: responseData.data.Location || '',
        exits: Array.isArray(responseData.data.Exits) ? JSON.stringify(responseData.data.Exits) : String(responseData.data.Exits || ''),
        inventory: Array.isArray(responseData.data.Inventory) ? JSON.stringify(responseData.data.Inventory) : String(responseData.data.Inventory || ''),
        quest: responseData.data.Quest || '',
        gender: responseData.data.Gender || '',
        registered: responseData.data.Registered || '',
        stats: typeof responseData.data.Stats === 'object' ? JSON.stringify(responseData.data.Stats) : String(responseData.data.Stats || ''),
        gold: responseData.data.Gold || ''
      });
    }

    res.json(responseData);
  } catch (error) {
    console.error('Adventure API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Mystery API endpoint
router.post('/mys-api', authenticateUser, [
  body('input_text').notEmpty().withMessage('Input text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    // Same logic as adventure but with mystery game type
    if (inputData.toLowerCase().includes('start a new game')) {
      console.log('Executing - Start New Game.');
      await Convo.destroy({ where: { player: username, genre: 'Mystery' } });
    }

    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Mystery',
        description: { [Op.ne]: '' }
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    let messages = savedData.reverse();

    try {
      const contextData = await Convo.findAll({
        where: { 
          player: username, 
          genre: 'Mystery',
          location: mylocation 
        },
        order: [['id', 'DESC']],
        limit: 2,
        raw: true
      });

      if (contextData.length > 0) {
        const context = contextData.reverse();
        messages = [...context, ...messages];
      }
    } catch (error) {
      console.error('Context data error:', error);
    }

    const responseData = await openaiService.processGameTurn(
      username, 
      messages, 
      inputData,
      'mystery'
    );

    if (responseData.data) {
      await Convo.create({
        player: username,
        contentUser: inputData,
        summary: '',
        action: responseData.content,
        genre: responseData.data.Genre || '',
        query: responseData.data.Query || '',
        temp: responseData.data.Temp || '',
        name: responseData.data.Name || '',
        playerClass: responseData.data.Class || '',
        race: responseData.data.Race || '',
        turn: responseData.data.Turn || '',
        timePeriod: responseData.data.Time || '',
        dayNumber: responseData.data.Day || '',
        weather: responseData.data.Weather || '',
        health: responseData.data.Health || '',
        xp: responseData.data.XP || '',
        ac: responseData.data.AC || '',
        level: responseData.data.Level || '',
        description: responseData.data.Description || '',
        location: responseData.data.Location || '',
        exits: Array.isArray(responseData.data.Exits) ? JSON.stringify(responseData.data.Exits) : String(responseData.data.Exits || ''),
        inventory: Array.isArray(responseData.data.Inventory) ? JSON.stringify(responseData.data.Inventory) : String(responseData.data.Inventory || ''),
        quest: responseData.data.Quest || '',
        gender: responseData.data.Gender || '',
        registered: responseData.data.Registered || '',
        stats: typeof responseData.data.Stats === 'object' ? JSON.stringify(responseData.data.Stats) : String(responseData.data.Stats || ''),
        gold: responseData.data.Gold || ''
      });
    }

    res.json(responseData);
  } catch (error) {
    console.error('Mystery API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sci-fi API endpoint
router.post('/sci-api', authenticateUser, [
  body('input_text').notEmpty().withMessage('Input text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    if (inputData.toLowerCase().includes('start a new game')) {
      console.log('Executing - Start New Game.');
      await Convo.destroy({ where: { player: username, genre: 'Science Fiction' } });
    }

    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Science Fiction',
        description: { [Op.ne]: '' }
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    let messages = savedData.reverse();

    try {
      const contextData = await Convo.findAll({
        where: { 
          player: username, 
          genre: 'Science Fiction',
          location: mylocation 
        },
        order: [['id', 'DESC']],
        limit: 2,
        raw: true
      });

      if (contextData.length > 0) {
        const context = contextData.reverse();
        messages = [...context, ...messages];
      }
    } catch (error) {
      console.error('Context data error:', error);
    }

    const responseData = await openaiService.processGameTurn(
      username, 
      messages, 
      inputData,
      'scifi'
    );

    if (responseData.data) {
      await Convo.create({
        player: username,
        contentUser: inputData,
        summary: '',
        action: responseData.content,
        genre: responseData.data.Genre || '',
        query: responseData.data.Query || '',
        temp: responseData.data.Temp || '',
        name: responseData.data.Name || '',
        playerClass: responseData.data.Class || '',
        race: responseData.data.Race || '',
        turn: responseData.data.Turn || '',
        timePeriod: responseData.data.Time || '',
        dayNumber: responseData.data.Day || '',
        weather: responseData.data.Weather || '',
        health: responseData.data.Health || '',
        xp: responseData.data.XP || '',
        ac: responseData.data.AC || '',
        level: responseData.data.Level || '',
        description: responseData.data.Description || '',
        location: responseData.data.Location || '',
        exits: Array.isArray(responseData.data.Exits) ? JSON.stringify(responseData.data.Exits) : String(responseData.data.Exits || ''),
        inventory: Array.isArray(responseData.data.Inventory) ? JSON.stringify(responseData.data.Inventory) : String(responseData.data.Inventory || ''),
        quest: responseData.data.Quest || '',
        gender: responseData.data.Gender || '',
        registered: responseData.data.Registered || '',
        stats: typeof responseData.data.Stats === 'object' ? JSON.stringify(responseData.data.Stats) : String(responseData.data.Stats || ''),
        gold: responseData.data.Gold || ''
      });
    }

    res.json(responseData);
  } catch (error) {
    console.error('Sci-fi API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Custom adventure API endpoint
router.post('/custom-api', authenticateUser, [
  body('input_text').notEmpty().withMessage('Input text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    if (inputData.toLowerCase().includes('start a new game')) {
      console.log('Executing - Start New Game.');
      await Convo.destroy({ 
        where: { 
          player: username,
          genre: 'Custom'
        }
      });
    }

    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Custom',
        description: { [Op.ne]: '' }
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    let messages = savedData.reverse();

    try {
      // Get the current location from the most recent conversation
      const mostRecentLocation = messages.length > 0 ? messages[messages.length - 1].location : mylocation;
      
      if (mostRecentLocation && mostRecentLocation !== 'start' && mostRecentLocation !== '') {
        const contextData = await Convo.findAll({
          where: { 
            player: username,
            location: mostRecentLocation,
            genre: 'Custom'
          },
          order: [['id', 'DESC']],
          limit: 2,
          raw: true
        });

        if (contextData.length > 0) {
          const context = contextData.reverse();
          messages = [...context, ...messages];
        }
      }
    } catch (error) {
      console.error('Context data error:', error);
    }

    const responseData = await openaiService.processGameTurn(
      username, 
      messages, 
      inputData,
      'custom'  // Use custom mode for player-specified universes
    );

    if (responseData.data) {
      // Always use 'Custom' as the static genre for custom games to avoid foreign key issues
      const finalGenre = 'Custom';
      
      await Convo.create({
        player: username,
        contentUser: inputData,
        summary: '',
        action: responseData.content,
        genre: finalGenre,
        query: responseData.data.Query || '',
        temp: responseData.data.Temp || '5',
        name: responseData.data.Name || '',
        playerClass: responseData.data.Class || '',
        race: responseData.data.Race || '',
        turn: responseData.data.Turn || '1',
        timePeriod: responseData.data.Time || '',
        dayNumber: responseData.data.Day || '1',
        weather: responseData.data.Weather || '',
        health: responseData.data.Health || '',
        xp: responseData.data.XP || '0',
        ac: responseData.data.AC || '10',
        level: responseData.data.Level || '1',
        description: responseData.data.Description || '',
        quest: responseData.data.Quest || '',
        location: responseData.data.Location || mylocation,
        exits: Array.isArray(responseData.data.Exits) ? JSON.stringify(responseData.data.Exits) : String(responseData.data.Exits || ''),
        inventory: Array.isArray(responseData.data.Inventory) ? JSON.stringify(responseData.data.Inventory) : String(responseData.data.Inventory || ''),
        action: responseData.data.Action || '',
        gender: responseData.data.Gender || '',
        registered: responseData.data.Registered || '',
        stats: typeof responseData.data.Stats === 'object' ? JSON.stringify(responseData.data.Stats) : String(responseData.data.Stats || ''),
        gold: responseData.data.Gold || '0'
      });
    }

    res.json(responseData);
  } catch (error) {
    console.error('Custom API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Image generation endpoint
router.post('/get-pic', authenticateUser, [
  body('description').notEmpty().withMessage('Description is required'),
  body('player').notEmpty().withMessage('Player is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('genre').optional().isString().withMessage('Genre must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, player, location, genre = 'Custom Adventure' } = req.body;

    // Check if image already exists for this location
    const existingPic = await Picmap.findOne({
      where: { player, location },
      order: [['id', 'DESC']]
    });

    if (existingPic) {
      const staticUrl = process.env.STATIC_URL || '/static/uploaded_files/';
      return res.json([{ url: staticUrl + existingPic.picfile }]);
    }

    // Ensure the location exists in the locations table before creating picmap
    const locationExists = await Location.findOne({
      where: { 
        player, 
        name: location,
        genre: genre
      }
    });

    if (!locationExists) {
      console.log(`Location not found: player=${player}, location=${location}, genre=${genre}`);
      return res.status(400).json({ 
        error: 'Location must exist before generating image',
        details: { player, location, genre }
      });
    }

    // Generate new image
    const imageUrl = await openaiService.generateImage(description, player, location, genre);
    const filename = `${Date.now()}.png`;
    
    try {
      await openaiService.saveImage(imageUrl, filename);
      
      // Save to database with foreign key error handling
      try {
        await Picmap.create({
          player,
          location,
          picfile: filename
        });
      } catch (dbError) {
        console.error('Database save error for picmap:', dbError);
        // Don't fail the entire request if DB save fails - just log it
        // The image was still generated and saved to disk
      }

      const staticUrl = process.env.STATIC_URL || '/static/uploaded_files/';
      res.json([{ url: staticUrl + filename }]);
    } catch (saveError) {
      console.error('Image save error:', saveError);
      // Return the original URL if save fails
      res.json([{ url: imageUrl }]);
    }
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// Location image endpoint
router.post('/location-image', authenticateUser, [
  body('location').notEmpty().withMessage('Location is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { location, description = '', genre = 'adventure' } = req.body;
    const username = req.user.username;

    // Check if image already exists for this location
    const existingPic = await Picmap.findOne({
      where: { player: username, location },
      order: [['id', 'DESC']]
    });

    if (existingPic) {
      const staticUrl = '/uploaded_files/';
      return res.json({ imageUrl: staticUrl + existingPic.picfile });
    }

    // If we have a description, generate new image
    if (description && description.trim().length > 10 && process.env.OPENAI_API_KEY) {
      try {
        const imageUrl = await openaiService.generateImage(description, username, location, genre);
        const filename = `${Date.now()}_${location.replace(/[^a-z0-9]/gi, '_')}.png`;
        
        try {
          await openaiService.saveImage(imageUrl, filename);
          
          // Save to database
          await Picmap.create({
            player: username,
            location,
            picfile: filename
          });

          const staticUrl = '/uploaded_files/';
          return res.json({ imageUrl: staticUrl + filename });
        } catch (saveError) {
          console.error('Image save error:', saveError);
          // Return the original URL if save fails
          return res.json({ imageUrl });
        }
      } catch (genError) {
        console.error('Image generation error:', genError);
        // If image generation fails, that's OK - just return no image
        return res.json({ imageUrl: null });
      }
    }

    // No image available
    res.json({ imageUrl: null });
  } catch (error) {
    console.error('Location image error:', error);
    res.status(500).json({ error: 'Failed to get location image' });
  }
});

// Clear instruction cache endpoint - for testing instruction updates
router.post('/clear-cache', authenticateUser, (req, res) => {
  try {
    openaiService.clearInstructionCache();
    res.json({ success: true, message: 'Instruction cache cleared successfully' });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Complete database wipe for current user - for debugging
router.post('/wipe-all-data', authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;
    
    // Declare variables outside try block to ensure they're accessible
    let convoCount = 0;
    let locationCount = 0;
    let imageCount = 0;
    
    // Temporarily disable foreign key checks to avoid constraint issues
    await db.sequelize.query('PRAGMA foreign_keys=OFF');
    
    try {
      // Clear ALL conversations for this user
      convoCount = await Convo.destroy({ where: { player: username } });
      
      // Clear ALL locations and images for this user
      locationCount = await Location.destroy({ where: { player: username } });
      imageCount = await Picmap.destroy({ where: { player: username } });
      
      // Re-enable foreign key checks
      await db.sequelize.query('PRAGMA foreign_keys=ON');
      
      // Clear instruction cache to ensure fresh instructions
      openaiService.clearInstructionCache();
      
      console.log(`COMPLETE DATA WIPE for ${username}: ${convoCount} conversations, ${locationCount} locations, ${imageCount} images cleared`);
    } catch (error) {
      // Make sure to re-enable foreign keys even if there's an error
      await db.sequelize.query('PRAGMA foreign_keys=ON');
      throw error;
    }
    
    res.json({ 
      success: true, 
      message: 'All user data completely wiped',
      cleared: {
        conversations: convoCount,
        locations: locationCount,
        images: imageCount
      }
    });
  } catch (error) {
    console.error('Complete wipe error:', error);
    res.status(500).json({ error: 'Failed to wipe data' });
  }
});

// Restart game endpoint - clears all user's game data
router.post('/restart-game', authenticateUser, [
  body('gameType').optional().isIn(['adventure', 'scifi', 'mystery', 'custom']).withMessage('Invalid game type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { gameType } = req.body;
    const username = req.user.username;

    // Clear user's conversation data (optionally for specific game type)
    const whereClause = { player: username };
    if (gameType) {
      // Map gameType to actual genre values stored in database
      const genreMap = {
        'adventure': 'Fantasy Adventure',
        'scifi': 'Science Fiction', 
        'mystery': 'Mystery',
        'custom': { [Op.like]: '%' } // Custom can be any genre, so match all
      };
      
      if (gameType === 'custom') {
        // For custom, use the static 'Custom' genre
        whereClause.genre = 'Custom';
      } else {
        whereClause.genre = genreMap[gameType] || gameType;
      }
    }

    // Clear conversations
    const convoCount = await Convo.destroy({ where: whereClause });
    
    // Clear locations (optionally for specific game type)
    const locationWhereClause = { player: username };
    if (gameType) {
      // Use the same genre mapping as conversations
      const genreMap = {
        'adventure': 'Fantasy Adventure',
        'scifi': 'Science Fiction', 
        'mystery': 'Mystery',
        'custom': { [Op.like]: '%' }
      };
      
      if (gameType === 'custom') {
        // For custom, use the static 'Custom' genre
        locationWhereClause.genre = 'Custom';
      } else {
        locationWhereClause.genre = genreMap[gameType] || gameType;
      }
    }
    // Declare variables outside try block to ensure they're accessible
    let imageCount = 0;
    let locationCount = 0;
    
    // Temporarily disable foreign key checks to avoid constraint issues
    await db.sequelize.query('PRAGMA foreign_keys=OFF');
    
    try {
      // Clear images and locations
      imageCount = await Picmap.destroy({ where: { player: username } });
      locationCount = await Location.destroy({ where: locationWhereClause });
      
      // Re-enable foreign key checks
      await db.sequelize.query('PRAGMA foreign_keys=ON');
      
      console.log(`Game restart for ${username}: ${convoCount} conversations, ${locationCount} locations, ${imageCount} images cleared`);
    } catch (error) {
      // Make sure to re-enable foreign keys even if there's an error
      await db.sequelize.query('PRAGMA foreign_keys=ON');
      throw error;
    }

    res.json({ 
      success: true, 
      message: gameType ? `${gameType} game restarted successfully` : 'All games restarted successfully',
      cleared: {
        conversations: convoCount,
        locations: locationCount,
        images: imageCount
      }
    });
  } catch (error) {
    console.error('Game restart error:', error);
    res.status(500).json({ error: 'Failed to restart game' });
  }
});

module.exports = router;