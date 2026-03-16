# SyndCal Technical Specification (Phase 1)

Project: **SyndCal**
Target: **syndcal.kvtechnology.io**
Owner: **KVT**
Role: **Dev Planner**

---

## 1. Tech Stack Recommendation

### 1.1 Frontend
- **Framework:** **Astro** (server-rendered + islands, no React required)
- **UI Library:** Tailwind CSS (utility-first, fast iteration for “simple, modern, sexy” UI)
- **Components (optional):** Alpine.js for small interactivity (modals, dropdowns)
- **Calendar UI:** FullCalendar (vanilla/JS or lite build) or TUI Calendar (vanilla)

**Why:** Astro avoids React, keeps pages fast, supports partial hydration if needed.

### 1.2 Backend
- **Runtime:** Node.js (LTS)
- **Framework:** **Fastify** (high performance, typed, plugin-friendly)
- **Auth:** Lucia (sessions, password auth) or custom auth with Argon2 + JWT/session cookies
- **Email:** Postmark / Mailgun / AWS SES
- **Validation:** Zod (schema validation)
- **ORM/DB:** Prisma + PostgreSQL

### 1.3 Database
- **Primary DB:** PostgreSQL (rigid constraints, robust date querying, multi-tenant scaling)

### 1.4 Infrastructure & Deployment
- **Hosting:** VPS or managed Node host (e.g., Hetzner/DigitalOcean) with Nginx reverse proxy
- **Domain:** `syndcal.kvtechnology.io`
- **SSL:** Let’s Encrypt
- **Process Manager:** PM2 or systemd
- **CI/CD:** GitHub Actions (build/test/deploy)

---

## 2. Database Schema Design

### Entity Overview
- **User** (account) can belong to multiple **Syndicates**
- **Syndicate** has many **Members**
- **Membership** defines role (leader/member)
- **Invite** links email to a Syndicate and invite token
- **Reservation** tied to Syndicate

### 2.1 Tables

#### `users`
- `id` (UUID, PK)
- `email` (unique, indexed)
- `password_hash`
- `email_verified_at` (nullable)
- `name`
- `created_at`
- `updated_at`

#### `syndicates`
- `id` (UUID, PK)
- `name`
- `slug` (unique)
- `created_by_user_id` (FK → users.id)
- `created_at`
- `updated_at`

#### `memberships`
- `id` (UUID, PK)
- `user_id` (FK → users.id)
- `syndicate_id` (FK → syndicates.id)
- `role` (enum: `leader`, `member`)
- `created_at`

**Unique constraint:** `(user_id, syndicate_id)`

#### `invites`
- `id` (UUID, PK)
- `syndicate_id` (FK → syndicates.id)
- `invited_email`
- `invited_name`
- `invite_message` (text)
- `token` (unique)
- `status` (enum: `pending`, `accepted`, `expired`)
- `expires_at`
- `created_by_user_id` (FK → users.id)
- `created_at`
- `accepted_at` (nullable)

#### `reservations`
- `id` (UUID, PK)
- `syndicate_id` (FK → syndicates.id)
- `created_by_user_id` (FK → users.id)
- `title` (e.g., product launch name)
- `start_date` (date)
- `end_date` (date)
- `created_at`
- `updated_at`

**Constraints:**
- `end_date >= start_date`
- max 7 days: `(end_date - start_date + 1) <= 7`
- max 3 months in advance: `start_date <= NOW() + INTERVAL '3 months'`
- no overlap per syndicate: enforced by query + transaction

### 2.2 Indices
- `reservations(syndicate_id, start_date, end_date)`
- `invites(token)`
- `memberships(user_id, syndicate_id)`

---

## 3. API Endpoint Specification

**Base URL:** `/api/v1`

### 3.1 Auth
- `POST /auth/register` → create account, send verification email
- `POST /auth/login` → create session
- `POST /auth/logout` → destroy session
- `GET /auth/verify?token=...` → verify email
- `POST /auth/forgot` → send reset link
- `POST /auth/reset` → reset password

### 3.2 Syndicates
- `POST /syndicates` → create syndicate (leader becomes creator)
- `GET /syndicates` → list syndicates user belongs to
- `GET /syndicates/:id` → syndicate detail

### 3.3 Memberships & Invites
- `POST /syndicates/:id/invites` → invite member (leader only)
- `GET /syndicates/:id/invites` → list invites (leader only)
- `POST /invites/accept` → accept invite by token (creates account if needed)
- `POST /invites/decline` → decline invite

### 3.4 Reservations
- `GET /syndicates/:id/reservations` → list reservations
- `POST /syndicates/:id/reservations` → create reservation
- `DELETE /syndicates/:id/reservations/:rid` → delete reservation

### 3.5 Dashboard
- `GET /dashboard` → combined view for all syndicates user belongs to

---

## 4. File/Folder Structure

```
syndcal/
├─ apps/
│  ├─ web/                 # Astro frontend
│  │  ├─ src/
│  │  │  ├─ layouts/
│  │  │  ├─ pages/
│  │  │  ├─ components/
│  │  │  ├─ styles/
│  │  │  └─ lib/api.ts
│  │  └─ astro.config.mjs
│  └─ api/                 # Fastify backend
│     ├─ src/
│     │  ├─ routes/
│     │  ├─ controllers/
│     │  ├─ services/
│     │  ├─ middleware/
│     │  ├─ plugins/
│     │  ├─ lib/
│     │  └─ index.ts
│     └─ prisma/
│        └─ schema.prisma
├─ packages/
│  ├─ ui/                  # shared UI components
│  └─ config/              # shared config, zod schemas
├─ infra/
│  ├─ nginx/
│  └─ deploy/
├─ docs/
└─ README.md
```

---

## 5. Implementation Phases

### Phase 0 — Setup
- Repo setup
- CI/CD pipeline
- Database provisioning

### Phase 1 — Core MVP
- Auth (register/login/verify)
- Syndicate CRUD
- Invite flow
- Calendar views
- Reservation constraints enforced
- Dashboard combined view

### Phase 2 — UX Polish
- Modern UI styling
- Mobile responsiveness
- Validation UX

### Phase 3 — QA + Launch
- Test coverage
- Load test
- Deploy to `syndcal.kvtechnology.io`

---

## 6. Third-Party Services Needed

- **Email delivery:** Postmark / Mailgun / AWS SES
- **DB hosting:** Managed Postgres (Supabase, Neon, or DO Managed)
- **Monitoring:** Sentry (frontend + backend)
- **Analytics:** Plausible (optional)

---

## Notes
- No ReactJS is used (Astro + Tailwind + optional Alpine.js)
- Multi-syndicate membership supported
- Reservation conflicts prevented by DB + transaction checks
- Max 7-day reservation & 3-month forward limit enforced

