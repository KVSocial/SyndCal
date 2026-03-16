# SyndCal

A modern calendar syndication platform with user authentication, email verification, and affiliate tracking.

## Quick Start for LLMs

This is a monorepo with two apps:
- `apps/web` - Astro frontend (port 4321)
- `apps/api` - Fastify API backend (port 3001)

### Prerequisites

- Node.js 18+
- npm
- SQLite (included via Prisma)
- Mailvio account for transactional emails

### Installation

```bash
# Clone the repo
git clone https://github.com/KVSocial/SyndCal.git
cd SyndCal

# Install dependencies (from root)
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your values

# Initialize database
cd apps/api
npx prisma generate
npx prisma migrate deploy
cd ../..

# Build both apps
npm run build

# Start both services
npm run start
```

### Environment Variables

Create `apps/api/.env`:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-long-random-secret-min-32-chars"
APP_URL="http://localhost:4321"
CORS_ORIGINS="http://localhost:4321,http://localhost:3000"
JWT_EXPIRES_IN_SECONDS="1800"
REFRESH_TOKEN_TTL_DAYS="30"
NODE_ENV="development"

# Mailvio Email Service (required for email verification)
MAILVIO_API_KEY="your-mailvio-api-key"
MAILVIO_GROUP_ID="your-group-id"
MAILVIO_FROM_ADDRESS="noreply@yourdomain.com"
MAILVIO_FROM_NAME="SyndCal"
MAILVIO_REPLY_ADDRESS="noreply@yourdomain.com"
```

### Development

```bash
# Start both in development mode
npm run dev

# Or start individually:
# Terminal 1: API
cd apps/api && npm run dev

# Terminal 2: Web
cd apps/web && npm run dev
```

### Production Deployment

```bash
# Build
npm run build

# Start with PM2 (recommended)
pm2 start ecosystem.config.js

# Or start manually
cd apps/api && npm start &
cd apps/web && npm start &
```

### Project Structure

```
syndcal/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema
│   │   │   └── migrations/     # Migration files
│   │   └── src/
│   │       ├── routes/         # API endpoints
│   │       ├── lib/            # Utilities (auth, csrf, db)
│   │       └── services/       # External integrations
│   │
│   └── web/                    # Astro frontend
│       └── src/
│           ├── pages/          # Route pages
│           ├── layouts/        # Page layouts
│           └── lib/            # Client utilities
│
├── package.json                # Monorepo scripts
├── ecosystem.config.js         # PM2 config
└── README.md
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/logout` | Logout |
| POST | `/api/v1/auth/refresh` | Refresh session |
| GET | `/api/v1/auth/verify` | Verify email |
| POST | `/api/v1/auth/resend-verification` | Resend verification email |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password |
| GET | `/api/v1/auth/me` | Get current user |

### Features

- ✅ User registration with email verification
- ✅ Password reset flow
- ✅ JWT-based authentication with refresh tokens
- ✅ CSRF protection
- ✅ Rate limiting on auth endpoints (1 req/IP/5min)
- ✅ Mailvio transactional email integration

### Tech Stack

- **Frontend**: Astro, TailwindCSS, TypeScript
- **Backend**: Fastify, Prisma ORM, SQLite
- **Auth**: JWT with httpOnly cookies, CSRF tokens
- **Email**: Mailvio API

### Database Schema

Main tables:
- `User` - User accounts
- `EmailVerification` - Verification tokens
- `PasswordReset` - Password reset tokens
- `RefreshToken` - Session refresh tokens

Run `npx prisma studio` to view/edit data.

### License

MIT
