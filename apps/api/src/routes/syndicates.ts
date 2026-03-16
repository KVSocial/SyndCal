import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";

export async function syndicateRoutes(app: FastifyInstance) {
  app.post("/api/v1/syndicates", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const body = z.object({ name: z.string().min(2), slug: z.string().min(2) }).parse(req.body);

    const syndicate = await prisma.syndicate.create({
      data: {
        name: body.name,
        slug: body.slug,
        createdByUserId: userId,
        memberships: { create: { userId, role: "leader" } },
      },
    });

    reply.send(syndicate);
  });

  app.get("/api/v1/syndicates", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const syndicates = await prisma.syndicate.findMany({
      where: { memberships: { some: { userId } } },
    });
    reply.send(syndicates);
  });

  app.get("/api/v1/syndicates/:id", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const syndicate = await prisma.syndicate.findFirst({
      where: { id, memberships: { some: { userId } } },
    });
    if (!syndicate) return reply.code(404).send({ error: "Not found" });
    reply.send(syndicate);
  });
}
