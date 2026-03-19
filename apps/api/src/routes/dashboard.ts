import { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard", async (req, reply) => {
    const userId = await requireAuth(app, req);
    
    // Get user memberships with syndicate details
    const memberships = await prisma.membership.findMany({ 
      where: { userId },
      include: { syndicate: true }
    });
    
    const syndicateIds = memberships.map((m) => m.syndicateId);
    
    // Get all reservations for user's syndicates
    const reservations = await prisma.reservation.findMany({
      where: { syndicateId: { in: syndicateIds } },
      include: { 
        syndicate: true,
        createdBy: true
      },
    });
    
    // Get current user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    });
    
    reply.send({
      user,
      memberships,
      reservations,
      hasSyndicate: memberships.length > 0
    });
  });
}
