import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { generateToken, hashPassword, verifyPassword, hashToken } from "../lib/auth.js";
import { sendEmail } from "../services/email.js";

export async function inviteRoutes(app: FastifyInstance) {
  app.post("/api/v1/syndicates/:id/invites", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({ email: z.string().email(), name: z.string().min(2), message: z.string().min(1) })
      .parse(req.body);

    const membership = await prisma.membership.findFirst({ where: { userId, syndicateId: id } });
    if (!membership || membership.role !== "leader") return reply.code(403).send({ error: "Forbidden" });

    const token = generateToken(24);
    const tokenHash = hashToken(token);
    const invite = await prisma.invite.create({
      data: {
        syndicateId: id,
        invitedEmail: body.email,
        invitedName: body.name,
        inviteMessage: body.message,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        createdByUserId: userId,
      },
    });

    const inviteUrl = `${process.env.APP_URL || "http://localhost:3000"}/invite/${token}`;
    await sendEmail(body.email, "You are invited to SyndCal", `Join here: ${inviteUrl}`);

    reply.send({
      ...invite,
      tokenHash: undefined,
    } as any);
  });

  app.get("/api/v1/syndicates/:id/invites", async (req, reply) => {
    const userId = await requireAuth(app, req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const membership = await prisma.membership.findFirst({ where: { userId, syndicateId: id } });
    if (!membership || membership.role !== "leader") return reply.code(403).send({ error: "Forbidden" });
    const invites = await prisma.invite.findMany({ where: { syndicateId: id } });
    reply.send(invites.map(invite => ({ ...invite, tokenHash: undefined })) as any);
  });

  app.post("/api/v1/invites/accept", async (req, reply) => {
    const body = z
      .object({
        token: z.string(),
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body);

    const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!invite || invite.status !== "pending") return reply.code(400).send({ error: "Invalid invite" });
    if (invite.expiresAt.getTime() < Date.now()) return reply.code(400).send({ error: "Invite expired" });
    if (invite.invitedEmail.toLowerCase() !== body.email.toLowerCase()) {
      return reply.code(400).send({ error: "Invite email does not match" });
    }

    let user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      const passwordHash = await hashPassword(body.password);
      user = await prisma.user.create({
        data: { email: body.email, name: body.name, passwordHash, emailVerifiedAt: new Date() },
      });
    } else {
      const ok = await verifyPassword(user.passwordHash, body.password);
      if (!ok) return reply.code(401).send({ error: "Invalid credentials" });
    }

    const existingMembership = await prisma.membership.findFirst({
      where: { userId: user.id, syndicateId: invite.syndicateId },
    });
    if (!existingMembership) {
      await prisma.membership.create({ data: { userId: user.id, syndicateId: invite.syndicateId, role: "member" } });
    }
    await prisma.invite.update({ where: { id: invite.id }, data: { status: "accepted", acceptedAt: new Date() } });

    reply.send({ ok: true });
  });

  app.post("/api/v1/invites/decline", async (req, reply) => {
    const body = z.object({ token: z.string() }).parse(req.body);
    const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!invite) return reply.code(400).send({ error: "Invalid invite" });
    await prisma.invite.update({ where: { id: invite.id }, data: { status: "expired" } });
    reply.send({ ok: true });
  });
}
