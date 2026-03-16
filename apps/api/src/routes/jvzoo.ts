import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { 
  verifyJvzooApiKey, 
  encryptApiKey, 
  decryptApiKey,
  importTransactionsForUser 
} from "../services/jvzoo.js";

export async function jvzooRoutes(app: FastifyInstance) {
  // Get current user's JVZoo credentials status
  app.get("/api/v1/jvzoo/credentials", async (req, reply) => {
    const userId = await requireAuth(app, req);
    
    const credentials = await prisma.jvzooCredential.findUnique({
      where: { userId },
    });

    if (!credentials) {
      return reply.send({ 
        configured: false, 
        verified: false 
      });
    }

    reply.send({
      configured: true,
      verified: credentials.verifiedAt !== null,
      verifiedAt: credentials.verifiedAt,
      verificationError: credentials.verificationError ? "Verification failed" : null,
      apiKeyPrefix: credentials.encryptedApiKey.substring(0, 8) + "...",
    });
  });

  // Save and verify JVZoo API key
  app.post("/api/v1/jvzoo/credentials", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const body = z.object({
      apiKey: z.string().min(1),
    }).parse(req.body);

    // Verify the API key works
    const verification = await verifyJvzooApiKey(body.apiKey);

    if (!verification.success) {
      // Save with error status
      await prisma.jvzooCredential.upsert({
        where: { userId },
        update: {
          encryptedApiKey: encryptApiKey(body.apiKey),
          verifiedAt: null,
          verificationError: "Verification failed",
        },
        create: {
          userId,
          encryptedApiKey: encryptApiKey(body.apiKey),
          verifiedAt: null,
          verificationError: "Verification failed",
        },
      });

      return reply.code(400).send({
        error: "API key verification failed",
      });
    }

    // Save verified credentials
    const credentials = await prisma.jvzooCredential.upsert({
      where: { userId },
      update: {
        encryptedApiKey: encryptApiKey(body.apiKey),
        verifiedAt: new Date(),
        verificationError: null,
      },
      create: {
        userId,
        encryptedApiKey: encryptApiKey(body.apiKey),
        verifiedAt: new Date(),
        verificationError: null,
      },
    });

    reply.send({
      ok: true,
      verified: true,
      verifiedAt: credentials.verifiedAt,
    });
  });

  // Delete JVZoo credentials
  app.delete("/api/v1/jvzoo/credentials", async (req, reply) => {
    const userId = await requireAuth(app, req);
    
    await prisma.jvzooCredential.deleteMany({
      where: { userId },
    });

    reply.send({ ok: true });
  });

  // Manual trigger for transaction import (for testing)
  app.post("/api/v1/jvzoo/import", async (req, reply) => {
    const userId = await requireAuth(app, req);
    
    const credentials = await prisma.jvzooCredential.findUnique({
      where: { userId },
    });

    if (!credentials || !credentials.verifiedAt) {
      return reply.code(400).send({
        error: "JVZoo credentials not configured or not verified",
      });
    }

    try {
      const apiKey = decryptApiKey(credentials.encryptedApiKey);
      const result = await importTransactionsForUser(userId, apiKey);
      
      reply.send({
        ok: true,
        imported: result.imported,
        skipped: result.skipped,
      });
    } catch (error) {
      console.error("JVZoo import failed", error);
      reply.code(500).send({
        error: "Import failed",
      });
    }
  });

  // Get user's transactions
  app.get("/api/v1/jvzoo/transactions", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { page = "1", limit = "50" } = req.query as any;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return reply.code(400).send({ error: "Invalid pagination" });
    }
    
    const transactions = await prisma.affiliateTransaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    const total = await prisma.affiliateTransaction.count({
      where: { userId },
    });

    reply.send({
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });
}
