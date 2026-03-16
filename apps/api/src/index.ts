import Fastify from "fastify";
import { registerPlugins } from "./lib/plugins.js";
import { authRoutes } from "./routes/auth.js";
import { syndicateRoutes } from "./routes/syndicates.js";
import { inviteRoutes } from "./routes/invites.js";
import { reservationRoutes } from "./routes/reservations.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { jvzooRoutes } from "./routes/jvzoo.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { verifyCsrf } from "./lib/csrf.js";

const app = Fastify({ logger: true });

await registerPlugins(app);

app.addHook("preHandler", async (req) => {
  verifyCsrf(app, req);
});

await authRoutes(app);
await syndicateRoutes(app);
await inviteRoutes(app);
await reservationRoutes(app);
await dashboardRoutes(app);
await jvzooRoutes(app);
await leaderboardRoutes(app);

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT || 4000);
app.listen({ port, host: "0.0.0.0" });
