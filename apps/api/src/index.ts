import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth, type Auth } from "./lib/auth.js";
import { levelsRoutes } from "./routes/levels.js";
import { studentsRoutes } from "./routes/students.js";
import { gradesRoutes } from "./routes/grades.js";
import { absencesRoutes } from "./routes/absences.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { eventsRoutes } from "./routes/events.js";
import { paymentsRoutes } from "./routes/payments.js";
import { expensesRoutes } from "./routes/expenses.js";
import { invoicesRoutes } from "./routes/invoices.js";
import { staffRoutes } from "./routes/staff.js";
import { travelRoutes } from "./routes/travel.js";
import { NotificationHub } from "./do.js";
import type { AppEvent } from "@verger/shared";

export { NotificationHub };

interface Bindings {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_API_KEY?: string;
  NOTIFICATION_HUB: DurableObjectNamespace;
}

interface Variables {
  auth: Auth;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Rate limiting basique en mémoire (POST/DELETE → 100/min par IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

app.use("*", async (c, next) => {
  const method = c.req.method;
  if (method === "POST" || method === "DELETE") {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (entry && now < entry.resetAt) {
      entry.count += 1;
      if (entry.count > 100) {
        return c.json({ error: "Trop de requêtes, réessayez dans 1 minute" }, 429);
      }
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    }
  }
  await next();
});

// Headers de sécurité
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  await next();
});

// CORS
app.use("/api/*", cors({ origin: ["http://localhost:3000"], credentials: true }));

app.use("*", async (c, next) => {
  const auth = createAuth({
    DATABASE_URL: c.env.DATABASE_URL,
    BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
    BETTER_AUTH_API_KEY: c.env.BETTER_AUTH_API_KEY,
  });
  c.set("auth", auth);
  await next();
});

// Routes Better Auth
app.on(["POST", "GET"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

// Routes métier
app.route("/api", levelsRoutes);
app.route("/api", studentsRoutes);
app.route("/api", gradesRoutes);
app.route("/api", absencesRoutes);
app.route("/api", whatsappRoutes);
app.route("/api", eventsRoutes);
app.route("/api", invoicesRoutes);
app.route("/api", paymentsRoutes);
app.route("/api", expensesRoutes);
app.route("/api", staffRoutes);
app.route("/api", travelRoutes);

app.get("/", (c) =>
  c.json({
    name: "Le Verger API",
    version: "0.2.0",
    status: "ok",
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

// WebSocket notifications (Durable Object)
app.get("/api/ws/notifications", (c) => {
  const id = c.env.NOTIFICATION_HUB.idFromName("global");
  const stub = c.env.NOTIFICATION_HUB.get(id);
  const url = new URL(c.req.url);
  url.pathname = "/ws";
  const req = new Request(url.toString(), { headers: c.req.raw.headers });
  return stub.fetch(req) as unknown as Response;
});

// Broadcast events
app.post("/api/broadcast", async (c) => {
  const body = await c.req.json<AppEvent>();
  if (!body.type || !body.message) {
    return c.json({ error: "type et message requis" }, 400);
  }
  const event: AppEvent = {
    type: body.type,
    message: body.message,
    timestamp: new Date().toISOString(),
    data: body.data,
  };
  const id = c.env.NOTIFICATION_HUB.idFromName("global");
  const stub = c.env.NOTIFICATION_HUB.get(id);
  const url = new URL(c.req.url);
  url.pathname = "/ws";
  const req = new Request(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const res = await stub.fetch(req);
  const data = await res.json();
  return c.json(data);
});

export default app;
