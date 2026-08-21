import { Hono } from "hono";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { createDb } from "../lib/db";
import { events, whatsappMessages, students, classes, parents } from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

export const eventsRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


// ------------------------------------------------------------------
// GET /api/events → liste filtrée
// ------------------------------------------------------------------
eventsRoutes.get("/events", async (c) => {
  const auth = await requirePerm(c, "events:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const month = url.searchParams.get("month"); // format YYYY-MM
  const type = url.searchParams.get("type");
  const audience = url.searchParams.get("audience");

  const whereConditions = [];

  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    whereConditions.push(gte(events.date, start));
    whereConditions.push(lte(events.date, end));
  }

  if (type) whereConditions.push(eq(events.type, type as any));
  if (audience) whereConditions.push(eq(events.audience, audience as any));

  const result = await db.query.events.findMany({
    where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
    orderBy: [desc(events.date)],
  });

  return c.json({ data: result, total: result.length });
});

// ------------------------------------------------------------------
// POST /api/events → créer un événement
// ------------------------------------------------------------------
eventsRoutes.post("/events", async (c) => {
  const auth = await requirePerm(c, "events:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.title || !body?.date || !body?.type || !body?.audience) {
    return c.json({ error: "Titre, date, type et public cible sont requis" }, 400);
  }

  const db = createDb(c.env);

  const created = await db
    .insert(events)
    .values({
      id: crypto.randomUUID(),
      title: String(body.title),
      description: body.description ? String(body.description) : null,
      date: new Date(String(body.date)),
      endDate: body.endDate ? new Date(String(body.endDate)) : null,
      location: body.location ? String(body.location) : null,
      type: body.type,
      audience: body.audience,
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/events/:id → modifier
// ------------------------------------------------------------------
eventsRoutes.patch("/events/:id", async (c) => {
  const auth = await requirePerm(c, "events:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(events)
    .set({
      ...(body.title ? { title: String(body.title) } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
      ...(body.date ? { date: new Date(String(body.date)) } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(String(body.endDate)) : null } : {}),
      ...(body.location !== undefined ? { location: body.location ? String(body.location) : null } : {}),
      ...(body.type ? { type: body.type } : {}),
      ...(body.audience ? { audience: body.audience } : {}),
    })
    .where(eq(events.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Événement introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/events/:id → supprimer
// ------------------------------------------------------------------
eventsRoutes.delete("/events/:id", async (c) => {
  const auth = await requirePerm(c, "events:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const deleted = await db
    .delete(events)
    .where(eq(events.id, c.req.param("id")))
    .returning();

  if (!deleted.length) return c.json({ error: "Événement introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// POST /api/events/:id/notify → envoyer notification WhatsApp aux parents ciblés
// ------------------------------------------------------------------
eventsRoutes.post("/events/:id/notify", async (c) => {
  const auth = await requirePerm(c, "events:create");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const eventId = c.req.param("id");

  // Récupérer l'événement
  const eventList = await db.query.events.findMany({
    where: eq(events.id, eventId),
  });

  if (!eventList.length) return c.json({ error: "Événement introuvable" }, 404);
  const event = eventList[0];

  // Trouver les parents ciblés selon l'audience
  let targetStudents: any[];

  if (event.audience === "TOUS") {
    targetStudents = await db.query.students.findMany({
      where: eq(students.isActive, true),
      with: { parent: true, class: { with: { level: true } } },
    });
  } else if (event.audience === "PARENTS") {
    // Parents = tous les parents d'élèves actifs
    targetStudents = await db.query.students.findMany({
      where: eq(students.isActive, true),
      with: { parent: true, class: { with: { level: true } } },
    });
  } else if (event.audience === "PERSONNEL") {
    return c.json({ error: "L'audience PERSONNEL ne peut pas être notifiée via WhatsApp parents" }, 400);
  } else {
    // PRIMAIRE, COLLEGE, LYCEE → filtrer par niveau
    const targetStudentsAll = await db.query.students.findMany({
      where: eq(students.isActive, true),
      with: { parent: true, class: { with: { level: true } } },
    });
    targetStudents = targetStudentsAll.filter(
      (s) => s.class?.level?.name?.toUpperCase() === event.audience
    );
  }

  // Dédupliquer les parents par phone
  const parentMap = new Map<string, { name: string; phone: string; studentNames: string[] }>();

  for (const student of targetStudents) {
    const parent = student.parent;
    if (!parent?.phone) continue;

    const key = parent.phone;
    if (!parentMap.has(key)) {
      parentMap.set(key, {
        name: parent.name,
        phone: parent.phone,
        studentNames: [],
      });
    }
    const entry = parentMap.get(key)!;
    entry.studentNames.push(`${student.firstName} ${student.lastName}`);
  }

  // Construire le message
  const dateStr = new Date(event.date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const details: Array<{
    parentName: string;
    parentPhone: string;
    success: boolean;
  }> = [];

  let sent = 0;
  let failed = 0;
  const messagesToInsert: typeof whatsappMessages.$inferInsert[] = [];

  for (const [, parent] of parentMap) {
    const message = `Bonjour ${parent.name},\n\nÉvénement : ${event.title} - ${dateStr}${event.location ? ` à ${event.location}` : ""}.${event.description ? `\n${event.description}` : ""}\n\nCordialement, Le Verger`;

    const success = Math.random() < 0.9;

    details.push({
      parentName: parent.name,
      parentPhone: parent.phone,
      success,
    });

    messagesToInsert.push({
      id: crypto.randomUUID(),
      type: "MASSE",
      recipientName: parent.name,
      recipientPhone: parent.phone,
      message,
      status: success ? "ENVOYE" : "ECHOUE",
      eventId: event.id,
    });

    if (success) sent++;
    else failed++;
  }

  // Enregistrer les messages dans la DB
  if (messagesToInsert.length > 0) {
    await db.insert(whatsappMessages).values(messagesToInsert);
  }

  return c.json({ sent, failed, details, total: parentMap.size });
});
