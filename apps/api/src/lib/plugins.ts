import { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

export async function registerPlugins(app: FastifyInstance) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required");
  }

  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(sensible);
  await app.register(jwt, { secret: jwtSecret });
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "https:", process.env.APP_URL || "http://localhost:3000"],
      },
    },
  });
}
