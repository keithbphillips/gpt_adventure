# GPT Adventure - Node.js Version

A Node.js implementation of the GPT Adventure game, providing immersive text-based adventures powered by OpenAI's GPT models.

## Features

- **Multiple Game Genres**: Adventure, Sci-Fi, Mystery, and Custom modes
- **Real-time AI Responses**: Powered by OpenAI GPT-4
- **User Authentication**: Secure login/registration system
- **Persistent Game State**: Save and continue adventures
- **Character Management**: Track stats, inventory, and progress
- **Image Generation**: AI-generated scene images
- **Responsive Design**: Works on desktop and mobile

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- OpenAI API key

### Installation

1. **Clone and navigate to the Node.js app:**
   ```bash
   cd nodejs-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database:**
   ```bash
   # Create PostgreSQL database
   createdb gptadventure_nodejs
   
   # Run migrations
   npm run migrate
   ```

5. **Start the server:**
   ```bash
   npm run dev  # Development with nodemon
   # or
   npm start    # Production
   ```

6. **Visit http://localhost:3000**

## Configuration

### Environment Variables

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gptadventure_nodejs
DB_USER=gptadventure
DB_PASSWORD=your_password

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h

# Session
SESSION_SECRET=your_session_secret
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/api-token` - Get JWT token
- `GET /auth/logout` - Logout

### Game APIs
- `POST /api/adv-api` - Adventure game endpoint
- `POST /api/cfg-api` - Configuration/character creation
- `POST /api/mys-api` - Mystery game endpoint
- `POST /api/sci-api` - Sci-fi game endpoint
- `POST /api/get-pic` - Generate scene images

### Game Pages
- `GET /` - Home page
- `GET /adventure` - Adventure game interface
- `GET /scifi` - Sci-fi game interface
- `GET /mystery` - Mystery game interface
- `GET /custom` - Custom game interface
- `GET /configure` - Character configuration

## Development

### Available Scripts

```bash
npm start        # Start production server
npm run dev      # Start development server with nodemon
npm run migrate  # Run database migrations
npm test         # Run tests
npm run lint     # Run ESLint
npm run format   # Format code with Prettier
```

### Project Structure

```
nodejs-app/
├── config/          # Configuration files
├── middleware/      # Express middleware
├── models/          # Sequelize database models
├── routes/          # Express route handlers
├── services/        # Business logic services
├── views/           # EJS templates
├── instructions/    # Game instruction files
├── public/          # Static assets
├── scripts/         # Utility scripts
└── server.js        # Main application entry point
```

### Database Models

- **User**: User accounts and authentication
- **Convo**: Game conversations and state
- **Picmap**: Generated image mappings

### Game Architecture

The game uses a stateful conversation system where:
1. Player sends action/command
2. System retrieves conversation history
3. OpenAI processes the context and generates response
4. Game state is updated and saved
5. Response is sent to client

## Deployment

### Production Setup

1. **Set environment to production:**
   ```bash
   export NODE_ENV=production
   ```

2. **Configure production database and secrets**

3. **Run with process manager:**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "gptadventure"
   ```

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Security Features

- Helmet.js for security headers
- Rate limiting on API endpoints
- Input validation and sanitization
- JWT token authentication
- Session-based authentication
- CORS protection
- SQL injection prevention via Sequelize ORM

## Performance Optimizations

- Connection pooling for database
- Request compression
- Static asset caching
- Token limit management for OpenAI API
- Efficient conversation history retrieval

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details