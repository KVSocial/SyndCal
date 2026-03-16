import { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Routes exempt from CSRF (new users have no cookie yet)
const CSRF_EXEMPT_ROUTES = new Set([
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/resend-verification",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
]);

export function createCsrfToken() {
  return randomBytes(32).toString("hex");
}

export function verifyCsrf(app: FastifyInstance, req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  if (CSRF_EXEMPT_ROUTES.has(req.url)) return;
  const cookieToken = req.cookies.csrf;
  const headerToken = req.headers["x-csrf-token"] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw app.httpErrors.forbidden("Invalid CSRF token");
  }
}
