# SyndCal

A modern calendar syndication platform built with Astro and Fastify.

## Features

- User registration with email verification
- Password reset functionality
- JWT-based authentication with refresh tokens
- Mailvio transactional email integration
- Rate limiting on authentication endpoints

## Tech Stack

- **Frontend**: Astro, TailwindCSS
- **Backend**: Fastify, Prisma, SQLite
- **Email**: Mailvio API

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit .env with your values

# Run database migrations
cd apps/api && npx prisma migrate dev

# Start development servers
npm run dev
```

### Environment Variables

Create a `.env` file in `apps/api/` with:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-here"
MAILVIO_API_KEY="your-mailvio-api-key"
MAILVIO_GROUP_ID="your-group-id"
MAILVIO_FROM_ADDRESS="noreply@yourdomain.com"
APP_URL="http://localhost:4321"
```

## Project Structure

```
syndcal/
├── apps/
│   ├── api/          # Fastify API backend
│   └── web/          # Astro frontend
├── packages/         # Shared packages
└── package.json      # Monorepo root
```

## License

MIT
