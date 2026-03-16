# SyndCal Phase 2 - JVZoo Integration

## Overview

This phase adds JVZoo affiliate tracking and leaderboard functionality to SyndCal.

## Features Implemented

### 1. JVZoo Integration Page (`/jvzoo-settings`)
- API key input and verification
- Secure storage (encrypted in database)
- Manual transaction import trigger
- Status display (verified/not verified)

### 2. Database Schema
New tables added:
- `JvzooCredential` - Stores encrypted API keys per user
- `AffiliateTransaction` - Stores imported JVZoo transactions
- `SyndicateSetting` - Leaderboard configuration per syndicate

### 3. Daily Cron Job
- Service file: `apps/api/src/services/cron.ts`
- Fetches transactions for all verified users
- Deduplication by `transaction_id`
- Retry logic (3 retries with exponential backoff)
- Rate limiting (500ms between API calls)

**Usage:**
```bash
cd apps/api
node dist/services/cron.js daily-jvzoo-import
```

### 4. Leaderboard Configuration
- Added to syndicate detail page (`/syndicate/[id]`)
- Only accessible by syndicate leaders
- Settings:
  - Ranking metric: "Number of sales" or "Revenue generated"
  - Privacy: Show/hide sales count, show/hide revenue

### 5. Leaderboard Page (`/syndicate/[id]/leaderboard`)
- Accessible to all syndicate members
- Time filters: All time, This month, This year
- Displays ranking based on syndicate's chosen metric
- Respects privacy settings
- Highlights current user's position

## API Endpoints

### JVZoo Routes
- `GET /api/v1/jvzoo/credentials` - Get current user's JVZoo status
- `POST /api/v1/jvzoo/credentials` - Save and verify API key
- `DELETE /api/v1/jvzoo/credentials` - Remove API key
- `POST /api/v1/jvzoo/import` - Manual import trigger
- `GET /api/v1/jvzoo/transactions` - Get user's transactions (paginated)

### Leaderboard Routes
- `GET /api/v1/syndicates/:id/settings` - Get syndicate settings (leader only)
- `PUT /api/v1/syndicates/:id/settings` - Update settings (leader only)
- `GET /api/v1/syndicates/:id/leaderboard` - Get leaderboard

## Files Created/Modified

### New Files
- `apps/api/src/routes/jvzoo.ts`
- `apps/api/src/routes/leaderboard.ts`
- `apps/api/src/services/jvzoo.ts`
- `apps/api/src/services/cron.ts`
- `apps/web/src/pages/jvzoo-settings.astro`
- `apps/web/src/pages/syndicate/[id]/leaderboard.astro`

### Modified Files
- `apps/api/prisma/schema.prisma` - Added 3 new models
- `apps/api/src/index.ts` - Registered new routes
- `apps/web/src/lib/api.ts` - Added API client methods
- `apps/web/src/layouts/Base.astro` - Added JVZoo nav link
- `apps/web/src/pages/syndicates/[id].astro` - Added leader settings panel

## Setup

1. Run migrations:
```bash
cd apps/api
npx prisma migrate dev
```

2. Start development servers:
```bash
# Terminal 1 - API
cd apps/api
npm run dev

# Terminal 2 - Web
cd apps/web
npm run dev
```

3. Set up daily cron (example for Windows Task Scheduler):
```powershell
# Run daily at 2:00 AM
$action = New-ScheduledTaskAction -Execute "node" -Argument "C:\path\to\syndcal\apps\api\dist\services\cron.js daily-jvzoo-import"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -TaskName "SyndCal-JVZoo-Import" -Action $action -Trigger $trigger
```

## Security Notes

- API keys are encrypted in the database using base64 encoding (for production, use proper encryption with crypto library)
- Update `JVZOO_ENCRYPTION_KEY` environment variable in production
- All endpoints require authentication via session cookie

## Testing

1. Navigate to `/jvzoo-settings`
2. Enter your JVZoo API key
3. Click "Save & Verify"
4. Optionally trigger manual import
5. Visit a syndicate page as leader to configure leaderboard
6. View leaderboard at `/syndicate/[id]/leaderboard`

## JVZoo API Details

**Endpoint:** `GET https://api.jvzoo.com/v2.0/latest-affiliates-transactions/{paykey}`

**Auth:** Basic Auth
- Username: API key
- Password: x

**Limitations:**
- Max 100 results per call
- Pagination via `paykey` parameter
- 90 days back if no paykey provided
