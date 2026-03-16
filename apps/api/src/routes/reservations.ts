import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export async function reservationRoutes(app: FastifyInstance) {
  app.get("/api/v1/syndicates/:id/reservations", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const membership = await prisma.membership.findFirst({ where: { userId, syndicateId: id } });
    if (!membership) return reply.code(403).send({ error: "Forbidden" });

    const reservations = await prisma.reservation.findMany({ where: { syndicateId: id } });
    reply.send(reservations);
  });

  app.post("/api/v1/syndicates/:id/reservations", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({ title: z.string().min(2), startDate: z.string(), endDate: z.string() })
      .parse(req.body);

    const membership = await prisma.membership.findFirst({ where: { userId, syndicateId: id } });
    if (!membership) return reply.code(403).send({ error: "Forbidden" });

    const start = new Date(body.startDate);
    const end = new Date(body.endDate);

    if (end < start) return reply.code(400).send({ error: "Invalid date range" });
    if (daysBetween(start, end) > 7) return reply.code(400).send({ error: "Max 7 days" });
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    if (start > threeMonths) return reply.code(400).send({ error: "Too far in advance" });

    const reservation = await prisma.$transaction(async (tx) => {
      const overlap = await tx.reservation.findFirst({
        where: {
          syndicateId: id,
          OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
        },
      });
      if (overlap) throw app.httpErrors.badRequest("Overlap");

      return tx.reservation.create({
        data: {
          syndicateId: id,
          createdByUserId: userId,
          title: body.title,
          startDate: start,
          endDate: end,
        },
      });
    });

    reply.send(reservation);
  });

  app.delete("/api/v1/syndicates/:id/reservations/:rid", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id, rid } = z.object({ id: z.string(), rid: z.string() }).parse(req.params);
    const membership = await prisma.membership.findFirst({ where: { userId, syndicateId: id } });
    if (!membership) return reply.code(403).send({ error: "Forbidden" });

    await prisma.reservation.deleteMany({
      where: {
        id: rid,
        syndicateId: id,
      },
    });
    reply.send({ ok: true });
  });
}
