import { FastifyInstance, FastifyRequest } from "fastify";

export async function requireAuth(app: FastifyInstance, req: FastifyRequest) {
  const token = req.cookies.session;
  if (!token) throw app.httpErrors.unauthorized();
  try {
    const payload = app.jwt.verify<{ sub: string }>(token);
    return payload.sub;
  } catch {
    throw app.httpErrors.unauthorized();
  }
}
