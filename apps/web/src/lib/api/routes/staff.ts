import { Hono } from "hono";
import { eq, desc, sql, like, or, and } from "drizzle-orm";
import { createDb } from "../lib/db";
import { staff, staffRoleEnum } from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

type StaffRole = typeof staffRoleEnum.enumValues[number];

export const staffRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


// ------------------------------------------------------------------
// GET /api/staff → liste filtrée
// ------------------------------------------------------------------
staffRoutes.get("/staff", async (c) => {
  const auth = await requirePerm(c, "staff:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const role = url.searchParams.get("role");
  const search = url.searchParams.get("search");
  const activeOnly = url.searchParams.get("activeOnly") === "true";

  const whereConditions = [];
  if (activeOnly) whereConditions.push(eq(staff.isActive, true));
  if (role) whereConditions.push(eq(staff.role, role as StaffRole));
  if (search) {
    whereConditions.push(
      or(
        like(staff.name, `%${search}%`),
        like(staff.email, `%${search}%`)
      )!
    );
  }

  const result = await db.query.staff.findMany({
    where: whereConditions.length ? and(...whereConditions) : undefined,
    orderBy: [desc(staff.createdAt)],
  });

  return c.json({ data: result, total: result.length });
});

// ------------------------------------------------------------------
// POST /api/staff → créer un membre du personnel
// ------------------------------------------------------------------
staffRoutes.post("/staff", async (c) => {
  const auth = await requirePerm(c, "staff:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.role || !body?.hireDate) {
    return c.json({ error: "Nom, rôle et date d'embauche sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(staff)
    .values({
      id: crypto.randomUUID(),
      name: String(body.name),
      role: String(body.role) as StaffRole,
      subject: body.subject ? String(body.subject) : null,
      phone: body.phone ? String(body.phone) : null,
      email: body.email ? String(body.email) : null,
      salary: body.salary ? String(body.salary) : null,
      hireDate: String(body.hireDate),
      address: body.address ? String(body.address) : null,
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/staff/:id → modifier
// ------------------------------------------------------------------
staffRoutes.patch("/staff/:id", async (c) => {
  const auth = await requirePerm(c, "staff:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(staff)
    .set({
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.role ? { role: String(body.role) as StaffRole } : {}),
      ...(body.subject !== undefined ? { subject: body.subject ? String(body.subject) : null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ? String(body.phone) : null } : {}),
      ...(body.email !== undefined ? { email: body.email ? String(body.email) : null } : {}),
      ...(body.salary !== undefined ? { salary: body.salary ? String(body.salary) : null } : {}),
      ...(body.hireDate ? { hireDate: String(body.hireDate) } : {}),
      ...(body.address !== undefined ? { address: body.address ? String(body.address) : null } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    })
    .where(eq(staff.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Membre introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/staff/:id → désactiver (soft delete)
// ------------------------------------------------------------------
staffRoutes.delete("/staff/:id", async (c) => {
  const auth = await requirePerm(c, "staff:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const updated = await db
    .update(staff)
    .set({ isActive: false })
    .where(eq(staff.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Membre introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// GET /api/staff/stats → stats par rôle, masse salariale totale
// ------------------------------------------------------------------
staffRoutes.get("/staff/stats", async (c) => {
  const auth = await requirePerm(c, "staff:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);

  // Stats par rôle (actifs uniquement)
  const byRole = await db
    .select({
      role: staff.role,
      count: sql<number>`count(*)`,
      totalSalary: sql<number>`coalesce(sum(${staff.salary}::numeric), 0)`,
    })
    .from(staff)
    .where(eq(staff.isActive, true))
    .groupBy(staff.role);

  // Masse salariale totale
  const [totalResult] = await db
    .select({ total: sql<number>`coalesce(sum(${staff.salary}::numeric), 0)` })
    .from(staff)
    .where(eq(staff.isActive, true));

  // Total membres
  const [countResult] = await db
    .select({ total: sql<number>`count(*)` })
    .from(staff)
    .where(eq(staff.isActive, true));

  return c.json({
    byRole,
    totalSalary: Number(totalResult?.total ?? 0),
    totalActive: Number(countResult?.total ?? 0),
  });
});
