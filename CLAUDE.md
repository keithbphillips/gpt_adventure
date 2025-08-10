# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Start development server with auto-reload:
```bash
npm run dev
```

Start production server:
```bash
npm start
```

Run database migrations:
```bash
npm run migrate
```

Run tests:
```bash
npm test
```

Code quality:
```bash
npm run lint      # ESLint
npm run format    # Prettier
```

## Architecture Overview

This is a Node.js text-based adventure game powered by OpenAI GPT models. The application uses Express.js with EJS templating and Sequelize ORM.

### Core Architecture

- **server.js**: Main Express application with comprehensive security middleware (Helmet, CORS, rate limiting)
- **services/openaiService.js**: Central AI service handling GPT interactions, token management, and game state processing
- **models/**: Sequelize models for User, Convo (conversations), Location, and Picmap (image mappings)
- **routes/**: Separate route handlers for authentication, game pages, and API endpoints
- **middleware/auth.js**: JWT and session-based authentication

### Database Design

Uses SQLite for development and PostgreSQL for production. The conversation system stores game state as JSON within the Convo model, enabling persistent adventures across sessions.

Key models:
- **User**: Authentication and user management
- **Convo**: Game conversations with full JSON game state (health, inventory, location, etc.)
- **Location**: Persistent location data with visit tracking and exit information
- **Picmap**: Generated image mappings for game scenes

### Game Processing Flow

1. User submits action through web interface
2. API routes authenticate and validate input
3. OpenAI service retrieves conversation history and applies token limits
4. Game state is maintained through JSON objects embedded in conversation history
5. GPT processes context with game-specific instructions from `/instructions/` folder
6. Response includes both narrative text and updated JSON game state
7. Location and game state are persisted to database

### OpenAI Integration

The OpenAI service (`services/openaiService.js`) handles:
- Token counting and conversation history trimming (6000 token limit)
- Game instruction loading with caching (adventure, sci-fi, mystery, custom)
- Image generation with genre-specific prompts
- Retry logic for API reliability
- Movement validation and location context

### Security Features

- Helmet.js security headers with CSP
- Rate limiting (100 requests per 15 minutes on API routes)
- Input validation with express-validator
- JWT token authentication for API access
- Session-based authentication for web interface
- SQL injection prevention via Sequelize ORM

## Environment Setup

Required environment variables:
- OPENAI_API_KEY: OpenAI API key for GPT and image generation
- DB_HOST, DB_USER, DB_PASSWORD, DB_NAME: Database connection (PostgreSQL for production)
- JWT_SECRET: JWT token signing secret
- SESSION_SECRET: Express session secret

Optional model configuration variables (with defaults):
- OPENAI_GAME_MODEL: Model for game conversations and turns (default: gpt-4o)
- OPENAI_WORLD_MODEL: Model for world generation (default: gpt-4o)  
- OPENAI_QUEST_MODEL: Model for quest generation (default: gpt-4)
- OPENAI_IMAGE_MODEL: Model for image generation (default: dall-e-3)

### Model Configuration Recommendations

**For optimal performance and cost balance:**
- **Game Model (OPENAI_GAME_MODEL)**: Use `gpt-4o` for best quality gameplay, or `gpt-4o-mini` for faster/cheaper responses
- **World Model (OPENAI_WORLD_MODEL)**: Use `gpt-4o` for detailed worlds, or `gpt-4o-mini` for cost savings
- **Quest Model (OPENAI_QUEST_MODEL)**: Use `gpt-4` for complex quest generation, or `gpt-4o-mini` for simpler quests
- **Image Model (OPENAI_IMAGE_MODEL)**: Use `dall-e-3` for highest quality, or `dall-e-2` for cost savings

**Model options:**
- `gpt-4o`: Latest, fastest, highest quality (recommended for game interactions)
- `gpt-4o-mini`: Faster and cheaper alternative with good quality
- `gpt-4-turbo`: Previous generation, still high quality
- `gpt-4`: Original GPT-4, good for complex reasoning tasks
- `dall-e-3`: Latest image generation model
- `dall-e-2`: Previous generation image model

## Game Types

The application supports multiple game genres:
- **Adventure**: Fantasy medieval style (instructions.txt)
- **Sci-Fi**: Futuristic space/technology theme (instructions-scifi.txt)  
- **Mystery**: Noir detective style (instructions-mystery.txt)
- **Custom**: User-defined scenarios (instructions-custom.txt)

Each genre has specific instruction files in `/instructions/` and different image generation styles.

## Development Notes

- Game state is maintained as JSON within conversation records
- Location persistence enables revisiting areas with memory of previous visits
- Image generation uses DALL-E with genre-specific styling prompts
- The system uses token counting to maintain conversation context within API limits
- All API endpoints require authentication
- Database migrations should be run when model changes are made