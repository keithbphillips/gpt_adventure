const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateUser } = require('../middleware/auth');
const { Convo, Picmap, Location, Quest } = require('../models');
const db = require('../models');
const openaiService = require('../services/openaiService');
const { Op } = require('sequelize');

const router = express.Router();

// Simplified fantasy-only game endpoint
router.post('/fantasy-game', authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    console.log(`🎮 Fantasy game command from ${username}: ${command}`);
    
    // Get the most recent game state from database
    const lastConvo = await Convo.findOne({
      where: { 
        player: username,
        genre: 'fantasy D&D'
      },
      order: [['id', 'DESC']]
    });
    
    let previousGameState = null;
    if (lastConvo) {
      // Reconstruct game state from database record
      previousGameState = {
        Summary: lastConvo.summary || '',
        Query: command, // Store the current command
        Temp: lastConvo.temp || '5',
        Registered: lastConvo.registered || '',
        Name: lastConvo.name || '',
        Gender: lastConvo.gender || '',
        Class: lastConvo.playerClass || '',
        Race: lastConvo.race || '',
        Turn: lastConvo.turn || '1',
        Time: lastConvo.timePeriod || '',
        Day: lastConvo.dayNumber || '',
        Weather: lastConvo.weather || '',
        Health: lastConvo.health || '',
        Gold: lastConvo.gold || '',
        XP: lastConvo.xp || '',
        AC: lastConvo.ac || '',
        Level: lastConvo.level || '',
        Description: lastConvo.description || '',
        Quest: lastConvo.quest || '',
        Location: lastConvo.location || '',
        Exits: {}, // Exits will come from location database or AI response
        Stats: lastConvo.stats ? JSON.parse(lastConvo.stats) : {},
        Inventory: lastConvo.inventory ? JSON.parse(lastConvo.inventory) : [],
        Genre: 'fantasy D&D'
      };
    }
    
    // Process the game turn
    const result = await openaiService.processFantasyGame(username, command, previousGameState);
    
    // Save the new game state to database
    if (result.gameState) {
      const newConvo = await Convo.create({
        player: username,
        datetime: new Date(),
        summary: result.gameState.Summary || '',
        query: command,
        temp: result.gameState.Temp || '5',
        registered: result.gameState.Registered || '',
        name: result.gameState.Name || '',
        gender: result.gameState.Gender || '',
        playerClass: result.gameState.Class || '',
        race: result.gameState.Race || '',
        turn: result.gameState.Turn || '1',
        timePeriod: result.gameState.Time || '',
        dayNumber: result.gameState.Day || '',
        weather: result.gameState.Weather || '',
        health: result.gameState.Health || '',
        gold: result.gameState.Gold || '',
        xp: result.gameState.XP || '',
        ac: result.gameState.AC || '',
        level: result.gameState.Level || '',
        description: result.gameState.Description || '',
        quest: result.gameState.Quest || '',
        location: result.gameState.Location || '',
        inventory: JSON.stringify(result.gameState.Inventory || []),
        stats: JSON.stringify(result.gameState.Stats || {}),
        genre: 'fantasy D&D',
        action: result.narrative,
        conversation: result.rawResponse
      });
      
      console.log('✅ Saved game state to database:', newConvo.id);
    }
    
    // Return simplified response
    res.json({
      narrative: result.narrative,
      gameState: result.gameState,
      success: true
    });
    
  } catch (error) {
    console.error('❌ Fantasy game error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to generate and populate world locations
async function generateWorldLocations(username, genre = 'fantasy D&D', customWorldData = null) {
  try {
    console.log('\n🌍 ===== GENERATING WORLD LOCATIONS =====');
    console.log(`Player: ${username}, Genre: ${genre}`);

    // Check if world already exists for this player/genre
    const existingLocations = await Location.count({
      where: { player: username, genre: genre }
    });

    if (existingLocations > 0) {
      console.log(`🌍 World already exists (${existingLocations} locations), skipping generation`);
      return existingLocations;
    }

    // Validate required parameters
    if (!username || !genre) {
      throw new Error(`Missing required parameters: username=${username}, genre=${genre}`);
    }

    // Map genre to game type
    const genreToGameType = {
      'fantasy D&D': 'adventure',
      'Science Fiction': 'scifi', 
      'Mystery': 'mystery',
      'Custom': 'custom'
    };
    
    const gameType = genreToGameType[genre] || 'adventure';
    console.log(`🎮 Game type: ${gameType}`);

    // Generate world using OpenAI with appropriate game type
    const worldData = await openaiService.generateWorld(username, gameType, customWorldData);
    
    // Parse JSON response
    console.log('🔧 Parsing world JSON data...');
    console.log('Raw world data length:', worldData.length);
    console.log('Raw world data preview:', worldData.substring(0, 500));
    
    let locations;
    try {
      // Clean up the response - remove any markdown formatting
      let cleanedData = worldData;
      console.log('🔧 Original data starts with:', cleanedData.substring(0, 50));
      
      if (cleanedData.includes('```json')) {
        cleanedData = cleanedData.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        console.log('🔧 Removed markdown formatting');
      }
      if (cleanedData.includes('json\n')) {
        cleanedData = cleanedData.replace(/json\n/g, '');
        console.log('🔧 Removed json label');
      }
      
      console.log('🔧 Cleaned data starts with:', cleanedData.substring(0, 50));
      console.log('🔧 Attempting JSON.parse...');
      
      // Try to repair common JSON issues
      let jsonToTry = cleanedData.trim();
      
      // If JSON appears truncated (doesn't end with ]), try to fix it
      if (jsonToTry.startsWith('[') && !jsonToTry.endsWith(']')) {
        console.log('🔧 JSON appears truncated, attempting to repair...');
        // Find the last complete object
        let lastCompleteIndex = jsonToTry.lastIndexOf('}');
        if (lastCompleteIndex > 0) {
          jsonToTry = jsonToTry.substring(0, lastCompleteIndex + 1) + ']';
          console.log('🔧 Repaired JSON ending');
        }
      }
      
      locations = JSON.parse(jsonToTry);
      console.log('✅ Successfully parsed JSON');
    } catch (parseError) {
      console.error('❌ Failed to parse world JSON:', parseError);
      console.error('❌ Cleaned data that failed:', cleanedData.substring(0, 1000));
      throw new Error(`Failed to parse world generation response: ${parseError.message}`);
    }

    if (!Array.isArray(locations)) {
      throw new Error('World generation did not return an array of locations');
    }

    console.log(`🔧 Successfully parsed ${locations.length} locations`);

    // Insert locations into database
    console.log('💾 Inserting locations into database...');
    console.log('💾 Sample location data:', JSON.stringify(locations[0], null, 2));
    
    const locationRecords = locations.map((location, index) => {
      if (!location.name || !location.description) {
        console.warn(`⚠️ Location ${index} missing required fields:`, location);
      }
      return {
        name: location.name || `Unknown Location ${index}`,
        description: location.description || 'No description available.',
        exits: JSON.stringify(location.exits || {}),
        player: username,
        genre: genre
      };
    });

    console.log('💾 Created', locationRecords.length, 'location records');
    console.log('💾 Sample record:', JSON.stringify(locationRecords[0], null, 2));

    try {
      const insertedLocations = await Location.bulkCreate(locationRecords, {
        validate: true,
        ignoreDuplicates: true
      });

      console.log(`✅ Successfully created ${insertedLocations.length} location records`);
      
      // Verify insertion by counting
      const verifyCount = await Location.count({
        where: { player: username, genre: genre }
      });
      console.log(`✅ Verification: Found ${verifyCount} locations in database`);
      
      // Generate quests after world creation
      try {
        console.log('🎯 Starting quest generation...');
        const quests = await openaiService.generateQuests(username, gameType, locations);
        
        // Save quests to database
        const questRecords = quests.map(quest => ({
          title: quest.title,
          description: quest.description,
          starting_location: quest.starting_location,
          related_locations: JSON.stringify(quest.related_locations || []),
          required_items: JSON.stringify(quest.required_items || []),
          success_condition: quest.success_condition,
          xp_reward: quest.xp_reward || 100,
          player: username,
          genre: genre,
          status: 'available'
        }));

        const insertedQuests = await Quest.bulkCreate(questRecords, {
          validate: true,
          ignoreDuplicates: true
        });

        console.log(`✅ Successfully created ${insertedQuests.length} quest records`);
      } catch (questError) {
        console.error('❌ Quest generation failed:', questError);
        console.error('❌ Quest error stack:', questError.stack);
        console.error('❌ Quest error message:', questError.message);
        // Don't fail the entire world generation if quests fail
        console.log('⚠️ Continuing without quests - world generation still successful');
      }
      
      console.log('🌍 ===== WORLD GENERATION COMPLETE =====\n');
      return insertedLocations.length;
    } catch (insertError) {
      console.error('❌ Database insertion failed:', insertError);
      throw new Error(`Failed to insert locations: ${insertError.message}`);
    }
  } catch (error) {
    console.error('❌ World generation failed:', error);
    throw error;
  }
}

// Adventure API endpoint
router.post('/adv-api', authenticateUser, [
  body('input_text').notEmpty().withMessage('Input text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    let { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    // Check if starting new game
    if (inputData.toLowerCase().includes('start a new game')) {
        await Convo.destroy({ where: { player: username, genre: 'fantasy D&D' } });
        // Also clear locations for fresh world generation
        await Location.destroy({ where: { player: username, genre: 'fantasy D&D' } });
    }

    // Get saved conversation data
    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'fantasy D&D'
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    console.log('=== LOADING FROM DATABASE ===');
    console.log('Found', savedData.length, 'records');
    if (savedData.length > 0) {
      console.log('Latest record:', JSON.stringify(savedData[0], null, 2));
    }
    console.log('=== END DATABASE LOAD ===');

    // Generate world if this is the first game for this player OR if no world locations exist
    const existingLocations = await Location.count({
      where: { player: username, genre: 'fantasy D&D' }
    });
    
    // Only generate world if no locations exist (world generation is only needed once)
    if (existingLocations === 0) {
      console.log(`🌍 Adventure world needed for ${username} (locations: ${existingLocations})`);
      
      try {
        // Perform world generation synchronously
        await generateWorldLocations(username, 'fantasy D&D');
        console.log('✅ Adventure world generation completed successfully');
        
        // After world generation, automatically execute "look around" command
        console.log('🎮 Auto-executing look around command after world generation');
        inputData = 'look around';
        mylocation = 'start';
        
      } catch (worldGenError) {
        console.error('❌ Adventure world generation failed:', worldGenError);
        console.error('❌ Stack trace:', worldGenError.stack);
        
        // Return error response if world generation fails
        return res.status(500).json({
          success: false,
          error: 'World generation failed. Please try again.',
          content: 'Error: World generation failed.'
        });
      }
    }

    let messages = savedData.reverse();

    // Get location-specific context
    try {
      const contextData = await Convo.findAll({
        where: { 
          player: username, 
          genre: 'fantasy D&D',
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
    }

    // Load available quests for this player
    let availableQuests = [];
    try {
      const quests = await Quest.findAll({
        where: { 
          player: username, 
          genre: 'fantasy D&D',
          status: 'available'
        },
        order: [['id', 'ASC']],
        raw: true
      });

      availableQuests = quests.map(quest => ({
        title: quest.title,
        description: quest.description,
        starting_location: quest.starting_location,
        related_locations: JSON.parse(quest.related_locations || '[]'),
        required_items: JSON.parse(quest.required_items || '[]'),
        success_condition: quest.success_condition,
        xp_reward: quest.xp_reward
      }));

      console.log(`🎯 Loaded ${availableQuests.length} available quests for ${username}`);
    } catch (questError) {
      console.error('❌ Failed to load quests:', questError);
    }

    // Use the simplified fantasy game processing
    const result = await openaiService.processFantasyGame(username, inputData, null, availableQuests);

    // Save the new game state to database
    if (result.gameState) {
      await Convo.create({
        player: username,
        datetime: new Date(),
        summary: result.gameState.Summary || '',
        query: inputData,
        temp: result.gameState.Temp || '5',
        registered: result.gameState.Registered || '',
        name: result.gameState.Name || '',
        gender: result.gameState.Gender || '',
        playerClass: result.gameState.Class || '',
        race: result.gameState.Race || '',
        turn: result.gameState.Turn || '1',
        timePeriod: result.gameState.Time || '',
        dayNumber: result.gameState.Day || '',
        weather: result.gameState.Weather || '',
        health: result.gameState.Health || '',
        gold: result.gameState.Gold || '',
        xp: result.gameState.XP || '',
        ac: result.gameState.AC || '',
        level: result.gameState.Level || '',
        description: result.gameState.Description || '',
        quest: result.gameState.Quest || '',
        location: result.gameState.Location || '',
        inventory: JSON.stringify(result.gameState.Inventory || []),
        stats: JSON.stringify(result.gameState.Stats || {}),
        genre: 'fantasy D&D',
        action: result.narrative,
        conversation: result.rawResponse
      });
      
      console.log('✅ Saved adventure game state to database');
      
      // Update location description if we have location and description data
      if (result.gameState.Location && result.gameState.Description) {
        try {
          await Location.update(
            { description: result.gameState.Description },
            {
              where: {
                name: result.gameState.Location,
                player: username,
                genre: 'fantasy D&D'
              }
            }
          );
          console.log(`📍 Updated location description for: ${result.gameState.Location}`);
        } catch (locationError) {
          console.error('❌ Failed to update location description:', locationError);
        }
      }
    }

    // Return response in the format expected by existing frontend
    res.json({
      content: result.narrative,
      data: result.gameState,
      rawResponse: result.rawResponse
    });
  } catch (error) {
    console.error('❌ Adventure API error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
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

    let { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    // Same logic as adventure but with mystery game type
    if (inputData.toLowerCase().includes('start a new game')) {
        await Convo.destroy({ where: { player: username, genre: 'Mystery' } });
    }

    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Mystery'
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    console.log('=== LOADING FROM DATABASE (MYSTERY) ===');
    console.log('Found', savedData.length, 'records');
    if (savedData.length > 0) {
      console.log('Latest record:', JSON.stringify(savedData[0], null, 2));
    }
    console.log('=== END DATABASE LOAD (MYSTERY) ===');

    // Generate world if this is the first game for this player OR if no world locations exist
    const existingLocations = await Location.count({
      where: { player: username, genre: 'Mystery' }
    });
    
    // Only generate world if no locations exist (world generation is only needed once)
    if (existingLocations === 0) {
      console.log(`🌍 Mystery world needed for ${username} (locations: ${existingLocations})`);
      
      try {
        // Perform world generation synchronously
        await generateWorldLocations(username, 'Mystery');
        console.log('✅ Mystery world generation completed successfully');
        
        // After world generation, automatically execute "look around" command
        console.log('🎮 Auto-executing look around command after world generation');
        inputData = 'look around';
        mylocation = 'start';
        
      } catch (worldGenError) {
        console.error('❌ Mystery world generation failed:', worldGenError);
        console.error('❌ Stack trace:', worldGenError.stack);
        
        // Return error response if world generation fails
        return res.status(500).json({
          success: false,
          error: 'World generation failed. Please try again.',
          content: 'Error: World generation failed.'
        });
      }
    }

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
    }

    // Load available quests for this player
    let availableQuests = [];
    try {
      const quests = await Quest.findAll({
        where: { 
          player: username, 
          genre: 'Mystery',
          status: 'available'
        },
        order: [['id', 'ASC']],
        raw: true
      });

      availableQuests = quests.map(quest => ({
        title: quest.title,
        description: quest.description,
        starting_location: quest.starting_location,
        related_locations: JSON.parse(quest.related_locations || '[]'),
        required_items: JSON.parse(quest.required_items || '[]'),
        success_condition: quest.success_condition,
        xp_reward: quest.xp_reward
      }));

      console.log(`🎯 Loaded ${availableQuests.length} available quests for ${username}`);
    } catch (questError) {
      console.error('❌ Failed to load quests:', questError);
    }

    // Use the simplified mystery game processing
    const result = await openaiService.processMysteryGame(username, inputData, null, availableQuests);

    // Save the new game state to database
    if (result.gameState) {
      await Convo.create({
        player: username,
        datetime: new Date(),
        summary: result.gameState.Summary || '',
        query: inputData,
        temp: result.gameState.Temp || '5',
        registered: result.gameState.Registered || '',
        name: result.gameState.Name || '',
        gender: result.gameState.Gender || '',
        playerClass: result.gameState.Class || '',
        race: result.gameState.Race || '',
        turn: result.gameState.Turn || '1',
        timePeriod: result.gameState.Time || '',
        dayNumber: result.gameState.Day || '',
        weather: result.gameState.Weather || '',
        health: result.gameState.Health || '',
        gold: result.gameState.Gold || '',
        xp: result.gameState.XP || '',
        ac: result.gameState.AC || '',
        level: result.gameState.Level || '',
        description: result.gameState.Description || '',
        quest: result.gameState.Quest || '',
        location: result.gameState.Location || '',
        inventory: JSON.stringify(result.gameState.Inventory || []),
        stats: JSON.stringify(result.gameState.Stats || {}),
        genre: 'Mystery',
        action: result.narrative,
        conversation: result.rawResponse
      });
      
      console.log('✅ Saved mystery game state to database');
      
      // Update location description if we have location and description data
      if (result.gameState.Location && result.gameState.Description) {
        try {
          await Location.update(
            { description: result.gameState.Description },
            {
              where: {
                name: result.gameState.Location,
                player: username,
                genre: 'Mystery'
              }
            }
          );
          console.log(`📍 Updated location description for: ${result.gameState.Location}`);
        } catch (locationError) {
          console.error('❌ Failed to update location description:', locationError);
        }
      }
    }

    // Return response in the format expected by existing frontend
    res.json({
      content: result.narrative,
      data: result.gameState,
      rawResponse: result.rawResponse
    });
  } catch (error) {
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

    let { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    if (inputData.toLowerCase().includes('start a new game')) {
        await Convo.destroy({ where: { player: username, genre: 'Science Fiction' } });
    }

    const savedData = await Convo.findAll({
      where: { 
        player: username,
        genre: 'Science Fiction'
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    console.log('=== LOADING FROM DATABASE (SCIFI) ===');
    console.log('Found', savedData.length, 'records');
    if (savedData.length > 0) {
      console.log('Latest record:', JSON.stringify(savedData[0], null, 2));
    }
    console.log('=== END DATABASE LOAD (SCIFI) ===');

    // Generate world if this is the first game for this player OR if no world locations exist
    const existingLocations = await Location.count({
      where: { player: username, genre: 'Science Fiction' }
    });
    
    // Only generate world if no locations exist (world generation is only needed once)
    if (existingLocations === 0) {
      console.log(`🌍 Sci-fi world needed for ${username} (locations: ${existingLocations})`);
      
      try {
        // Perform world generation synchronously
        await generateWorldLocations(username, 'Science Fiction');
        console.log('✅ Sci-fi world generation completed successfully');
        
        // After world generation, automatically execute "look around" command
        console.log('🎮 Auto-executing look around command after world generation');
        inputData = 'look around';
        mylocation = 'start';
        
      } catch (worldGenError) {
        console.error('❌ Sci-fi world generation failed:', worldGenError);
        console.error('❌ Stack trace:', worldGenError.stack);
        
        // Return error response if world generation fails
        return res.status(500).json({
          success: false,
          error: 'World generation failed. Please try again.',
          content: 'Error: World generation failed.'
        });
      }
    }

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
    }

    // Load available quests for this player
    let availableQuests = [];
    try {
      const quests = await Quest.findAll({
        where: { 
          player: username, 
          genre: 'Science Fiction',
          status: 'available'
        },
        order: [['id', 'ASC']],
        raw: true
      });

      availableQuests = quests.map(quest => ({
        title: quest.title,
        description: quest.description,
        starting_location: quest.starting_location,
        related_locations: JSON.parse(quest.related_locations || '[]'),
        required_items: JSON.parse(quest.required_items || '[]'),
        success_condition: quest.success_condition,
        xp_reward: quest.xp_reward
      }));

      console.log(`🎯 Loaded ${availableQuests.length} available quests for ${username}`);
    } catch (questError) {
      console.error('❌ Failed to load quests:', questError);
    }

    // Use the simplified sci-fi game processing
    const result = await openaiService.processScifiGame(username, inputData, null, availableQuests);

    // Save the new game state to database
    if (result.gameState) {
      await Convo.create({
        player: username,
        datetime: new Date(),
        summary: result.gameState.Summary || '',
        query: inputData,
        temp: result.gameState.Temp || '5',
        registered: result.gameState.Registered || '',
        name: result.gameState.Name || '',
        gender: result.gameState.Gender || '',
        playerClass: result.gameState.Class || '',
        race: result.gameState.Race || '',
        turn: result.gameState.Turn || '1',
        timePeriod: result.gameState.Time || '',
        dayNumber: result.gameState.Day || '',
        weather: result.gameState.Weather || '',
        health: result.gameState.Health || '',
        gold: result.gameState.Gold || '',
        xp: result.gameState.XP || '',
        ac: result.gameState.AC || '',
        level: result.gameState.Level || '',
        description: result.gameState.Description || '',
        quest: result.gameState.Quest || '',
        location: result.gameState.Location || '',
        inventory: JSON.stringify(result.gameState.Inventory || []),
        stats: JSON.stringify(result.gameState.Stats || {}),
        genre: 'Science Fiction',
        action: result.narrative,
        conversation: result.rawResponse
      });
      
      console.log('✅ Saved sci-fi game state to database');
      
      // Update location description if we have location and description data
      if (result.gameState.Location && result.gameState.Description) {
        try {
          await Location.update(
            { description: result.gameState.Description },
            {
              where: {
                name: result.gameState.Location,
                player: username,
                genre: 'Science Fiction'
              }
            }
          );
          console.log(`📍 Updated location description for: ${result.gameState.Location}`);
        } catch (locationError) {
          console.error('❌ Failed to update location description:', locationError);
        }
      }
    }

    // Return response in the format expected by existing frontend
    res.json({
      content: result.narrative,
      data: result.gameState,
      rawResponse: result.rawResponse
    });
  } catch (error) {
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

    let { input_text: inputData, mylocation = 'start' } = req.body;
    const username = req.user.username; // Get username from authenticated user

    if (inputData.toLowerCase().includes('start a new game')) {
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
        genre: 'Custom'
      },
      order: [['id', 'DESC']],
      limit: 7,
      raw: true
    });

    console.log('=== LOADING FROM DATABASE (CUSTOM) ===');
    console.log('Found', savedData.length, 'records');
    if (savedData.length > 0) {
      console.log('Latest record:', JSON.stringify(savedData[0], null, 2));
    }
    console.log('=== END DATABASE LOAD (CUSTOM) ===');

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
    }

    const responseData = await openaiService.processGameTurn(
      username, 
      messages, 
      inputData,
      'custom'  // Use custom mode for player-specified universes
    );

    if (responseData.data && inputData.trim()) {
      
      const savedRecord = await Convo.create({
        player: username,
        contentUser: inputData,
        contentAssistant: responseData.content,
        summary: responseData.data.summary || '',
        action: responseData.data.action || responseData.content,
        genre: responseData.data.genre || 'Custom',
        query: responseData.data.query || '',
        temp: responseData.data.temp || '5',
        name: responseData.data.name || '',
        playerClass: responseData.data.playerClass || '',
        race: responseData.data.race || '',
        turn: responseData.data.turn || '1',
        timePeriod: responseData.data.timePeriod || '',
        dayNumber: responseData.data.dayNumber || '1',
        weather: responseData.data.weather || '',
        health: responseData.data.health || '',
        xp: responseData.data.xp || '0',
        ac: responseData.data.ac || '10',
        level: responseData.data.level || '1',
        description: responseData.data.description || '',
        quest: responseData.data.quest || '',
        location: responseData.data.location || mylocation,
        exits: responseData.data.exits || '',
        inventory: responseData.data.inventory || '',
        gender: responseData.data.gender || '',
        registered: responseData.data.registered || '',
        stats: responseData.data.stats || '',
        gold: responseData.data.gold || '0',
        conversation: responseData.rawResponse || ''
      });
      
      // Trigger custom world generation when player gets registered
      if (responseData.data.registered === 'true') {
        console.log('🎨 Player just got registered, checking if custom world generation needed...');
        
        // Check if world already exists
        const existingLocations = await Location.count({
          where: { player: username, genre: 'Custom' }
        });
        
        if (existingLocations === 0) {
          console.log('🌍 Generating custom world asynchronously...');
          
          // Extract custom world data from the game state and responses
          const customWorldData = {
            worldDescription: responseData.data.genre || 'custom world',
            locationExamples: 'various locations appropriate for the custom setting'
          };
          
          // Generate world asynchronously to not block the response
          generateWorldLocations(username, 'Custom', customWorldData).catch(error => {
            console.error('❌ Async custom world generation failed:', error);
          });
        }
      }
    }

    res.json(responseData);
  } catch (error) {
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

    // Map frontend genre to database genre values
    const genreMap = {
      'adventure': 'fantasy D&D',
      'scifi': 'Science Fiction',
      'mystery': 'Mystery',
      'custom': 'Custom'
    };
    const dbGenre = genreMap[genre.toLowerCase()] || genre;

    // Check if image already exists for this location and genre
    const existingPic = await Picmap.findOne({
      where: { player, location, genre: dbGenre },
      order: [['id', 'DESC']]
    });

    if (existingPic) {
      const staticUrl = process.env.STATIC_URL || '/static/uploaded_files/';
      return res.json([{ url: staticUrl + existingPic.picfile }]);
    }

    // No need to check location existence anymore - images can be generated directly

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
          genre: dbGenre,
          picfile: filename
        });
      } catch (dbError) {
        // Don't fail the entire request if DB save fails - just log it
        // The image was still generated and saved to disk
      }

      const staticUrl = process.env.STATIC_URL || '/static/uploaded_files/';
      res.json([{ url: staticUrl + filename }]);
    } catch (saveError) {
      // Return the original URL if save fails
      res.json([{ url: imageUrl }]);
    }
  } catch (error) {
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

    // Map frontend genre to database genre values
    const genreMap = {
      'adventure': 'fantasy D&D',
      'scifi': 'Science Fiction',
      'mystery': 'Mystery',
      'custom': 'Custom'
    };
    const dbGenre = genreMap[genre.toLowerCase()] || genre;

    // Check if image already exists for this location and genre
    const existingPic = await Picmap.findOne({
      where: { player: username, location, genre: dbGenre },
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
            genre: dbGenre,
            picfile: filename
          });

          const staticUrl = '/uploaded_files/';
          return res.json({ imageUrl: staticUrl + filename });
        } catch (saveError) {
              // Return the original URL if save fails
          return res.json({ imageUrl });
        }
      } catch (genError) {
        // If image generation fails, that's OK - just return no image
        return res.json({ imageUrl: null });
      }
    }

    // No image available
    res.json({ imageUrl: null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get location image' });
  }
});

// Clear instruction cache endpoint - for testing instruction updates
router.post('/clear-cache', authenticateUser, (req, res) => {
  try {
    openaiService.clearInstructionCache();
    res.json({ success: true, message: 'Instruction cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Manual world generation endpoint (for testing)
router.post('/generate-world', authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;
    const { genre = 'fantasy D&D', force = false } = req.body;
    
    let deletedLocations = 0, deletedConvos = 0, deletedImages = 0;
    
    // If force is true, delete existing world first
    if (force) {
      console.log(`🗑️ Force regeneration - clearing all data for ${username}, genre: ${genre}`);
      
      // Clear locations
      deletedLocations = await Location.destroy({ 
        where: { player: username, genre: genre } 
      });
      console.log(`🗑️ Deleted ${deletedLocations} existing locations`);
      
      // Clear conversations for this genre
      deletedConvos = await Convo.destroy({
        where: { player: username, genre: genre }
      });
      console.log(`🗑️ Deleted ${deletedConvos} conversation records`);
      
      // Clear images for this genre (handle missing genre column gracefully)
      try {
        deletedImages = await Picmap.destroy({
          where: { player: username, genre: genre }
        });
        console.log(`🗑️ Deleted ${deletedImages} image records`);
      } catch (dbError) {
        if (dbError.message.includes('no such column: genre')) {
          console.log('🗑️ Genre column not found in picmaps table, clearing all images for player');
          deletedImages = await Picmap.destroy({
            where: { player: username }
          });
          console.log(`🗑️ Deleted ${deletedImages} image records (all genres)`);
        } else {
          throw dbError;
        }
      }
    }
    
    const locationCount = await generateWorldLocations(username, genre);
    
    res.json({
      success: true,
      message: `Generated ${locationCount} locations`,
      player: username,
      genre: genre,
      cleared: force ? {
        locations: deletedLocations,
        conversations: deletedConvos,
        images: deletedImages
      } : null
    });
  } catch (error) {
    console.error('Manual world generation failed:', error);
    res.status(500).json({ 
      error: 'Failed to generate world',
      details: error.message 
    });
  }
});

// Get world locations for current user
router.get('/world-locations', authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;
    const { genre = 'fantasy D&D', search } = req.query;
    
    let whereClause = { player: username, genre: genre };
    
    // Optional search by location name
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }
    
    const locations = await Location.findAll({
      where: whereClause,
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'description', 'exits']
    });

    res.json({ 
      success: true, 
      count: locations.length,
      locations: locations 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch world locations' });
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
      
      // Clear images for this user (no more location table)
      imageCount = await Picmap.destroy({ where: { player: username } });
      
      // Re-enable foreign key checks
      await db.sequelize.query('PRAGMA foreign_keys=ON');
      
      // Clear instruction cache to ensure fresh instructions
      openaiService.clearInstructionCache();
      
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
        images: imageCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to wipe data' });
  }
});

// Restart game endpoint - clears all user's game data for specific genre
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

    // Build where clause for genre-specific or all-genre clearing
    const whereClause = { player: username };
    if (gameType) {
      // Map gameType to actual genre values stored in database
      const genreMap = {
        'adventure': 'fantasy D&D',
        'scifi': 'Science Fiction', 
        'mystery': 'Mystery',
        'custom': 'Custom'
      };
      
      whereClause.genre = genreMap[gameType] || gameType;
    }

    console.log(`🗑️ Restarting game for player: ${username}, gameType: ${gameType || 'ALL'}`);
    console.log('🗑️ Where clause:', whereClause);

    // Get location names before clearing (needed for image cleanup)
    let locationNames = [];
    try {
      if (gameType) {
        locationNames = await Location.findAll({
          where: whereClause,
          attributes: ['name'],
          raw: true
        });
      }
    } catch (error) {
      console.warn('⚠️ Location lookup failed (table may not exist yet):', error.message);
    }

    // Clear conversations
    const convoCount = await Convo.destroy({ where: whereClause });
    console.log(`🗑️ Cleared ${convoCount} conversation records`);
    
    // Note: Locations are no longer cleared on game restart - use separate world regeneration endpoint
    
    // Clear images - use genre-specific clearing if gameType specified
    let imageCount = 0;
    try {
      if (gameType) {
        // For genre-specific restart, clear images for that specific genre
        const genreMap = {
          'adventure': 'fantasy D&D',
          'scifi': 'Science Fiction', 
          'mystery': 'Mystery',
          'custom': 'Custom'
        };
        const dbGenre = genreMap[gameType] || gameType;
        
        try {
          imageCount = await Picmap.destroy({ 
            where: { 
              player: username,
              genre: dbGenre
            } 
          });
        } catch (dbError) {
          if (dbError.message.includes('no such column: genre')) {
            console.warn('⚠️ Genre column not found in picmaps table, clearing all images for player');
            imageCount = await Picmap.destroy({ where: { player: username } });
          } else {
            throw dbError;
          }
        }
      } else {
        // For full restart, clear all images for this user
        imageCount = await Picmap.destroy({ where: { player: username } });
      }
      console.log(`🗑️ Cleared ${imageCount} image records`);
    } catch (error) {
      console.warn('⚠️ Image clearing failed:', error.message);
    }

    res.json({ 
      success: true, 
      message: gameType ? `${gameType} game restarted successfully` : 'All games restarted successfully',
      cleared: {
        conversations: convoCount,
        images: imageCount
      }
    });
  } catch (error) {
    console.error('❌ Restart game failed:', error);
    res.status(500).json({ error: 'Failed to restart game' });
  }
});

module.exports = router;