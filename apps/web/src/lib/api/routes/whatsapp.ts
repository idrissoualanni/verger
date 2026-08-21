import { Hono } from "hono";
import { eq, desc, and, like, sql, count } from "drizzle-orm";
import { createDb } from "../lib/db";
import {
  whatsappMessages,
  students,
  parents,
} from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

export const whatsappRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


function simulateSend(): { success: boolean; errorMessage?: string } {
  if (Math.random() < 0.9) {
    return { success: true };
  }
  const errors = [
    "Numéro invalide",
    "Service indisponible temporairement",
    "Délai d'envoi expiré",
    "Destinataire non joignable",
  ];
  return { success: false, errorMessage: errors[Math.floor(Math.random() * errors.length)] };
}

// ------------------------------------------------------------------
// POST /api/whatsapp/send → envoyer un message
// ------------------------------------------------------------------
whatsappRoutes.post("/whatsapp/send", async (c) => {
  const auth = await requirePerm(c, "whatsapp:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.phoneNumber || !body?.message) {
    return c.json({ error: "phoneNumber et message requis" }, 400);
  }

  const db = createDb(c.env);
  const simulation = simulateSend();

  const record = await db
    .insert(whatsappMessages)
    .values({
      id: crypto.randomUUID(),
      type: "INDIVIDUEL",
      studentId: body.studentId ?? null,
      parentId: body.parentId ?? null,
      recipientName: body.recipientName ?? null,
      recipientPhone: String(body.phoneNumber),
      message: String(body.message),
      status: simulation.success ? "ENVOYE" : "ECHOUE",
      errorMessage: simulation.errorMessage ?? null,
    })
    .returning();

  return c.json(record[0], simulation.success ? 201 : 200);
});

// ------------------------------------------------------------------
// POST /api/whatsapp/send-bulk → envoi à plusieurs numéros
// ------------------------------------------------------------------
whatsappRoutes.post("/whatsapp/send-bulk", async (c) => {
  const auth = await requirePerm(c, "whatsapp:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.messages || !Array.isArray(body.messages)) {
    return c.json({ error: "messages (array) requis" }, 400);
  }

  const db = createDb(c.env);
  const results: Array<{ phoneNumber: string; success: boolean; errorMessage?: string }> = [];

  for (const msg of body.messages) {
    if (!msg.phoneNumber || !msg.message) continue;

    const simulation = simulateSend();
    await db.insert(whatsappMessages).values({
      id: crypto.randomUUID(),
      type: body.type ?? "MASSE",
      studentId: msg.studentId ?? null,
      parentId: msg.parentId ?? null,
      recipientName: msg.recipientName ?? null,
      recipientPhone: String(msg.phoneNumber),
      message: String(msg.message),
      status: simulation.success ? "ENVOYE" : "ECHOUE",
      errorMessage: simulation.errorMessage ?? null,
    });

    results.push({
      phoneNumber: msg.phoneNumber,
      success: simulation.success,
      errorMessage: simulation.errorMessage,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.length - sent;

  return c.json({ sent, failed, total: results.length, results }, 201);
});

// ------------------------------------------------------------------
// GET /api/whatsapp/history → historique
// ------------------------------------------------------------------
whatsappRoutes.get("/whatsapp/history", async (c) => {
  const auth = await requirePerm(c, "whatsapp:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const parentId = url.searchParams.get("parentId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const whereConditions = [];
  if (studentId) whereConditions.push(eq(whatsappMessages.studentId, studentId));
  if (parentId) whereConditions.push(eq(whatsappMessages.parentId, parentId));
  if (status) whereConditions.push(eq(whatsappMessages.status, status as any));

  const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(whatsappMessages)
    .where(where);

  const data = await db.query.whatsappMessages.findMany({
    where,
    orderBy: [desc(whatsappMessages.sentAt)],
    limit,
    offset,
    with: {
      student: true,
      parent: true,
    },
  });

  return c.json({
    data,
    total: Number(totalResult?.count ?? 0),
    limit,
    offset,
  });
});

// ------------------------------------------------------------------
// GET /api/whatsapp/stats → statistiques
// ------------------------------------------------------------------
whatsappRoutes.get("/whatsapp/stats", async (c) => {
  const auth = await requirePerm(c, "whatsapp:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const period = url.searchParams.get("period") ?? "week";

  let dateFilter: any;
  const now = new Date();
  if (period === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    dateFilter = sql`${whatsappMessages.sentAt} >= ${start.toISOString()}`;
  } else if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    dateFilter = sql`${whatsappMessages.sentAt} >= ${start.toISOString()}`;
  } else {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    dateFilter = sql`${whatsappMessages.sentAt} >= ${start.toISOString()}`;
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(whatsappMessages)
    .where(dateFilter);

  const [sentResult] = await db
    .select({ count: count() })
    .from(whatsappMessages)
    .where(and(dateFilter, eq(whatsappMessages.status, "ENVOYE")));

  const [failedResult] = await db
    .select({ count: count() })
    .from(whatsappMessages)
    .where(and(dateFilter, eq(whatsappMessages.status, "ECHOUE")));

  const total = Number(totalResult?.count ?? 0);
  const sent = Number(sentResult?.count ?? 0);
  const failed = Number(failedResult?.count ?? 0);

  return c.json({
    total,
    sent,
    failed,
    successRate: total > 0 ? Math.round((sent / total) * 100) : 0,
    period,
  });
});
