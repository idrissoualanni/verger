import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { createDb } from "../lib/db";
import { travelAgencies, applications } from "@verger/shared/src/schema";

export const travelRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();

async function requireProprietaireOrAgent(c: { var: { auth: any }; req: { raw: Request } }): Promise<any> {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  if (session.user.role !== "PROPRIETAIRE" && session.user.role !== "AGENT") return null;
  return session.user;
}

// ------------------------------------------------------------------
// GET /api/travel/agencies → liste des agences
// ------------------------------------------------------------------
travelRoutes.get("/travel/agencies", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const isActive = c.req.query("isActive");

  const where = isActive !== undefined ? eq(travelAgencies.isActive, isActive === "true") : undefined;

  const result = await db.query.travelAgencies.findMany({
    where,
    orderBy: [desc(travelAgencies.createdAt)],
  });

  return c.json(result);
});

// ------------------------------------------------------------------
// POST /api/travel/agencies → créer une agence
// ------------------------------------------------------------------
travelRoutes.post("/travel/agencies", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.phone) {
    return c.json({ error: "Nom et téléphone sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(travelAgencies)
    .values({
      id: crypto.randomUUID(),
      name: String(body.name),
      contactName: body.contactName ? String(body.contactName) : null,
      phone: String(body.phone),
      email: body.email ? String(body.email) : null,
      address: body.address ? String(body.address) : null,
      services: body.services ? String(body.services) : null,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/travel/agencies/:id → modifier une agence
// ------------------------------------------------------------------
travelRoutes.patch("/travel/agencies/:id", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(travelAgencies)
    .set({
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName ? String(body.contactName) : null } : {}),
      ...(body.phone !== undefined ? { phone: String(body.phone) } : {}),
      ...(body.email !== undefined ? { email: body.email ? String(body.email) : null } : {}),
      ...(body.address !== undefined ? { address: body.address ? String(body.address) : null } : {}),
      ...(body.services !== undefined ? { services: body.services ? String(body.services) : null } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    })
    .where(eq(travelAgencies.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Agence introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// GET /api/travel/applications → candidatures avec filtres
// ------------------------------------------------------------------
travelRoutes.get("/travel/applications", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const studentId = c.req.query("studentId");
  const agencyId = c.req.query("agencyId");
  const status = c.req.query("status") as "EN_ATTENTE" | "EN_COURS" | "ACCEPTE" | "REFUSE" | undefined;

  const whereConditions = [];
  if (studentId) whereConditions.push(eq(applications.studentId, studentId));
  if (agencyId) whereConditions.push(eq(applications.agencyId, agencyId));
  if (status) whereConditions.push(eq(applications.status, status));

  const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const result = await db.query.applications.findMany({
    where,
    orderBy: [desc(applications.createdAt)],
    with: {
      student: true,
      agency: true,
    },
  });

  return c.json({ data: result, total: result.length });
});

// ------------------------------------------------------------------
// POST /api/travel/applications → créer une candidature
// ------------------------------------------------------------------
travelRoutes.post("/travel/applications", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.studentId || !body?.agencyId) {
    return c.json({ error: "studentId et agencyId sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(applications)
    .values({
      id: crypto.randomUUID(),
      studentId: String(body.studentId),
      agencyId: String(body.agencyId),
      status: body.status ?? "EN_ATTENTE",
      notes: body.notes ? String(body.notes) : null,
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/travel/applications/:id → modifier le statut
// ------------------------------------------------------------------
travelRoutes.patch("/travel/applications/:id", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const setFields: Record<string, unknown> = {};
  if (body.status !== undefined) setFields.status = body.status;
  if (body.notes !== undefined) setFields.notes = body.notes ? String(body.notes) : null;

  if (Object.keys(setFields).length === 0) {
    return c.json({ error: "Aucun champ à modifier" }, 400);
  }

  const updated = await db
    .update(applications)
    .set(setFields)
    .where(eq(applications.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Candidature introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// GET /api/travel/stats → statistiques candidatures
// ------------------------------------------------------------------
travelRoutes.get("/travel/stats", async (c) => {
  if (!(await requireProprietaireOrAgent(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const agencyId = c.req.query("agencyId");

  const whereCondition = agencyId ? eq(applications.agencyId, agencyId) : undefined;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(whereCondition);

  const [enAttenteResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(and(whereCondition, eq(applications.status, "EN_ATTENTE")));

  const [enCoursResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(and(whereCondition, eq(applications.status, "EN_COURS")));

  const [accepteResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(and(whereCondition, eq(applications.status, "ACCEPTE")));

  const [refuseResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(applications)
    .where(and(whereCondition, eq(applications.status, "REFUSE")));

  const total = Number(totalResult?.count ?? 0);
  const accepte = Number(accepteResult?.count ?? 0);
  const refuse = Number(refuseResult?.count ?? 0);

  return c.json({
    total,
    enAttente: Number(enAttenteResult?.count ?? 0),
    enCours: Number(enCoursResult?.count ?? 0),
    accepte,
    refuse,
    tauxAcceptation: total > 0 ? Math.round((accepte / total) * 100) : 0,
  });
});
