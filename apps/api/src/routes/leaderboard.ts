import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";

export async function leaderboardRoutes(app: FastifyInstance) {
  // Get syndicate settings (for leader)
  app.get("/api/v1/syndicates/:id/settings", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);

    // Check if user is leader
    const membership = await prisma.membership.findFirst({
      where: {
        syndicateId: id,
        userId,
        role: "leader",
      },
    });

    if (!membership) {
      return reply.code(403).send({ error: "Only syndicate leaders can access settings" });
    }

    const settings = await prisma.syndicateSetting.findUnique({
      where: { syndicateId: id },
    });

    // Return default settings if none exist
    reply.send(settings || {
      syndicateId: id,
      leaderboardMetric: "sales",
      showSalesCount: true,
      showRevenue: true,
    });
  });

  // Update syndicate settings (for leader)
  app.put("/api/v1/syndicates/:id/settings", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      leaderboardMetric: z.enum(["sales", "revenue"]),
      showSalesCount: z.boolean(),
      showRevenue: z.boolean(),
    }).parse(req.body);

    // Check if user is leader
    const membership = await prisma.membership.findFirst({
      where: {
        syndicateId: id,
        userId,
        role: "leader",
      },
    });

    if (!membership) {
      return reply.code(403).send({ error: "Only syndicate leaders can update settings" });
    }

    const settings = await prisma.syndicateSetting.upsert({
      where: { syndicateId: id },
      update: body,
      create: {
        syndicateId: id,
        ...body,
      },
    });

    reply.send(settings);
  });

  // Get leaderboard
  app.get("/api/v1/syndicates/:id/leaderboard", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { timeFilter = "all" } = req.query as any;

    // Verify user is member of syndicate
    const membership = await prisma.membership.findFirst({
      where: {
        syndicateId: id,
        userId,
      },
    });

    if (!membership) {
      return reply.code(403).send({ error: "Not a member of this syndicate" });
    }

    // Get syndicate settings
    const settings = await prisma.syndicateSetting.findUnique({
      where: { syndicateId: id },
    });

    const metric = settings?.leaderboardMetric || "sales";
    const showSalesCount = settings?.showSalesCount ?? true;
    const showRevenue = settings?.showRevenue ?? true;

    // Calculate date range
    let dateFilter: any = {};
    const now = new Date();
    
    if (timeFilter === "month") {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFilter = { gte: firstDayOfMonth };
    } else if (timeFilter === "year") {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      dateFilter = { gte: firstDayOfYear };
    }
    // "all" has no filter

    // Get all transactions for this syndicate's members
    const memberIds = await prisma.membership.findMany({
      where: { syndicateId: id },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });

    const transactions = await prisma.affiliateTransaction.findMany({
      where: {
        userId: { in: memberIds.map(m => m.userId) },
        date: dateFilter,
      },
    });

    // Aggregate by user
    const aggregations: Record<string, {
      userId: string;
      name: string;
      email: string;
      salesCount: number;
      totalRevenue: number;
    }> = {};

    for (const member of memberIds) {
      aggregations[member.userId] = {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        salesCount: 0,
        totalRevenue: 0,
      };
    }

    for (const tx of transactions) {
      if (aggregations[tx.userId]) {
        aggregations[tx.userId].salesCount += 1;
        aggregations[tx.userId].totalRevenue += parseFloat(tx.price.toString());
      }
    }

    // Convert to array and sort
    let leaderboard: Array<{
      userId: string;
      name: string;
      email: string;
      salesCount: number;
      totalRevenue: number;
      rank: number;
    }> = Object.values(aggregations).map(entry => ({
      ...entry,
      rank: 0,
    }));

    if (metric === "revenue") {
      leaderboard.sort((a, b) => b.totalRevenue - a.totalRevenue);
    } else {
      leaderboard.sort((a, b) => b.salesCount - a.salesCount);
    }

    // Add ranking
    leaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Find current user's position
    const currentUserEntry = leaderboard.find(entry => entry.userId === userId);
    const currentUserRank = currentUserEntry?.rank;

    reply.send({
      leaderboard,
      settings: {
        metric,
        showSalesCount,
        showRevenue,
      },
      currentUserRank,
      timeFilter,
    });
  });
}
