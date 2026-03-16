import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { hashPassword, verifyPassword, generateToken, hashToken } from "../lib/auth.js";
import { createCsrfToken } from "../lib/csrf.js";
import { sendEmail, addSubscriber } from "../services/email.js";

const SESSION_TTL_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS || 1800);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const isProduction = process.env.NODE_ENV === "production";

export async function authRoutes(app: FastifyInstance) {
  const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  });

  // Rate limit: 1 email per IP per 5 minutes to prevent abuse
  const emailRateLimit = { max: 1, timeWindow: "5 minutes" };

  app.post("/api/v1/auth/register", { config: { rateLimit: emailRateLimit } }, async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(400).send({ error: "Email already in use" });

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    const token = generateToken(24);
    const tokenHash = hashToken(token);
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify?token=${token}`;
    
    // Add user to Mailvio group (non-blocking)
    addSubscriber(user.email, body.name.split(" ")[0]).catch(err => 
      console.error("[mailvio] Failed to add subscriber (non-critical):", err.message)
    );
    
    // Send verification email (non-blocking)
    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4f46e5;">Verify Your Email</h1>
          <p>Hi ${body.name},</p>
          <p>Thanks for registering at SyndCal! Please click the button below to verify your email address:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Confirm Your Account</a>
          </p>
          <p style="color: #666; font-size: 14px;">Or copy this link to your browser:<br><a href="${verifyUrl}" style="color: #4f46e5; word-break: break-all;">${verifyUrl}</a></p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
        </body>
      </html>
    `;
    sendEmail(user.email, "Verify your email", emailHtml).catch(err => 
      console.error("[mailvio] Failed to send email (non-critical):", err.message)
    );

    reply.send({ ok: true });
  });

  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user) return reply.code(401).send({ error: "Invalid credentials" });
      const ok = await verifyPassword(user.passwordHash, body.password);
      if (!ok) return reply.code(401).send({ error: "Invalid credentials" });
      if (!user.emailVerifiedAt) return reply.code(403).send({ error: "Email not verified" });

      const sessionToken = app.jwt.sign({ sub: user.id }, { expiresIn: SESSION_TTL_SECONDS });

      const refreshToken = generateToken(32);
      const refreshTokenHash = hashToken(refreshToken);
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refreshTokenHash,
          expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      const csrfToken = createCsrfToken();

      reply
        .setCookie("session", sessionToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: isProduction,
        })
        .setCookie("refresh", refreshToken, {
          httpOnly: true,
          path: "/api/v1/auth",
          sameSite: "strict",
          secure: isProduction,
        })
        .setCookie("csrf", csrfToken, {
          httpOnly: false,
          path: "/",
          sameSite: "strict",
          secure: isProduction,
        })
        .send({ ok: true, csrfToken });
    }
  );

  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const refreshToken = req.cookies.refresh;
    if (!refreshToken) return reply.code(401).send({ error: "Unauthorized" });

    const refreshTokenHash = hashToken(refreshToken);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshTokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const sessionToken = app.jwt.sign({ sub: record.userId }, { expiresIn: SESSION_TTL_SECONDS });
    const newRefreshToken = generateToken(32);
    const newRefreshHash = hashToken(newRefreshToken);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: newRefreshHash,
          expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const csrfToken = createCsrfToken();

    reply
      .setCookie("session", sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: isProduction,
      })
      .setCookie("refresh", newRefreshToken, {
        httpOnly: true,
        path: "/api/v1/auth",
        sameSite: "strict",
        secure: isProduction,
      })
      .setCookie("csrf", csrfToken, {
        httpOnly: false,
        path: "/",
        sameSite: "strict",
        secure: isProduction,
      })
      .send({ ok: true, csrfToken });
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const refreshToken = req.cookies.refresh;
    if (refreshToken) {
      const refreshTokenHash = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: refreshTokenHash },
        data: { revokedAt: new Date() },
      });
    }
    reply
      .clearCookie("session", { path: "/", sameSite: "strict", secure: isProduction })
      .clearCookie("refresh", { path: "/api/v1/auth", sameSite: "strict", secure: isProduction })
      .clearCookie("csrf", { path: "/", sameSite: "strict", secure: isProduction })
      .send({ ok: true });
  });

  app.get("/api/v1/auth/verify", async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.query);
    const tokenHash = hashToken(token);
    const record = await prisma.emailVerification.findUnique({ where: { tokenHash } });
    if (!record) return reply.code(400).send({ error: "Invalid token" });
    if (record.expiresAt.getTime() < Date.now()) return reply.code(400).send({ error: "Token expired" });
    await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await prisma.emailVerification.delete({ where: { id: record.id } });
    reply.send({ ok: true });
  });

  // Resend verification email (rate limited)
  app.post("/api/v1/auth/resend-verification", { config: { rateLimit: emailRateLimit } }, async (req, reply) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    
    // Always return success to prevent email enumeration
    if (!user) return reply.send({ ok: true });
    if (user.emailVerifiedAt) return reply.send({ ok: true });

    // Delete any existing verification tokens
    await prisma.emailVerification.deleteMany({ where: { userId: user.id } });

    // Create new verification token
    const token = generateToken(24);
    const tokenHash = hashToken(token);
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify?token=${token}`;
    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4f46e5;">Verify Your Email</h1>
          <p>Hi ${user.name},</p>
          <p>You requested a new verification link. Please click the button below to verify your email address:</p>
          <p style="margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Confirm Your Account</a>
          </p>
          <p style="color: #666; font-size: 14px;">Or copy this link to your browser:<br><a href="${verifyUrl}" style="color: #4f46e5; word-break: break-all;">${verifyUrl}</a></p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours. If you didn't request this, you can safely ignore this email.</p>
        </body>
      </html>
    `;
    sendEmail(user.email, "Verify your email", emailHtml).catch(err => 
      console.error("[mailvio] Failed to send email (non-critical):", err.message)
    );

    reply.send({ ok: true });
  });

  // Forgot password - initiate reset (rate limited)
  app.post("/api/v1/auth/forgot-password", { config: { rateLimit: emailRateLimit } }, async (req, reply) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    
    // Always return success to prevent email enumeration
    if (!user) return reply.send({ ok: true });

    // Delete any existing reset tokens for this user
    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });

    // Create new reset token
    const token = generateToken(32);
    const tokenHash = hashToken(token);
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
      },
    });

    const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4f46e5;">Reset Your Password</h1>
          <p>Hi ${user.name},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <p style="margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
          </p>
          <p style="color: #666; font-size: 14px;">Or copy this link to your browser:<br><a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a></p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </body>
      </html>
    `;
    sendEmail(user.email, "Reset your password", emailHtml).catch(err => 
      console.error("[mailvio] Failed to send email (non-critical):", err.message)
    );

    reply.send({ ok: true });
  });

  // Reset password - complete the reset
  app.post("/api/v1/auth/reset-password", async (req, reply) => {
    const body = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body);

    const tokenHash = hashToken(body.token);
    const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    
    if (!record) return reply.code(400).send({ error: "Invalid or expired token" });
    if (record.usedAt) return reply.code(400).send({ error: "Token already used" });
    if (record.expiresAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "Token expired" });
    }

    // Hash new password and update user
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all refresh tokens to force re-login
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    reply.send({ ok: true });
  });

  app.get("/api/v1/auth/me", async (req, reply) => {
    const sessionToken = req.cookies.session;
    if (!sessionToken) return reply.code(401).send({ error: "Unauthorized" });

    try {
      const payload = app.jwt.verify<{ sub: string }>(sessionToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, emailVerifiedAt: true },
      });
      if (!user) return reply.code(401).send({ error: "Unauthorized" });
      reply.send({ user });
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}
