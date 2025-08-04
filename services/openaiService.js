const OpenAI = require('openai');
const { encoding_for_model } = require('tiktoken');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.encoding = encoding_for_model('gpt-4');
    this.instructionsCache = new Map(); // Cache for game instructions
  }

  // Clear instruction cache (useful when instructions are updated)
  clearInstructionCache() {
    this.instructionsCache.clear();
    console.log('Instruction cache cleared');
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

  // Extract JSON from GPT response
  extractJson(jsonString) {
    const regex = /(\{.*\})/ms;
    const matches = jsonString.match(regex);
    return matches ? matches[1] : null;
  }

  // Query GPT with retry logic
  async queryGpt(eventList, model = 'gpt-4o', temperature = 0.6, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log('EVENT_LIST:', eventList);
        
        const response = await this.client.chat.completions.create({
          model: model,
          messages: eventList,
          temperature: temperature,
          max_tokens: 1200, // Increased for better storytelling
          stream: false // Keep non-streaming for simplicity, but could enable later
        });

        return response.choices[0].message;
      } catch (error) {
        console.error(`GPT API Error (attempt ${attempt}):`, error);
        
        if (error.status === 500 && attempt < retries) {
          console.log('Server overloaded, retrying...');
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
        custom: 'instructions-custom.txt'
      };
      
      const filename = instructionFiles[gameType] || instructionFiles.adventure;
      const instructionsPath = path.join(__dirname, '..', 'instructions', filename);
      
      const instructions = await fs.readFile(instructionsPath, 'utf-8');
      
      // Cache the instructions
      this.instructionsCache.set(gameType, instructions);
      
      return instructions;
    } catch (error) {
      console.error('Error loading instructions:', error);
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

  // Update location information in database
  async updateLocationInfo(username, locationName, description, exits, genre) {
    try {
      const { Location } = require('../models');
      
      if (!Location) {
        console.error('Location model not found');
        return;
      }
      
      if (!locationName || locationName === 'start' || locationName === '-') {
        return;
      }

      // Find or create the location record
      const [location, created] = await Location.findOrCreate({
        where: {
          player: username,
          genre: genre,
          name: locationName
        },
        defaults: {
          description: description || '',
          shortDescription: this.createShortDescription(description),
          exits: typeof exits === 'object' ? JSON.stringify(exits) : String(exits || ''),
          visited: true,
          visitCount: 1,
          lastVisited: new Date()
        }
      });

      if (!created) {
        // Update existing location
        await location.update({
          description: description || location.description,
          shortDescription: description ? this.createShortDescription(description) : location.shortDescription,
          exits: typeof exits === 'object' ? JSON.stringify(exits) : String(exits || location.exits),
          visitCount: location.visitCount + 1,
          lastVisited: new Date()
        });
      }
    } catch (error) {
      console.error('Error updating location info:', error);
    }
  }

  // Create a short description suitable for image generation
  createShortDescription(fullDescription) {
    if (!fullDescription) return '';
    
    // Extract the first sentence or 100 characters, whichever is shorter
    const firstSentence = fullDescription.split(/[.!?]/)[0];
    const shortDesc = firstSentence.length > 100 ? 
      fullDescription.substring(0, 100) + '...' : 
      firstSentence + '.';
    
    return shortDesc.trim();
  }

  // Get location context for OpenAI
  async getLocationContext(username, locationName, genre) {
    try {
      const { Location } = require('../models');
      
      if (!Location) {
        console.error('Location model not found in getLocationContext');
        return null;
      }
      
      const location = await Location.findOne({
        where: {
          player: username,
          genre: genre,
          name: locationName
        }
      });

      if (location) {
        return {
          hasVisited: location.visited,
          visitCount: location.visitCount,
          knownExits: location.exits,
          description: location.description
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting location context:', error);
      return null;
    }
  }

  // Main game processing function
  async processGameTurn(user, messages, command, gameType = 'adventure') {
    try {
      const gameElements = [
        'Genre', 'Query', 'Temp', 'Name', 'Class', 'Race', 'Turn', 'Time', 
        'Day', 'Weather', 'Health', 'XP', 'AC', 'Level', 'Location', 'Exits', 
        'Quest', 'Inventory', 'Gender', 'Registered', 'Stats', 'Gold'
      ];

      let temperature = 0.6;
      let lastGameState = {};
      const eventList = [];

      // Load game instructions with explicit length restriction
      const instructions = await this.loadInstructions(gameType);
      const lengthEnforcement = `

MANDATORY LENGTH RESTRICTION: Your narrative response MUST be 1-3 paragraphs only. Count your paragraphs before responding. If you write more than 3 paragraphs, you are failing to follow instructions.`;
      
      const instruction = { role: 'system', content: instructions + lengthEnforcement };

      // Process conversation history with narrative context
      for (const event of messages) {
        eventList.push({ role: 'user', content: event.contentUser || '' });
        
        // Include the actual narrative response that was given, not just JSON data
        let narrativeContent = '';
        if (event.action && event.action.length > 0) {
          narrativeContent = event.action;
        }
        
        const gameData = {
          Genre: event.genre || '',
          Temp: event.temp || '',
          Name: event.name || '',
          Class: event.playerClass || '',
          Race: event.race || '',
          Turn: event.turn || '',
          Time: event.timePeriod || '',
          Day: event.dayNumber || '',
          Weather: event.weather || '',
          Health: event.health || '',
          XP: event.xp || '',
          AC: event.ac || '',
          Level: event.level || '',
          Description: event.description || '',
          Action: event.action || '',
          Quest: event.quest || '',
          Query: event.query || '',
          Inventory: event.inventory || '',
          Location: event.location || '',
          Exits: event.exits || '',
          Gender: event.gender || '',
          Registered: event.registered || '',
          Stats: event.stats || '',
          Gold: event.gold || ''
        };

        // Send both narrative and JSON for better context
        const fullResponse = narrativeContent ? 
          `${narrativeContent}\n\n${JSON.stringify(gameData)}` : 
          JSON.stringify(gameData);
        
        eventList.push({ role: 'assistant', content: fullResponse });
        temperature = event.temp ? parseInt(event.temp) / 10 : 0.6;
        lastGameState = gameData; // Track the last game state for continuity
      }

      // Validate temperature
      if (temperature < 0 || temperature > 1) {
        temperature = 0.6;
      }

      // Get last game state
      try {
        if (eventList.length > 0) {
          const lastEvent = eventList[eventList.length - 1];
          lastGameState = JSON.parse(lastEvent.content);
        } else {
          // Initialize empty state
          gameElements.forEach(element => {
            lastGameState[element] = '';
          });
        }
      } catch (error) {
        console.error('Error parsing last game state:', error);
        gameElements.forEach(element => {
          lastGameState[element] = '';
        });
      }

      // Check token limits
      const checkedEventList = this.checkTokenCount(eventList);
      
      // Add instruction and context primer
      checkedEventList.unshift(instruction);
      
      // Add gamestate JSON and context primer (Django-style approach)
      if (lastGameState && lastGameState.Name) {
        // Get location context if available - use 'Custom' genre for custom games
        const contextGenre = gameType === 'custom' ? 'Custom' : (lastGameState.Genre || gameType);
        const locationContext = await this.getLocationContext(user, lastGameState.Location, contextGenre);
        
        // Build current game state JSON string
        const currentGameState = {
          Genre: lastGameState.Genre || gameType,
          Name: lastGameState.Name,
          Class: lastGameState.Class,
          Race: lastGameState.Race,
          Turn: lastGameState.Turn,
          Time: lastGameState.Time,
          Day: lastGameState.Day,
          Weather: lastGameState.Weather,
          Health: lastGameState.Health,
          XP: lastGameState.XP,
          AC: lastGameState.AC,
          Level: lastGameState.Level,
          Location: lastGameState.Location,
          Exits: lastGameState.Exits,
          Quest: lastGameState.Quest,
          Inventory: lastGameState.Inventory,
          Gender: lastGameState.Gender,
          Registered: lastGameState.Registered,
          Stats: lastGameState.Stats,
          Gold: lastGameState.Gold
        };
        
        let contextContent = `CURRENT GAME STATE (maintain consistency):
${JSON.stringify(currentGameState, null, 2)}

CONTEXT: Continue the story for ${lastGameState.Name} (${lastGameState.Class}) at ${lastGameState.Location}. Current quest: ${lastGameState.Quest}.

CRITICAL: Keep your narrative response to 1-3 paragraphs maximum. No exceptions!`;
        
        if (locationContext && locationContext.hasVisited) {
          contextContent += ` This location has been visited ${locationContext.visitCount} time(s) before.`;
        }
        
        // Add movement validation
        const movementMatch = command.match(/go\s+(north|south|east|west|northeast|northwest|southeast|southwest|up|down)/i);
        if (movementMatch) {
          const direction = movementMatch[1].toLowerCase();
          const currentExits = lastGameState.Exits || '';
          
          // Check if the requested direction is available
          const availableExits = currentExits.toLowerCase().split(',').map(e => e.trim());
          const isValidMove = availableExits.includes(direction);
          
          if (!isValidMove) {
            contextContent += `\n\nCRITICAL: Player trying to go ${direction} but current exits are: ${currentExits}. REFUSE this movement!`;
          } else {
            const opposites = {
              'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east',
              'northeast': 'southwest', 'southwest': 'northeast', 
              'northwest': 'southeast', 'southeast': 'northwest',
              'up': 'down', 'down': 'up'
            };
            const returnDirection = opposites[direction];
            contextContent += `\n\nMoving ${direction} (valid). Return direction should be ${returnDirection}.`;
          }
        }
        
        contextContent += `\n\nPlayer action: "${command}"\n\nREMINDER: Response must be 1-3 paragraphs maximum. Be concise and impactful.`;
        
        const contextPrimer = {
          role: 'system',
          content: contextContent
        };
        checkedEventList.push(contextPrimer);
      }
      
      checkedEventList.push({ role: 'user', content: command });

      console.log('COMMAND:', { role: 'user', content: command });

      // Query GPT (using gpt-4o-mini for faster responses)
      const message = await this.queryGpt(checkedEventList, 'gpt-4o-mini', temperature);
      const messageContent = message.content.strip ? message.content.strip() : message.content.trim();
      
      console.log('MESSAGE:', messageContent);

      // Extract JSON from response
      const messageData = this.extractJson(messageContent);
      
      if (messageData) {
        const messageText = messageContent.replace(messageData, '').trim();
        const jsonData = JSON.parse(messageData);

        // Use Description as narrative if message text is empty
        let narrativeText = messageText;
        if (!narrativeText) {
          narrativeText = jsonData.Description || '';
          jsonData.Description = '';
        }

        // Fill in missing game elements from last state
        if (lastGameState) {
          gameElements.forEach(element => {
            if (!jsonData[element]) {
              jsonData[element] = lastGameState[element] || '';
            }
          });
        }

        // Update location information in database
        if (jsonData.Location && jsonData.Location !== '-') {
          // For custom games, always use 'Custom' as the static genre
          const locationGenre = gameType === 'custom' ? 'Custom' : (jsonData.Genre || gameType);
          await this.updateLocationInfo(
            user, 
            jsonData.Location, 
            jsonData.Description || narrativeText,
            jsonData.Exits,
            locationGenre
          );
        }

        return {
          content: narrativeText,
          data: jsonData
        };
      } else {
        // Fallback if no JSON found
        const fallbackResponse = {
          content: messageContent,
          data: lastGameState
        };
        
        console.log('JSON-FAIL:', JSON.stringify(fallbackResponse));
        return fallbackResponse;
      }
    } catch (error) {
      console.error('Game processing error:', error);
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
      
      console.log('Image generation prompt:', enhancedPrompt);
      
      const response = await this.client.images.generate({
        prompt: enhancedPrompt,
        n: 1,
        size: '256x256'
      });

      return response.data[0].url;
    } catch (error) {
      console.error('Image generation error:', error);
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
      console.error('Image save error:', error);
      throw error;
    }
  }
}

module.exports = new OpenAIService();