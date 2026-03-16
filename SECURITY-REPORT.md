# SyndCal Security Report

## Executive Summary
Overall risk: **High**. The current implementation has multiple production‑blocking issues, primarily around authentication/session security, CSRF protection, weak secret handling, and authorization gaps. Because the app handles user credentials and financial data, these need to be addressed before deployment.

---

## Critical Issues (Must fix before deployment)

### 1) Weak/Default JWT Secret + No Token Expiry
**Severity:** Critical

**Location:**
- `apps/api/src/lib/plugins.ts:9-11`
- `apps/api/src/routes/auth.ts:47-50`

**Description:**
JWT signing uses `process.env.JWT_SECRET || "dev-secret"`, allowing a hardcoded default in production. Tokens are issued without expiration (`exp`) or rotation. Compromise of the default or leaked secret enables full account takeover indefinitely.

**Attack Vector:**
An attacker can forge JWTs if the secret is guessed or left at default, and sessions never expire, allowing persistent access.

**Fix Plan (Step‑by‑Step):**
1. Remove fallback to `dev-secret` (fail fast if missing).
2. Require strong secret from env (32+ bytes random).
3. Add short‑lived access tokens (`exp`) and rotating refresh tokens.
4. On login, set token expiry (e.g., 15–60 min) and implement refresh endpoint.
5. Rotate secret on breach (invalidate all tokens).

**Code Example:**
```ts
// plugins.ts
await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: "15m" },
});
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");
```

---

### 2) CSRF Exposure (Cookie‑Based Auth + Permissive CORS)
**Severity:** Critical

**Location:**
- `apps/api/src/lib/plugins.ts:8-9`
- `apps/api/src/routes/auth.ts:47-50`

**Description:**
Cookies are used for auth, CORS is `origin: true` with `credentials: true`, and there is **no CSRF protection**. Any site can issue credentialed requests, enabling CSRF on state‑changing endpoints.

**Attack Vector:**
Victim visits malicious site → browser sends authenticated cookie → attacker triggers actions (create syndicate, invite users, import JVZoo, etc.).

**Fix Plan:**
1. Restrict CORS to trusted origins only.
2. Add CSRF tokens (double‑submit or header‑based) for state‑changing routes.
3. Set `SameSite=Strict` or `Lax` plus CSRF header checks.
4. Ensure `Secure` cookies in production.

**Code Example:**
```ts
await app.register(cors, {
  origin: ["https://app.syndcal.com"],
  credentials: true,
});

reply.setCookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
});
```

---

### 3) JVZoo API Key Encryption is Reversible and Weak
**Severity:** Critical

**Location:**
- `apps/api/src/services/jvzoo.ts:226-241`

**Description:**
“Encryption” is just base64 of `secret:apiKey`. This is reversible and uses a default secret if not set. Any DB leak reveals API keys.

**Attack Vector:**
If DB or logs leak, attacker decodes base64 and recovers API keys.

**Fix Plan:**
1. Use strong encryption (AES‑256‑GCM) with a dedicated key from KMS or env.
2. Store IV + auth tag with ciphertext.
3. Remove fallback default key; fail if missing.
4. Rotate encryption keys and re‑encrypt stored secrets.

**Code Example (conceptual):**
```ts
import crypto from "node:crypto";
const key = Buffer.from(process.env.JVZOO_ENCRYPTION_KEY!, "hex");
function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}
```

---

### 4) Authorization Bypass: Reservation Delete Not Scoped
**Severity:** Critical

**Location:**
- `apps/api/src/routes/reservations.ts:64-71`

**Description:**
Deletion checks membership in the syndicate **but does not verify** the reservation belongs to that syndicate. A user in any syndicate can delete any reservation by id.

**Attack Vector:**
Attacker with any membership enumerates reservation IDs and deletes others’ reservations.

**Fix Plan:**
1. Fetch the reservation by `id` and `syndicateId` before deletion.
2. Enforce ownership or leader role if required.
3. Use `deleteMany` with both constraints.

**Code Example:**
```ts
await prisma.reservation.deleteMany({
  where: { id: rid, syndicateId: id },
});
```

---

## High Issues (Should fix before deployment)

### 5) Insecure Cookie Settings
**Severity:** High

**Location:**
- `apps/api/src/routes/auth.ts:47-50`

**Description:**
Session cookie lacks `secure` and has `sameSite: "lax"`. On HTTPS production, cookies should be `Secure` and ideally `SameSite=Strict` to reduce CSRF.

**Attack Vector:**
Cookie sent over insecure connections or cross‑site requests in some cases.

**Fix Plan:**
1. Set `secure: true` in production.
2. Set `sameSite: "strict"` unless app flow requires Lax.
3. Optionally set `domain` and `maxAge`.

---

### 6) No Rate Limiting / Brute Force Protection
**Severity:** High

**Location:**
- `apps/api/src/routes/auth.ts` (login/register)
- `apps/api/src/routes/invites.ts` (invite)
- `apps/api/src/routes/jvzoo.ts` (import)

**Description:**
No rate limiting on login, register, invite, or JVZoo endpoints. This enables brute force, enumeration, and API abuse.

**Attack Vector:**
Automated credential stuffing or invite spam, JVZoo API abuse.

**Fix Plan:**
1. Add IP‑based and account‑based rate limits for auth endpoints.
2. Add per‑user limits for invite creation and JVZoo import.
3. Implement exponential backoff or lockouts after failed attempts.

---

### 7) No JWT Verification Error Handling
**Severity:** High

**Location:**
- `apps/api/src/lib/auth-middleware.ts:1-6`

**Description:**
`app.jwt.verify()` can throw; no try/catch results in 500 errors, revealing server behavior and causing inconsistent auth failures.

**Attack Vector:**
Invalid tokens cause unhandled errors → potential DoS and info leakage.

**Fix Plan:**
1. Catch verify errors and return 401.
2. Optionally detect expired vs invalid tokens for UX.

**Code Example:**
```ts
try {
  const payload = app.jwt.verify<{ sub: string }>(token);
  return payload.sub;
} catch {
  throw app.httpErrors.unauthorized();
}
```

---

### 8) Invite Acceptance Allows Email Mismatch
**Severity:** High

**Location:**
- `apps/api/src/routes/invites.ts:37-90`

**Description:**
Invite acceptance does not verify that the provided email matches `invitedEmail`. Anyone with token can accept using a different email, effectively reassigning invites.

**Attack Vector:**
Attacker steals invite link and signs up with their own email, gaining access.

**Fix Plan:**
1. Enforce `body.email === invite.invitedEmail`.
2. If mismatch, reject request.
3. Log and alert on mismatches.

**Code Example:**
```ts
if (body.email !== invite.invitedEmail) {
  return reply.code(400).send({ error: "Email mismatch" });
}
```

---

## Medium Issues (Fix soon)

### 9) XSS via `innerHTML` Rendering of User‑Controlled Data
**Severity:** Medium

**Location:**
- `apps/web/src/pages/dashboard.astro:12-15`
- `apps/web/src/pages/syndicates.astro:16-23`
- `apps/web/src/pages/syndicates/[id].astro:63-108`
- `apps/web/src/pages/syndicate/[id]/leaderboard.astro:108-120`

**Description:**
Pages insert user‑controlled data into the DOM using `innerHTML` with template strings. Names, titles, or invite messages could contain malicious HTML/JS.

**Attack Vector:**
A malicious user sets a title or name containing `<script>` → executed for other users.

**Fix Plan:**
1. Replace `innerHTML` with safe DOM text insertion.
2. Use `textContent` and manual element creation.
3. Sanitize input on server (strip tags) as defense‑in‑depth.

---

### 10) Email/Invite Tokens Stored in Plaintext
**Severity:** Medium

**Location:**
- `apps/api/src/routes/auth.ts:24-35`
- `apps/api/src/routes/invites.ts:24-33`

**Description:**
Email verification and invite tokens are stored in plaintext. If DB is exposed, attackers can use tokens to verify or accept invites.

**Attack Vector:**
DB read access → token reuse.

**Fix Plan:**
1. Store hashed tokens (SHA‑256) and compare hashes.
2. Keep only hash in DB; send raw token to user.

---

### 11) Overly Permissive Error Details
**Severity:** Medium

**Location:**
- `apps/api/src/routes/jvzoo.ts:64-67, 127-133`

**Description:**
JVZoo verification and import errors return raw error messages. This can leak internal details or API responses.

**Attack Vector:**
Attackers can glean backend behavior or third‑party errors.

**Fix Plan:**
1. Return generic error messages to client.
2. Log detailed errors server‑side only.

---

### 12) Pagination Parameters Not Validated
**Severity:** Medium

**Location:**
- `apps/api/src/routes/jvzoo.ts:137-146`

**Description:**
`page` and `limit` are parsed without bounds checking. Large values could cause heavy queries or memory usage.

**Attack Vector:**
Attacker requests huge limit (e.g., 1e6) to degrade performance.

**Fix Plan:**
1. Validate `page` and `limit` with zod, enforce min/max.
2. Cap `limit` (e.g., 100).

---

## Low Issues (Nice to have)

### 13) Hardcoded Dev Settings in Repo
**Severity:** Low

**Location:**
- `apps/api/.env` (committed)

**Description:**
`.env` includes default secrets and is checked into the repo. This encourages unsafe defaults in production.

**Fix Plan:**
1. Remove `.env` from repo; provide `.env.example`.
2. Enforce secret management via environment variables or secret manager.

---

### 14) No Security Headers
**Severity:** Low

**Location:**
- `apps/api/src/index.ts`

**Description:**
No headers like `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` are set. These reduce XSS/clickjacking risk.

**Fix Plan:**
1. Add `@fastify/helmet` and configure CSP.

---

## Additional Notes
- **Database:** SQLite is fine for dev but not recommended for production with financial data. Use Postgres with encryption at rest and backups.
- **Secrets Management:** Consider a secret manager (AWS KMS/SM, GCP Secret Manager, etc.).
- **Logging:** Avoid logging PII or API keys.

---

## Summary of Required Actions (Priority)
1. Enforce strong JWT secret + expiry + refresh tokens.
2. Lock down CORS and add CSRF protection.
3. Replace JVZoo key “encryption” with real encryption + proper key management.
4. Fix reservation delete authorization scope.
5. Add rate limiting and brute force protection.
6. Fix XSS patterns by removing `innerHTML` for user content.
