const OpenAI = require('openai');
const { encoding_for_model } = require('tiktoken');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class OpenAIService {
  constructor() {
    console.log('\n🤖 =============== INITIALIZING OPENAI SERVICE ===============');
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.encoding = encoding_for_model('gpt-4');
    this.instructionsCache = new Map(); // Cache for game instructions
    console.log('🤖 =============== OPENAI SERVICE READY ===============\n');
  }

  // Clear instruction cache (useful when instructions are updated)
  clearInstructionCache() {
    this.instructionsCache.clear();
  }

  // Generate a summary of recent descriptions from conversation history for better context memory
  generateConversationSummary(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'Beginning of adventure.';
    }
    
    // Extract description fields from recent conversations (up to last 5-7 entries)
    const descriptions = conversationHistory
      .slice(0, 7) // Take up to 7 most recent conversations
      .map(convo => convo.Description || convo.description)
      .filter(desc => desc && desc.trim() && desc !== '-')
      .reverse(); // Put in chronological order (oldest first)
    
    if (descriptions.length === 0) {
      return 'Beginning of adventure.';
    }
    
    // Join descriptions with a separator to create a flowing summary
    const summary = descriptions
      .join(' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Limit summary length to avoid token bloat
    if (summary.length > 800) {
      return summary.substring(0, 800) + '...';
    }
    
    return summary;
  }

  // Check token count to stay within limits (improved for better context)
  checkTokenCount(eventList, maxTokens = 6000) { // Increased for better story continuity
    const shortList = [];
    const checkList = [...eventList].reverse();
    
    for (const event of checkList) {
      shortList.unshift(event);
      // Quick approximation: ~4 chars per token (faster than encoding)
      const estimatedTokens = JSON.stringify(shortList).length / 4;
      
      if (estimatedTokens > maxTokens) {
        shortList.shift(); // Remove the last added item
        break;
      }
      
      // Keep more exchanges for better story continuity
      if (shortList.length > 16) { // 8 user + 8 assistant messages
        break;
      }
    }
    
    return shortList;
  }

  // Build clean JSON string without escaping for OpenAI (Method 5 - Pure text approach)
  buildCleanGameStateJson(obj) {
    const formatValue = (value) => {
      if (value === null || value === undefined || value === '') return '""';
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // Format nested objects like Exits and Stats using pure string concatenation
        let result = '{\n';
        const keys = Object.keys(value);
        keys.forEach((key, index) => {
          result += `    "${key}": "${value[key]}"`;
          if (index < keys.length - 1) result += ',';
          result += '\n';
        });
        result += '  }';
        return result;
      }
      if (Array.isArray(value)) {
        return '[]';
      }
      return `"${value}"`;
    };
    
    // Build the main JSON object using pure string concatenation
    let result = '{\n';
    const keys = Object.keys(obj);
    keys.forEach((key, index) => {
      result += `  "${key}": ${formatValue(obj[key])}`;
      if (index < keys.length - 1) result += ',';
      result += '\n';
    });
    result += '}';
    return result;
  }

  // Extract JSON from GPT response
  extractJson(jsonString) {
    try {
      // Try to find JSON block - look for balanced braces
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;
      
      for (let i = 0; i < jsonString.length; i++) {
        if (jsonString[i] === '{') {
          if (braceCount === 0) {
            jsonStart = i;
          }
          braceCount++;
        } else if (jsonString[i] === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i;
            break;
          }
        }
      }
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = jsonString.substring(jsonStart, jsonEnd + 1);
        
        // Validate it's proper JSON
        const parsed = JSON.parse(jsonStr);
        return jsonStr;
      }
      
      return null;
    } catch (error) {
      // Fallback to original regex approach
      const regex = /(\{.*\})/ms;
      const matches = jsonString.match(regex);
      if (matches) {
        try {
          JSON.parse(matches[1]);
          return matches[1];
        } catch (parseError) {
          return null;
        }
      }
      return null;
    }
  }

  // Query GPT with retry logic
  async queryGpt(eventList, model = 'gpt-4o', temperature = 0.6, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const requestData = {
          model: model,
          messages: eventList,
          temperature: temperature,
          max_tokens: 1200, // Increased for better storytelling
          stream: false // Keep non-streaming for simplicity, but could enable later
        };
        
        console.log('\n🚀 ================== OPENAI REQUEST ==================');
        console.log(JSON.stringify(requestData, null, 2));
        console.log('🚀 ================== END REQUEST ====================\n');
        
        const response = await this.client.chat.completions.create(requestData);

        console.log('\n📨 ================== OPENAI RESPONSE ==================');
        console.log(JSON.stringify(response, null, 2));
        console.log('📨 ================== END RESPONSE ====================\n');

        return response.choices[0].message;
      } catch (error) {
        
        if (error.status === 500 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          continue;
        }
        
        if (attempt === retries) {
          throw new Error(`Failed after ${retries} attempts: ${error.message}`);
        }
      }
    }
  }

  // Load game instructions from file (with caching)
  async loadInstructions(gameType = 'adventure') {
    try {
      // Check cache first
      if (this.instructionsCache.has(gameType)) {
        return this.instructionsCache.get(gameType);
      }

      const instructionFiles = {
        adventure: 'instructions.txt',
        scifi: 'instructions-scifi.txt',
        mystery: 'instructions-mystery.txt',
        custom: 'instructions-custom.txt',
        clerk: 'instructions-clerk.txt'
      };
      
      const filename = instructionFiles[gameType] || instructionFiles.adventure;
      const instructionsPath = path.join(__dirname, '..', 'instructions', filename);
      
      console.log(`\n📚 =============== LOADING INSTRUCTIONS ===============`);
      console.log(`Game type: ${gameType}`);
      console.log(`Instruction file: ${filename}`);
      console.log(`Full path: ${instructionsPath}`);
      console.log(`📚 =============== END INSTRUCTION LOAD ===============\n`);
      
      const instructions = await fs.readFile(instructionsPath, 'utf-8');
      
      // Cache the instructions
      this.instructionsCache.set(gameType, instructions);
      
      return instructions;
    } catch (error) {
      const fallback = this.getDefaultInstructions();
      this.instructionsCache.set(gameType, fallback);
      return fallback;
    }
  }

  // Default instructions fallback
  getDefaultInstructions() {
    return `You are a game master for a text-based adventure game. 
    Respond with immersive narrative and maintain game state in JSON format.
    Always include game data like location, health, inventory, etc. in your response.`;
  }

  // Map game types to database genre values
  mapGameTypeToGenre(gameType) {
    const genreMap = {
      'adventure': 'fantasy D&D',
      'scifi': 'Science Fiction',
      'mystery': 'Mystery', 
      'custom': 'Custom'
    };
    return genreMap[gameType] || gameType;
  }

  // Clean narrative text to ensure no JSON is displayed to users
  sanitizeNarrativeText(text) {
    if (!text) return text;
    
    // Remove any standalone JSON blocks that might have been missed
    // Look for patterns like { "key": "value" } and remove them
    let cleaned = text.replace(/\s*\{[\s\S]*?\}\s*/g, ' ');
    
    // Remove multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // If the text is mostly JSON or very short after cleaning, provide a fallback
    if (cleaned.length < 10) {
      return 'You continue your adventure...';
    }
    
    return cleaned;
  }




  // Get location data from database
  async getLocationData(locationName, username, genre) {
    try {
      if (!locationName) return null;
      
      console.log(`🗺️ Looking up location: "${locationName}" for ${username} (${genre})`);
      
      const { Location } = require('../models');
      const location = await Location.findOne({
        where: {
          name: locationName,
          player: username,
          genre: genre
        }
      });
      
      if (location) {
        console.log(`✅ Found location data for: ${locationName}`);
        return {
          name: location.name,
          description: location.description,
          exits: JSON.parse(location.exits || '{}')
        };
      } else {
        console.log(`❌ No location data found for: ${locationName}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error looking up location "${locationName}":`, error);
      return null;
    }
  }

  // Special method for custom game after registration - forces custom instructions
  async processCustomGameTurn(user, messages, command) {
    console.log('🎮 Processing custom game turn with forced custom instructions');
    
    // Call the main method but override the instruction selection
    const originalLoadInstructions = this.loadInstructions;
    this.loadInstructions = async (gameType) => {
      console.log('🎮 Forcing custom instructions for registered custom game');
      return originalLoadInstructions.call(this, 'custom');
    };
    
    try {
      const result = await this.processGameTurn(user, messages, command, 'custom');
      return result;
    } finally {
      // Restore the original method
      this.loadInstructions = originalLoadInstructions;
    }
  }

  // Simplified fantasy-only game processing
  async processFantasyGame(user, command, previousGameState = null, questData = null, conversationHistory = []) {
    try {
      console.log('🎮 ===== SIMPLIFIED FANTASY GAME TURN =====');
      console.log(`Player: ${user}`);
      console.log(`Command: ${command}`);
      console.log(`Conversation history length: ${conversationHistory.length}`);
      
      // Load fantasy instructions
      const instructions = await fs.readFile(
        path.join(__dirname, '..', 'instructions', 'instructions.txt'), 
        'utf-8'
      );
      
      // Get the current game state from the database
      const { Convo, Location } = require('../models');
      const lastConvo = await Convo.findOne({
        where: { 
          player: user,
          genre: 'fantasy D&D'
        },
        order: [['id', 'DESC']]
      });
      
      let currentGameState = null;
      if (lastConvo) {
        // Generate conversation summary from recent descriptions for better context memory
        const conversationSummary = this.generateConversationSummary(conversationHistory);
        
        // Build current game state from database
        currentGameState = {
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
          Exits: {},  // Will be populated from location lookup
          Stats: lastConvo.stats ? JSON.parse(lastConvo.stats) : {},
          Inventory: lastConvo.inventory ? JSON.parse(lastConvo.inventory) : [],
          Genre: 'fantasy D&D'
        };
        
        // Look up exit information from location table
        if (currentGameState.Location) {
          console.log(`🗺️ Looking up exits for location: ${currentGameState.Location}`);
          const locationData = await Location.findOne({
            where: {
              name: currentGameState.Location,
              player: user,
              genre: 'fantasy D&D'
            }
          });
          
          if (locationData && locationData.exits) {
            try {
              currentGameState.Exits = JSON.parse(locationData.exits);
              console.log('✅ Found exits:', currentGameState.Exits);
            } catch (error) {
              console.error('❌ Error parsing exits JSON:', error);
              currentGameState.Exits = {};
            }
          } else {
            console.log('⚠️ No exit data found for location');
          }
        }
      } else {
        // No previous conversation - new player needs initial game state for registration
        console.log('🆕 New player detected, creating initial game state for registration');
        currentGameState = {
          Registered: '',
          Name: '',
          Gender: '',
          Class: '',
          Race: '',
          Turn: '1',
          Time: '10:40 AM',
          Day: '1',
          Weather: 'sunny',
          Health: '',
          Gold: '10',
          XP: '0',
          AC: '10',
          Level: '1',
          Description: '',
          Quest: '',
          Location: 'Adventurer\'s Guild',
          Exits: {},
          Stats: {},
          Inventory: ['pocket-lint'],
          Genre: 'fantasy D&D'
        };
      }
      
      // Build system message with current game state appended
      let systemContent = instructions;
      if (currentGameState) {
        systemContent += '\n\nCURRENT GAME STATE:\n' + JSON.stringify(currentGameState, null, 2);
      }
      
      // Add quest data to system context based on type (only current quest, not available quests)
      if (questData) {
        if (questData.type === 'current_quest' && questData.data) {
          systemContent += '\n\nCURRENT QUEST:\n' + JSON.stringify(questData.data, null, 2);
          systemContent += '\n\nNote: The player is actively pursuing this quest. Focus on this quest objective and related gameplay elements.';
          console.log(`🎯 Added current quest to system context: ${questData.data.title}`);
        }
        
        // Add available quests list when player is in specific quest locations
        if (questData.availableQuests && questData.availableQuests.length > 0) {
          systemContent += '\n\nAVAILABLE QUESTS:\n' + questData.availableQuests.map(title => `- ${title}`).join('\n');
          systemContent += '\n\nNote: The player is in a quest location and can see available quests. They can ask about or select any of these quests.';
          console.log(`🎯 Added ${questData.availableQuests.length} available quest titles to system context`);
        }
      }
      
      // Build the request messages
      const messages = [
        {
          role: 'system',
          content: systemContent
        }
      ];
      
      // Add conversation history from previous turns (up to 7 recent turns)
      const recentMessages = conversationHistory.slice(-7); // Get last 7 turns
      console.log(`📜 Adding ${recentMessages.length} conversation history entries`);
      
      for (const msg of recentMessages) {
        // Add user message (player's previous action)
        if (msg.contentUser) {
          messages.push({
            role: 'user',
            content: msg.contentUser
          });
        }
        
        // Add assistant message (game's previous response)
        if (msg.description || msg.action) {
          // Combine the narrative description with any action text
          const responseText = [msg.description, msg.action].filter(Boolean).join('\n\n');
          if (responseText.trim()) {
            messages.push({
              role: 'assistant',
              content: responseText
            });
          }
        }
      }
      
      // Add current user command
      messages.push({
        role: 'user',
        content: command
      });
      
      console.log('🚀 Sending request to OpenAI...');
      console.log('📋 FULL OPENAI REQUEST:');
      console.log('='.repeat(80));
      const fullRequest = {
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      };
      console.log(JSON.stringify(fullRequest, null, 2));
      console.log('='.repeat(80));
      
      // Send to OpenAI
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      });
      
      const aiResponse = response.choices[0].message.content;
      console.log('📨 Received response from OpenAI');
      console.log('Response length:', aiResponse.length);
      console.log('🤖 FULL AI RESPONSE:');
      console.log('='.repeat(80));
      console.log(aiResponse);
      console.log('='.repeat(80));
      
      let gameState = null;
      let narrative = '';
      
      // Try to parse the entire response as JSON first
      try {
        gameState = JSON.parse(aiResponse.trim());
        console.log('✅ Successfully parsed entire response as JSON');
        
        // Use the Description field as the narrative for the player
        narrative = gameState.Description || 'You continue your adventure...';
        console.log('📖 Using Description field as narrative');
        
      } catch (error) {
        console.log('⚠️ Response is not pure JSON, trying to extract JSON from text...');
        
        // Fallback to old method: extract JSON from mixed text response
        const gameStateJson = this.extractJson(aiResponse);
        
        if (gameStateJson) {
          try {
            gameState = JSON.parse(gameStateJson);
            console.log('✅ Successfully parsed extracted game state JSON');
            
            // Remove JSON from narrative response and use remaining text
            narrative = aiResponse.replace(gameStateJson, '').trim();
            
          } catch (parseError) {
            console.error('❌ Failed to parse extracted game state JSON:', parseError);
            narrative = aiResponse.trim();
          }
        } else {
          console.log('⚠️ No JSON found in response');
          narrative = aiResponse.trim();
        }
      }
      
      return {
        narrative: narrative,
        gameState: gameState,
        rawResponse: aiResponse
      };
      
    } catch (error) {
      console.error('❌ Error in processFantasyGame:', error);
      throw error;
    }
  }

  // Simplified sci-fi game processing
  async processScifiGame(user, command, previousGameState = null, questData = null, conversationHistory = []) {
    try {
      console.log('🚀 ===== SIMPLIFIED SCI-FI GAME TURN =====');
      console.log(`Player: ${user}`);
      console.log(`Command: ${command}`);
      console.log(`Conversation history length: ${conversationHistory.length}`);
      
      // Load sci-fi instructions
      const instructions = await fs.readFile(
        path.join(__dirname, '..', 'instructions', 'instructions-scifi.txt'), 
        'utf-8'
      );
      
      // Get the current game state from the database
      const { Convo, Location } = require('../models');
      const lastConvo = await Convo.findOne({
        where: { 
          player: user,
          genre: 'Science Fiction'
        },
        order: [['id', 'DESC']]
      });
      
      let currentGameState = null;
      if (lastConvo) {
        // Generate conversation summary from recent descriptions for better context memory
        const conversationSummary = this.generateConversationSummary(conversationHistory);
        
        // Build current game state from database
        currentGameState = {
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
          Exits: {},  // Will be populated from location lookup
          Stats: lastConvo.stats ? JSON.parse(lastConvo.stats) : {},
          Inventory: lastConvo.inventory ? JSON.parse(lastConvo.inventory) : [],
          Genre: 'Science Fiction'
        };
        
        // Look up exit information from location table
        if (currentGameState.Location) {
          console.log(`🗺️ Looking up exits for location: ${currentGameState.Location}`);
          const locationData = await Location.findOne({
            where: {
              name: currentGameState.Location,
              player: user,
              genre: 'Science Fiction'
            }
          });
          
          if (locationData && locationData.exits) {
            try {
              currentGameState.Exits = JSON.parse(locationData.exits);
              console.log('✅ Found exits:', currentGameState.Exits);
            } catch (error) {
              console.error('❌ Error parsing exits JSON:', error);
              currentGameState.Exits = {};
            }
          } else {
            console.log('⚠️ No exit data found for location');
          }
        }
      } else {
        // No previous conversation - new player needs initial game state for registration
        console.log('🆕 New player detected, creating initial game state for registration');
        currentGameState = {
          Registered: '',
          Name: '',
          Gender: '',
          Class: '',
          Race: '',
          Turn: '1',
          Time: '10:40 AM',
          Day: '1',
          Weather: 'sunny',
          Health: '',
          Gold: '10',
          XP: '0',
          AC: '10',
          Level: '1',
          Description: '',
          Quest: '',
          Location: 'Adventurer\'s Guild',
          Exits: {},
          Stats: {},
          Inventory: ['pocket-lint'],
          Genre: 'fantasy D&D'
        };
      }
      
      // Build system message with current game state appended
      let systemContent = instructions;
      if (currentGameState) {
        systemContent += '\n\nCURRENT GAME STATE:\n' + JSON.stringify(currentGameState, null, 2);
      }
      
      // Add quest data to system context based on type (only current quest, not available quests)
      if (questData) {
        if (questData.type === 'current_quest' && questData.data) {
          systemContent += '\n\nCURRENT QUEST:\n' + JSON.stringify(questData.data, null, 2);
          systemContent += '\n\nNote: The player is actively pursuing this quest. Focus on this quest objective and related gameplay elements.';
          console.log(`🎯 Added current quest to system context: ${questData.data.title}`);
        }
        
        // Add available quests list when player is in specific quest locations
        if (questData.availableQuests && questData.availableQuests.length > 0) {
          systemContent += '\n\nAVAILABLE QUESTS:\n' + questData.availableQuests.map(title => `- ${title}`).join('\n');
          systemContent += '\n\nNote: The player is in a quest location and can see available quests. They can ask about or select any of these quests.';
          console.log(`🎯 Added ${questData.availableQuests.length} available quest titles to system context`);
        }
      }
      
      // Build the request messages
      const messages = [
        {
          role: 'system',
          content: systemContent
        }
      ];
      
      // Add conversation history from previous turns (up to 7 recent turns)
      const recentMessages = conversationHistory.slice(-7); // Get last 7 turns
      console.log(`📜 Adding ${recentMessages.length} conversation history entries`);
      
      for (const msg of recentMessages) {
        // Add user message (player's previous action)
        if (msg.contentUser) {
          messages.push({
            role: 'user',
            content: msg.contentUser
          });
        }
        
        // Add assistant message (game's previous response)
        if (msg.description || msg.action) {
          // Combine the narrative description with any action text
          const responseText = [msg.description, msg.action].filter(Boolean).join('\n\n');
          if (responseText.trim()) {
            messages.push({
              role: 'assistant',
              content: responseText
            });
          }
        }
      }
      
      // Add current user command
      messages.push({
        role: 'user',
        content: command
      });
      
      console.log('🚀 Sending request to OpenAI...');
      console.log('📋 FULL OPENAI REQUEST:');
      console.log('='.repeat(80));
      const fullRequest = {
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      };
      console.log(JSON.stringify(fullRequest, null, 2));
      console.log('='.repeat(80));
      
      // Send to OpenAI
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      });
      
      const aiResponse = response.choices[0].message.content;
      console.log('📨 Received response from OpenAI');
      console.log('Response length:', aiResponse.length);
      console.log('🤖 FULL AI RESPONSE:');
      console.log('='.repeat(80));
      console.log(aiResponse);
      console.log('='.repeat(80));
      
      let gameState = null;
      let narrative = '';
      
      // Try to parse the entire response as JSON first
      try {
        gameState = JSON.parse(aiResponse.trim());
        console.log('✅ Successfully parsed entire response as JSON');
        
        // Use the Description field as the narrative for the player
        narrative = gameState.Description || 'You continue your sci-fi adventure...';
        console.log('📖 Using Description field as narrative');
        
      } catch (error) {
        console.log('⚠️ Response is not pure JSON, trying to extract JSON from text...');
        
        // Fallback to old method: extract JSON from mixed text response
        const gameStateJson = this.extractJson(aiResponse);
        
        if (gameStateJson) {
          try {
            gameState = JSON.parse(gameStateJson);
            console.log('✅ Successfully parsed extracted game state JSON');
            
            // Remove JSON from narrative response and use remaining text
            narrative = aiResponse.replace(gameStateJson, '').trim();
            
          } catch (parseError) {
            console.error('❌ Failed to parse extracted game state JSON:', parseError);
            narrative = aiResponse.trim();
          }
        } else {
          console.log('⚠️ No JSON found in response');
          narrative = aiResponse.trim();
        }
      }
      
      return {
        narrative: narrative,
        gameState: gameState,
        rawResponse: aiResponse
      };
      
    } catch (error) {
      console.error('❌ Error in processScifiGame:', error);
      throw error;
    }
  }

  // Simplified mystery game processing
  async processMysteryGame(user, command, previousGameState = null, questData = null, conversationHistory = []) {
    try {
      console.log('🔍 ===== SIMPLIFIED MYSTERY GAME TURN =====');
      console.log(`Player: ${user}`);
      console.log(`Command: ${command}`);
      console.log(`Conversation history length: ${conversationHistory.length}`);
      
      // Load mystery instructions
      const instructions = await fs.readFile(
        path.join(__dirname, '..', 'instructions', 'instructions-mystery.txt'), 
        'utf-8'
      );
      
      // Get the current game state from the database
      const { Convo, Location } = require('../models');
      const lastConvo = await Convo.findOne({
        where: { 
          player: user,
          genre: 'Mystery'
        },
        order: [['id', 'DESC']]
      });
      
      let currentGameState = null;
      if (lastConvo) {
        // Generate conversation summary from recent descriptions for better context memory
        const conversationSummary = this.generateConversationSummary(conversationHistory);
        
        // Build current game state from database
        currentGameState = {
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
          Exits: {},  // Will be populated from location lookup
          Stats: lastConvo.stats ? JSON.parse(lastConvo.stats) : {},
          Inventory: lastConvo.inventory ? JSON.parse(lastConvo.inventory) : [],
          Genre: 'Mystery'
        };
        
        // Look up exit information from location table
        if (currentGameState.Location) {
          console.log(`🗺️ Looking up exits for location: ${currentGameState.Location}`);
          const locationData = await Location.findOne({
            where: {
              name: currentGameState.Location,
              player: user,
              genre: 'Mystery'
            }
          });
          
          if (locationData && locationData.exits) {
            try {
              currentGameState.Exits = JSON.parse(locationData.exits);
              console.log('✅ Found exits:', currentGameState.Exits);
            } catch (error) {
              console.error('❌ Error parsing exits JSON:', error);
              currentGameState.Exits = {};
            }
          } else {
            console.log('⚠️ No exit data found for location');
          }
        }
      } else {
        // No previous conversation - new player needs initial game state for registration
        console.log('🆕 New player detected, creating initial game state for registration');
        currentGameState = {
          Registered: '',
          Name: '',
          Gender: '',
          Class: '',
          Race: '',
          Turn: '1',
          Time: '10:40 AM',
          Day: '1',
          Weather: 'sunny',
          Health: '',
          Gold: '10',
          XP: '0',
          AC: '10',
          Level: '1',
          Description: '',
          Quest: '',
          Location: 'Adventurer\'s Guild',
          Exits: {},
          Stats: {},
          Inventory: ['pocket-lint'],
          Genre: 'fantasy D&D'
        };
      }
      
      // Build system message with current game state appended
      let systemContent = instructions;
      if (currentGameState) {
        systemContent += '\n\nCURRENT GAME STATE:\n' + JSON.stringify(currentGameState, null, 2);
      }
      
      // Add quest data to system context based on type (only current quest, not available quests)
      if (questData) {
        if (questData.type === 'current_quest' && questData.data) {
          systemContent += '\n\nCURRENT QUEST:\n' + JSON.stringify(questData.data, null, 2);
          systemContent += '\n\nNote: The player is actively pursuing this quest. Focus on this quest objective and related gameplay elements.';
          console.log(`🎯 Added current quest to system context: ${questData.data.title}`);
        }
        
        // Add available quests list when player is in specific quest locations
        if (questData.availableQuests && questData.availableQuests.length > 0) {
          systemContent += '\n\nAVAILABLE QUESTS:\n' + questData.availableQuests.map(title => `- ${title}`).join('\n');
          systemContent += '\n\nNote: The player is in a quest location and can see available quests. They can ask about or select any of these quests.';
          console.log(`🎯 Added ${questData.availableQuests.length} available quest titles to system context`);
        }
      }
      
      // Build the request messages
      const messages = [
        {
          role: 'system',
          content: systemContent
        }
      ];
      
      // Add conversation history from previous turns (up to 7 recent turns)
      const recentMessages = conversationHistory.slice(-7); // Get last 7 turns
      console.log(`📜 Adding ${recentMessages.length} conversation history entries`);
      
      for (const msg of recentMessages) {
        // Add user message (player's previous action)
        if (msg.contentUser) {
          messages.push({
            role: 'user',
            content: msg.contentUser
          });
        }
        
        // Add assistant message (game's previous response)
        if (msg.description || msg.action) {
          // Combine the narrative description with any action text
          const responseText = [msg.description, msg.action].filter(Boolean).join('\n\n');
          if (responseText.trim()) {
            messages.push({
              role: 'assistant',
              content: responseText
            });
          }
        }
      }
      
      // Add current user command
      messages.push({
        role: 'user',
        content: command
      });
      
      console.log('🚀 Sending request to OpenAI...');
      console.log('📋 FULL OPENAI REQUEST:');
      console.log('='.repeat(80));
      const fullRequest = {
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      };
      console.log(JSON.stringify(fullRequest, null, 2));
      console.log('='.repeat(80));
      
      // Send to OpenAI
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      });
      
      const aiResponse = response.choices[0].message.content;
      console.log('📨 Received response from OpenAI');
      console.log('Response length:', aiResponse.length);
      console.log('🤖 FULL AI RESPONSE:');
      console.log('='.repeat(80));
      console.log(aiResponse);
      console.log('='.repeat(80));
      
      let gameState = null;
      let narrative = '';
      
      // Try to parse the entire response as JSON first
      try {
        gameState = JSON.parse(aiResponse.trim());
        console.log('✅ Successfully parsed entire response as JSON');
        
        // Use the Description field as the narrative for the player
        narrative = gameState.Description || 'You continue your mystery investigation...';
        console.log('📖 Using Description field as narrative');
        
      } catch (error) {
        console.log('⚠️ Response is not pure JSON, trying to extract JSON from text...');
        
        // Fallback to old method: extract JSON from mixed text response
        const gameStateJson = this.extractJson(aiResponse);
        
        if (gameStateJson) {
          try {
            gameState = JSON.parse(gameStateJson);
            console.log('✅ Successfully parsed extracted game state JSON');
            
            // Remove JSON from narrative response and use remaining text
            narrative = aiResponse.replace(gameStateJson, '').trim();
            
          } catch (parseError) {
            console.error('❌ Failed to parse extracted game state JSON:', parseError);
            narrative = aiResponse.trim();
          }
        } else {
          console.log('⚠️ No JSON found in response');
          narrative = aiResponse.trim();
        }
      }
      
      return {
        narrative: narrative,
        gameState: gameState,
        rawResponse: aiResponse
      };
      
    } catch (error) {
      console.error('❌ Error in processMysteryGame:', error);
      throw error;
    }
  }

  // Main game processing function
  async processGameTurn(user, messages, command, gameType = 'adventure') {
    try {
      const gameElements = [
        'Genre', 'Name', 'Class', 'Race', 'Turn', 'Time', 
        'Day', 'Weather', 'Health', 'XP', 'AC', 'Level', 'Location', 'Exits', 
        'Quest', 'Inventory', 'Gender', 'Registered', 'Stats', 'Gold'
      ];

      let temperature = 0.6;
      let lastGameState = {};
      const eventList = [];

      // Load game instructions with explicit length restriction  
      // For custom games, determine if we need clerk instructions (new game) or regular custom instructions
      let actualGameType = gameType;
      if (gameType.toLowerCase() === 'custom') {
        // Check if player is already registered by multiple methods:
        // 1. Check previous messages for registration status
        const isRegisteredInMessages = messages.length > 0 && messages.some(msg => 
          msg.registered === 'true' || (typeof msg.registered === 'string' && msg.registered.toLowerCase() === 'true')
        );
        
        // 2. Check if custom world locations exist in database (indicates completed registration)
        let hasCustomWorld = false;
        try {
          const { Location } = require('../models');
          const locationCount = await Location.count({
            where: { player: user, genre: 'Custom' }
          });
          hasCustomWorld = locationCount > 0;
          console.log(`🗺️ Custom world check: ${locationCount} locations found`);
        } catch (error) {
          console.log('⚠️ Could not check for existing custom world:', error.message);
        }
        
        const isAlreadyRegistered = isRegisteredInMessages || hasCustomWorld;
        
        if (!isAlreadyRegistered) {
          // New custom game - use clerk instructions
          actualGameType = 'clerk';
          console.log('🎭 Using clerk instructions for new custom game registration');
        } else {
          console.log('🎮 Using regular custom instructions for registered player');
        }
      }
      
      const instructions = await this.loadInstructions(actualGameType);
      const lengthEnforcement = `

Keep your narrative response concise and engaging.`;
      
      const instruction = { role: 'system', content: instructions + lengthEnforcement };

      // Extract game state from most recent message only (no conversation history)
      if (messages.length > 0) {
        const lastEvent = messages[messages.length - 1];
        
        // Parse stored JSON fields back to objects if needed
        let parsedStats = lastEvent.stats || '';
        let parsedInventory = lastEvent.inventory || '';
        
        try {
          if (lastEvent.stats && lastEvent.stats.startsWith('{')) {
            parsedStats = JSON.parse(lastEvent.stats);
          }
        } catch (e) { /* ignore */ }
        
        try {
          if (lastEvent.inventory && lastEvent.inventory.startsWith('[')) {
            parsedInventory = JSON.parse(lastEvent.inventory);
          }
        } catch (e) { /* ignore */ }

        lastGameState = {
          Genre: lastEvent.genre || '',
          Name: lastEvent.name || '',
          Class: lastEvent.playerClass || '',
          Race: lastEvent.race || '',
          Turn: lastEvent.turn || '',
          Time: lastEvent.timePeriod || '',
          Day: lastEvent.dayNumber || '',
          Weather: lastEvent.weather || '',
          Health: lastEvent.health || '',
          XP: lastEvent.xp || '',
          AC: lastEvent.ac || '',
          Level: lastEvent.level || '',
          Description: lastEvent.description || '',
          Action: lastEvent.action || '',
          Quest: lastEvent.quest || '',
          Inventory: parsedInventory,
          Location: lastEvent.location || '',
          Gender: lastEvent.gender || '',
          Registered: lastEvent.registered || '',
          Stats: parsedStats,
          Gold: lastEvent.gold || ''
        };
        
        temperature = 0.6; // Fixed temperature since Temp field removed
      }

      // Validate temperature
      if (temperature < 0 || temperature > 1) {
        temperature = 0.6;
      }

      // Initialize empty state if no messages processed
      if (messages.length === 0) {
        gameElements.forEach(element => {
          lastGameState[element] = '';
        });
      }

      // No conversation history - just system message and current command
      
      // Look up current location data from world database
      // Get genre-appropriate default starting location
      const getDefaultStartLocation = (gameType) => {
        const defaultLocations = {
          'adventure': 'Adventurer\'s Guild',
          'scifi': 'Unemployment Center',
          'mystery': 'Newspaper Office',
          'custom': 'Starting Location' // This will be customized per game
        };
        return defaultLocations[gameType] || 'Adventurer\'s Guild';
      };
      
      const defaultStartLocation = getDefaultStartLocation(gameType);
      let currentLocation = lastGameState.Location || defaultStartLocation;
      const currentGenre = lastGameState.Genre || this.mapGameTypeToGenre(gameType);
      
      // IMPORTANT: Check if the player is trying to move to a new location
      // If so, update the current location BEFORE building context
      const directionPattern = /^(go|move|walk|travel|head)\s+(north|south|east|west|up|down|n|s|e|w)$/i;
      const simpleDirectionPattern = /^(north|south|east|west|up|down|n|s|e|w)$/i;
      const directionMatch = command.match(directionPattern) || command.match(simpleDirectionPattern);
      
      if (directionMatch) {
        // Player is trying to move - get current location data first
        let currentLocationData = await this.getLocationData(currentLocation, user, currentGenre);
        
        if (currentLocationData && currentLocationData.exits) {
          const direction = (directionMatch[2] || directionMatch[1]).toLowerCase();
          const directionMap = { 'n': 'north', 's': 'south', 'e': 'east', 'w': 'west' };
          const normalizedDirection = directionMap[direction] || direction;
          const destinationName = currentLocationData.exits[normalizedDirection];
          
          if (destinationName) {
            console.log(`🗺️ Player moving ${normalizedDirection} from "${currentLocation}" to "${destinationName}"`);
            // Update current location to the destination for context
            currentLocation = destinationName;
            console.log(`🗺️ Updated context location to: "${currentLocation}"`);
          }
        }
      }
      
      let locationData = await this.getLocationData(currentLocation, user, currentGenre);
      
      // If the expected starting location doesn't exist, find the first available location for this player/genre
      if (!locationData && !lastGameState.Location) {
        console.log(`🗺️ Expected starting location "${currentLocation}" not found, looking for first available location...`);
        const { Location } = require('../models');
        const firstLocation = await Location.findOne({
          where: { player: user, genre: currentGenre },
          order: [['id', 'ASC']]
        });
        
        if (firstLocation) {
          currentLocation = firstLocation.name;
          locationData = {
            name: firstLocation.name,
            description: firstLocation.description,
            exits: JSON.parse(firstLocation.exits || '{}')
          };
          console.log(`🗺️ Using first available location: "${currentLocation}"`);
        }
      }
      
      console.log(`🗺️ Location lookup result:`, locationData ? `Found ${locationData.name}` : 'Not found');
      
      // Include location data in context if available
      let locationContext = '';
      if (locationData) {
        locationContext = `\n\nCURRENT LOCATION DETAILS:
Name: ${locationData.name}
Description: ${locationData.description}`;
      }
      
      // Build current game state JSON string - fix field name mapping
      const currentGameState = {
        Registered: lastGameState.Registered || '',
        Name: lastGameState.Name || '',
        Gender: lastGameState.Gender || '',
        Class: lastGameState.Class || '',
        Race: lastGameState.Race || '',
        Turn: lastGameState.Turn || '1',
        Time: lastGameState.Time || '',
        Day: lastGameState.Day || '',
        Weather: lastGameState.Weather || '',
        Health: lastGameState.Health || '',
        Gold: lastGameState.Gold || '',
        XP: lastGameState.XP || '',
        AC: lastGameState.AC || '',
        Level: lastGameState.Level || '',
        Description: lastGameState.Description || '',
        Quest: lastGameState.Quest || '',
        Location: currentLocation,
        Exits: locationData ? locationData.exits : {},
        Stats: lastGameState.Stats || '',
        Inventory: lastGameState.Inventory || '',
        Genre: currentGenre
      };
      
      // Build context content with unescaped JSON
      let contextContent = 'CURRENT GAME STATE (maintain consistency):\n';
      contextContent += this.buildCleanGameStateJson(currentGameState);
      
      
      // For movement commands, add context about the move from previous location
      let userContent = command;
      if (directionMatch) {
        const previousLocation = lastGameState.Location || defaultStartLocation;
        if (previousLocation !== currentLocation) {
          console.log(`📍 Movement context: ${previousLocation} -> ${currentLocation}`);
          userContent = `${command}\n\nMOVEMENT CONTEXT:\nMoving from: ${previousLocation}\nDestination: ${currentLocation}`;
        }
      }

      // Create request with system message, conversation history, and current command
      const combinedSystemContent = instructions + lengthEnforcement + '\n\n' + contextContent;
      const requestMessages = [
        {
          role: 'system',
          content: combinedSystemContent
        }
      ];

      // Add conversation history from previous turns (up to 5 recent turns)
      const recentMessages = messages.slice(-5); // Get last 5 turns
      
      for (const msg of recentMessages) {
        // Add user message (player's previous action)
        if (msg.contentUser) {
          requestMessages.push({
            role: 'user',
            content: msg.contentUser
          });
        }
        
        // Add assistant message (game's previous response)
        if (msg.description || msg.action) {
          // Combine the narrative description with any action text
          const responseText = [msg.description, msg.action].filter(Boolean).join('\n\n');
          if (responseText.trim()) {
            requestMessages.push({
              role: 'assistant',
              content: responseText
            });
          }
        }
      }

      // Add the current user command
      requestMessages.push({
        role: 'user', 
        content: userContent
      });

      // Query GPT (using gpt-4o-mini for faster responses)
      const message = await this.queryGpt(requestMessages, 'gpt-4o-mini', temperature);
      const messageContent = message.content.strip ? message.content.strip() : message.content.trim();

      // Extract JSON from response
      const messageData = this.extractJson(messageContent);
      
      if (messageData) {
        const messageText = messageContent.replace(messageData, '').trim();
        const jsonData = JSON.parse(messageData);

        // Check for custom game registration completion
        if (gameType.toLowerCase() === 'custom' && jsonData.Registered === true) {
          console.log('🎭 Custom registration completed! Triggering world generation...');
          
          // Extract custom world data from the registration JSON
          const customWorldData = {
            worldDescription: jsonData.Setting || 'fantasy world',
            locationExamples: 'various locations appropriate for this setting',
            startLocation: jsonData.StartLocation || 'Starting Location',
            startLocationDescription: `You find yourself at the ${jsonData.StartLocation || 'Starting Location'}. This is where your adventure begins in ${jsonData.Setting || 'this world'}.`,
            playerName: jsonData.Name || '',
            playerClass: jsonData.Class || '',
            playerRace: jsonData.Race || '',
            tone: jsonData.Tone || '',
            currency: jsonData.Currency || 'gold coins',
            notes: jsonData.OtherNotes || ''
          };
          
          // Trigger world generation asynchronously (don't block the response)
          setTimeout(async () => {
            try {
              console.log('🌍 Generating custom world with registration data...');
              
              // Import the generateWorldLocations function from routes/api.js
              // We need to replicate the logic here to save to database
              const { Location } = require('../models');
              const genre = 'Custom';
              
              // Generate world using OpenAI with custom data
              const worldData = await this.generateWorld(user, 'custom', customWorldData);
              
              // Parse JSON response and save to database
              console.log('🔧 Parsing and saving world JSON data...');
              let locations;
              try {
                // Clean up the response - remove any markdown formatting
                let cleanedData = worldData;
                
                if (cleanedData.includes('```json')) {
                  cleanedData = cleanedData.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                }
                if (cleanedData.includes('json\n')) {
                  cleanedData = cleanedData.replace(/json\n/g, '');
                }
                
                cleanedData = cleanedData.trim();
                if (!cleanedData.startsWith('[')) {
                  const jsonStart = cleanedData.indexOf('[');
                  if (jsonStart !== -1) {
                    cleanedData = cleanedData.substring(jsonStart);
                  }
                }
                
                locations = JSON.parse(cleanedData);
                console.log(`🔧 Parsed ${locations.length} locations`);
              } catch (parseError) {
                console.error('❌ JSON parsing failed:', parseError);
                throw parseError;
              }
              
              // Save locations to database
              for (const location of locations) {
                try {
                  await Location.create({
                    player: user,
                    name: location.name,
                    description: location.description,
                    exits: JSON.stringify(location.exits || {}),
                    genre: genre,
                    datetime: new Date()
                  });
                } catch (locationError) {
                  console.error(`❌ Failed to save location "${location.name}":`, locationError);
                }
              }
              
              console.log(`✅ Custom world generation completed - saved ${locations.length} locations`);
              
              // After world generation, trigger an automatic "look around" with custom instructions
              console.log('🎮 Switching to custom game instructions and initializing world...');
              
              // Get the updated messages (including the current registration response)
              const { Convo } = require('../models');
              const updatedMessages = await Convo.findAll({
                where: { 
                  player: user,
                  genre: 'Custom'
                },
                order: [['id', 'DESC']],
                limit: 7,
                raw: true
              });
              
              // Process "look around" command with custom instructions
              // Force custom instructions by calling processGameTurn with a flag indicating registration is complete
              const initResponse = await this.processCustomGameTurn(user, updatedMessages.reverse(), 'look around');
              
              // Save the initialization response to database 
              await Convo.create({
                player: user,
                datetime: new Date(),
                ...initResponse.data,
                conversation: JSON.stringify(initResponse)
              });
              
              console.log('✅ Custom world initialized successfully');
            } catch (error) {
              console.error('❌ Custom world generation/initialization failed:', error);
            }
          }, 2000); // Slightly longer delay to ensure registration is saved first
        }

        // Use Description as narrative if message text is empty
        let narrativeText = messageText;
        if (!narrativeText) {
          narrativeText = jsonData.Description || '';
          jsonData.Description = '';
        }
        
        // Extra safety: Remove any remaining JSON-like patterns from narrative
        narrativeText = this.sanitizeNarrativeText(narrativeText);

        // Fill in missing game elements from last state
        if (lastGameState) {
          gameElements.forEach(element => {
            if (!jsonData[element]) {
              jsonData[element] = lastGameState[element] || '';
            }
          });
        }


        
        // Enforce permanent registration: once registered, always registered
        let finalRegistered = jsonData.Registered || '';
        let finalName = jsonData.Name || '';
        let finalPlayerClass = jsonData.Class || '';
        let finalRace = jsonData.Race || '';
        let finalStats = typeof jsonData.Stats === 'object' ? JSON.stringify(jsonData.Stats) : (jsonData.Stats || '');
        
        // If we have previous game state and it was registered, keep it registered
        if (lastGameState && lastGameState.Registered === 'true') {
          finalRegistered = 'true';
          
          // Preserve previous registration data if new response doesn't have it
          if (!finalName && lastGameState.Name) {
            finalName = lastGameState.Name;
          }
          if (!finalPlayerClass && lastGameState.Class) {
            finalPlayerClass = lastGameState.Class;
          }
          if (!finalRace && lastGameState.Race) {
            finalRace = lastGameState.Race;
          }
          if (!finalStats || finalStats === '""' || finalStats === '{}') {
            if (typeof lastGameState.Stats === 'object') {
              finalStats = JSON.stringify(lastGameState.Stats);
            } else if (lastGameState.Stats) {
              finalStats = lastGameState.Stats;
            }
          }
        }
        
        // Return deconstructed data for storing in individual database fields
        const mappedData = {
          registered: finalRegistered,
          name: finalName,
          gender: jsonData.Gender || '',
          playerClass: finalPlayerClass,
          race: finalRace,
          turn: jsonData.Turn || '1',
          timePeriod: jsonData.Time || '',
          dayNumber: jsonData.Day || '',
          weather: jsonData.Weather || '',
          health: jsonData.Health || '',
          gold: jsonData.Gold || '',
          xp: jsonData.XP || '',
          ac: jsonData.AC || '',
          level: jsonData.Level || '',
          description: jsonData.Description || '',
          quest: jsonData.Quest || '',
          location: jsonData.Location || '',
          stats: finalStats,
          inventory: Array.isArray(jsonData.Inventory) ? JSON.stringify(jsonData.Inventory) : (jsonData.Inventory || ''),
          genre: jsonData.Genre || this.mapGameTypeToGenre(gameType),
          action: narrativeText
        };
        
        
        return {
          content: narrativeText,
          data: mappedData,
          rawResponse: messageContent // Include raw OpenAI response
        };
      } else {
        // Fallback if no JSON found - create game state from narrative and previous state
        
        // Initialize default values for new game
        const currentTurn = lastGameState.Turn ? parseInt(lastGameState.Turn) + 1 : 1;
        const currentTime = lastGameState.Time || '10:00 AM';
        const currentDay = lastGameState.Day || '1';
        const currentWeather = lastGameState.Weather || 'sunny';
        const currentLocation = lastGameState.Location || '';
        // Exits will be loaded from locations DB, not stored in fallback
        
        // Enforce permanent registration in fallback too
        let fallbackRegistered = lastGameState.Registered || '';
        if (lastGameState && lastGameState.Registered === 'true') {
          fallbackRegistered = 'true';
        }
        
        const fallbackResponse = {
          content: this.sanitizeNarrativeText(messageContent),
          data: {
            registered: fallbackRegistered,
            name: lastGameState.Name || '',
            gender: lastGameState.Gender || '',
            playerClass: lastGameState.Class || '',
            race: lastGameState.Race || '',
            turn: currentTurn.toString(),
            timePeriod: currentTime,
            dayNumber: currentDay,
            weather: currentWeather,
            health: lastGameState.Health || '',
            gold: lastGameState.Gold || '10',
            xp: lastGameState.XP || '0',
            ac: lastGameState.AC || '10',
            level: lastGameState.Level || '1',
            description: messageContent,
            quest: lastGameState.Quest || '',
            location: currentLocation,
            stats: typeof lastGameState.Stats === 'object' ? JSON.stringify(lastGameState.Stats) : (lastGameState.Stats || ''),
            inventory: Array.isArray(lastGameState.Inventory) ? JSON.stringify(lastGameState.Inventory) : (lastGameState.Inventory || '["pocket lint"]'),
            genre: lastGameState.Genre || this.mapGameTypeToGenre(gameType),
            action: messageContent
          },
          rawResponse: messageContent // Include raw OpenAI response for fallback too
        };
        
        return fallbackResponse;
      }
    } catch (error) {
      throw error;
    }
  }

  // Generate image for game scene with genre context
  async generateImage(description, player, location, genre = 'adventure') {
    try {
      // Add genre-specific styling to the prompt
      const genreStyles = {
        'adventure': 'fantasy medieval style, dungeons and dragons, ancient mystical caves, stone architecture, torchlight, no modern elements whatsoever',
        'scifi': 'science fiction, futuristic technology, spaceship interiors, alien environments, high-tech corridors, cyberpunk aesthetic',
        'mystery': 'noir detective style, 1940s-1950s atmosphere, dark moody lighting, vintage detective setting, film noir',
        'custom': 'cinematic dramatic lighting, detailed artwork, immersive fantasy or sci-fi environment'
      };
      
      const stylePrompt = genreStyles[genre] || genreStyles['adventure'];
      
      // Enhance the description with genre-appropriate styling and explicit modern exclusions
      let enhancedPrompt = `${description}, ${stylePrompt}, detailed digital art, atmospheric lighting, immersive game environment`;
      
      // Add specific exclusions for fantasy/adventure to avoid modern elements
      if (genre === 'adventure') {
        enhancedPrompt += ', absolutely no modern swimming pools, no concrete, no modern architecture, medieval fantasy only';
      }
      
      const imageRequestData = {
        prompt: enhancedPrompt,
        n: 1,
        size: '256x256'
      };
      
      console.log('=== OPENAI IMAGE REQUEST ===');
      console.log(JSON.stringify(imageRequestData, null, 2));
      console.log('=== END IMAGE REQUEST ===');
      
      const response = await this.client.images.generate(imageRequestData);

      console.log('=== OPENAI IMAGE RESPONSE ===');
      console.log(JSON.stringify(response, null, 2));
      console.log('=== END IMAGE RESPONSE ===');

      return response.data[0].url;
    } catch (error) {
      throw error;
    }
  }

  // Generate world locations based on game genre
  async generateWorld(username, gameType = 'adventure', customWorldData = null) {
    try {
      console.log('\n🌍 =============== GENERATING WORLD ===============');
      console.log(`Generating world for player: ${username}`);
      console.log(`Game type: ${gameType}`);

      // Safety check: Prevent regenerating existing worlds
      const { Location } = require('../models');
      const genre = this.mapGameTypeToGenre(gameType);
      const existingCount = await Location.count({
        where: { player: username, genre: genre }
      });
      
      if (existingCount > 0) {
        console.log(`🌍 Safety check: World already exists (${existingCount} locations), skipping generation`);
        return '[]'; // Return empty world data since locations already exist
      }

      // Handle custom game world generation
      if (gameType.toLowerCase() === 'custom' && customWorldData) {
        console.log('🎨 Generating custom world with user specifications');
        
        // Load custom world template
        let worldInstructions = await fs.readFile(
          path.join(__dirname, '..', 'instructions', 'world_custom.txt'), 
          'utf-8'
        );

        // Replace placeholders with custom data from registration
        worldInstructions = worldInstructions.replace('{world_description}', customWorldData.worldDescription || 'fantasy world');
        worldInstructions = worldInstructions.replace('{location_examples}', customWorldData.locationExamples || 'various locations');
        worldInstructions = worldInstructions.replace('{start_location}', customWorldData.startLocation || 'Starting Location');
        worldInstructions = worldInstructions.replace('start_location_description', customWorldData.startLocationDescription || 'This is where your adventure begins.');
        
        console.log(`🎭 Replaced placeholders: Setting="${customWorldData.worldDescription}", StartLocation="${customWorldData.startLocation}"`);

        const worldRequest = {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: worldInstructions
            },
            {
              role: 'user',
              content: `Generate 40 to 60 world locations for this custom world: "${customWorldData.worldDescription}". Make sure the response is complete and valid JSON format with proper closing bracket.`
            }
          ],
          temperature: 0.7,
          max_tokens: 8000
        };

        console.log('🚀 Sending custom world generation request to OpenAI...');
        const response = await this.client.chat.completions.create(worldRequest);
        const worldData = response.choices[0].message.content.trim();

        console.log('📨 Received custom world data from OpenAI');
        console.log('Response length:', worldData.length);
        console.log('🌍 =============== END CUSTOM WORLD GENERATION ===============\n');

        return worldData;
      }

      // Map game types to world instruction files
      const worldInstructionFiles = {
        adventure: 'world_adv.txt',
        scifi: 'world_sci.txt', 
        mystery: 'world_mys.txt',
        custom: 'world_custom.txt'
      };

      const filename = worldInstructionFiles[gameType.toLowerCase()] || worldInstructionFiles.adventure;
      
      // Load world generation instructions from file
      let worldInstructions = await fs.readFile(
        path.join(__dirname, '..', 'instructions', filename), 
        'utf-8'
      );

      // Handle custom game type placeholder replacement
      if (gameType.toLowerCase() === 'custom') {
        worldInstructions = worldInstructions.replace('{world_description}', 'fantasy adventure world');
        worldInstructions = worldInstructions.replace('{location_examples}', 'villages, forests, dungeons, mountains, castles, taverns, shops');
        worldInstructions = worldInstructions.replace('{start_location}', 'Starting Location');
        worldInstructions = worldInstructions.replace('start_location_description', 'This is where your adventure begins in this fantasy world.');
      }

      console.log(`World generation instructions loaded from: ${filename}`);

      // Create world generation request
      const worldRequest = {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: worldInstructions
          },
          {
            role: 'user',
            content: `Generate 80-120 world locations in valid JSON format for ${gameType} genre. Make sure the response is complete and ends with a proper closing bracket.`
          }
        ],
        temperature: 0.7,
        max_tokens: 8000
      };

      console.log('🚀 Sending world generation request to OpenAI...');
      const response = await this.client.chat.completions.create(worldRequest);
      const worldData = response.choices[0].message.content.trim();

      console.log('📨 Received world data from OpenAI');
      console.log('Response length:', worldData.length);
      console.log('First 200 characters:', worldData.substring(0, 200));
      console.log('Last 200 characters:', worldData.substring(worldData.length - 200));
      console.log('🌍 =============== END GENERATING WORLD ===============\n');

      return worldData;
    } catch (error) {
      console.error('❌ World generation failed:', error);
      throw error;
    }
  }

  // Save image from URL
  async saveImage(imageUrl, filename) {
    try {
      const uploadPath = process.env.UPLOAD_PATH || './public/uploaded_files/';
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream'
      });

      const writer = require('fs').createWriteStream(path.join(uploadPath, filename));
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filename));
        writer.on('error', reject);
      });
    } catch (error) {
      throw error;
    }
  }

  async generateQuests(username, gameType, worldData) {
    try {
      console.log('\n🎯 =============== GENERATING QUESTS ===============');
      console.log(`Generating quests for player: ${username}`);
      console.log(`Game type: ${gameType}`);
      console.log(`World data type: ${typeof worldData}`);
      console.log(`World data length: ${Array.isArray(worldData) ? worldData.length : 'N/A'}`);
      if (Array.isArray(worldData) && worldData.length > 0) {
        console.log(`First location sample:`, JSON.stringify(worldData[0], null, 2));
      }

      const fs = require('fs').promises;
      const path = require('path');

      // Map game type to quest instruction file
      const questFileMap = {
        'adventure': 'quests_adv.txt',
        'scifi': 'quests_sci.txt', 
        'mystery': 'quests_mys.txt',
        'custom': 'quests_cus.txt'
      };

      const questFile = questFileMap[gameType] || 'quests_adv.txt';
      const questPromptPath = path.join(__dirname, '..', 'instructions', questFile);

      // Read the quest prompt file
      let questPrompt;
      try {
        console.log(`🎯 Reading quest prompt file: ${questPromptPath}`);
        questPrompt = await fs.readFile(questPromptPath, 'utf-8');
        console.log(`🎯 Successfully read quest prompt (${questPrompt.length} characters)`);
      } catch (fileError) {
        console.error(`❌ Could not read quest prompt file: ${questFile}`);
        console.error(`❌ File error:`, fileError);
        throw new Error(`Quest prompt file not found: ${questFile}`);
      }

      // Replace {insert_world_json} with actual world data
      const worldJson = JSON.stringify(worldData, null, 2);
      console.log(`🎯 World JSON length: ${worldJson.length}`);
      const finalPrompt = questPrompt.replace('{insert_world_json}', worldJson);
      console.log(`🎯 Final prompt length: ${finalPrompt.length}`);
      console.log(`🎯 Final prompt preview (first 500 chars):`, finalPrompt.substring(0, 500));

      console.log('🎯 Sending quest generation request to OpenAI...');
      
      let response;
      try {
        response = await this.client.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'user',
              content: finalPrompt
            }
          ],
          max_tokens: 4000,
          temperature: 0.8
        });
        console.log('🎯 Received quest response from OpenAI');
      } catch (openaiError) {
        console.error('❌ OpenAI API call failed:', openaiError);
        throw new Error(`OpenAI request failed: ${openaiError.message}`);
      }

      const questResponse = response.choices[0].message.content;
      console.log('🎯 Quest response length:', questResponse.length);
      console.log('🎯 Quest response preview:', questResponse.substring(0, 300));

      // Parse the JSON response to extract quests
      let quests = [];
      try {
        let jsonStr = questResponse.trim();
        
        // Handle markdown formatting
        const jsonMatch = questResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        
        // Try to find a complete JSON array even if response is truncated
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
        
        // If the JSON appears truncated, try to complete it
        if (jsonStr.endsWith(',') || jsonStr.match(/,\s*$/)) {
          // Remove trailing comma and close the array
          jsonStr = jsonStr.replace(/,\s*$/, '') + '\n]';
        } else if (!jsonStr.endsWith(']') && !jsonStr.endsWith('}')) {
          // Try to close incomplete objects/arrays
          const openBraces = (jsonStr.match(/\{/g) || []).length;
          const closeBraces = (jsonStr.match(/\}/g) || []).length;
          const openBrackets = (jsonStr.match(/\[/g) || []).length;
          const closeBrackets = (jsonStr.match(/\]/g) || []).length;
          
          // Add missing closing braces and brackets
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonStr += '\n    }';
          }
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonStr += '\n  ]';
          }
        }

        console.log('🎯 Attempting to parse cleaned JSON:', jsonStr.substring(0, 200) + '...');
        quests = JSON.parse(jsonStr);

        console.log(`🎯 Successfully parsed ${quests.length} quests`);
        return quests;

      } catch (parseError) {
        console.error('❌ Failed to parse quest JSON:', parseError);
        console.error('❌ Raw response length:', questResponse.length);
        console.error('❌ Raw response:', questResponse.substring(0, 1000));
        
        // Return empty array instead of failing completely
        console.log('⚠️ Returning empty quest array due to parse failure');
        return [];
      }

    } catch (error) {
      console.error('❌ Quest generation failed:', error);
      throw error;
    }
  }
}

module.exports = new OpenAIService();
