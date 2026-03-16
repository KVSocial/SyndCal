import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const memberships = await prisma.membership.findMany({ where: { userId } });
    const syndicateIds = memberships.map((m) => m.syndicateId);
    const reservations = await prisma.reservation.findMany({
      where: { syndicateId: { in: syndicateIds } },
      include: { syndicate: true },
    });
    reply.send(reservations);
  });
}
