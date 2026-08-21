import { Hono } from "hono";
import { eq, desc, sql, like, or, and } from "drizzle-orm";
import { createDb } from "../lib/db";
import { students, classes, levels, parents } from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

export const studentsRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function generateMatricule(db: ReturnType<typeof createDb>, schoolYear: string): Promise<string> {
  const year = schoolYear.split("-")[0];
  const [result] = await db
    .select({ max: sql<number>`max(substring(matricule from 'ELE-${year}-(\\d+)$')::int)` })
    .from(students);
  const next = (result?.max ?? 0) + 1;
  return `ELE-${year}-${String(next).padStart(3, "0")}`;
}

// ------------------------------------------------------------------
// GET /api/students → liste paginée avec filtres
// ------------------------------------------------------------------
studentsRoutes.get("/students", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const classId = url.searchParams.get("classId");
  const search = url.searchParams.get("search");

  const whereConditions = [eq(students.isActive, true)];
  if (classId) whereConditions.push(eq(students.classId, classId));
  if (search) {
    whereConditions.push(
      or(
        like(students.firstName, `%${search}%`),
        like(students.lastName, `%${search}%`),
        like(students.matricule, `%${search}%`)
      )!
    );
  }

  const [totalResult] = await db
    .select({ total: sql<number>`count(*)` })
    .from(students)
    .where(and(...whereConditions));

  const result = await db.query.students.findMany({
    where: and(...whereConditions),
    orderBy: [desc(students.createdAt)],
    limit,
    offset,
    with: {
      class: true,
      parent: true,
    },
  });

  return c.json({
    data: result,
    total: Number(totalResult?.total ?? 0),
    limit,
    offset,
  });
});

// ------------------------------------------------------------------
// POST /api/students → créer un élève
// ------------------------------------------------------------------
studentsRoutes.post("/students", async (c) => {
  const auth = await requirePerm(c, "students:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.firstName || !body?.lastName || !body?.dateOfBirth || !body?.gender || !body?.classId || !body?.parentId) {
    return c.json({ error: "Prénom, nom, date de naissance, genre, classe et parent sont requis" }, 400);
  }

  const db = createDb(c.env);
  const schoolYear = body.schoolYear ?? currentSchoolYear();
  const matricule = await generateMatricule(db, schoolYear);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(matricule)}`;

  const created = await db
    .insert(students)
    .values({
      id: crypto.randomUUID(),
      matricule,
      firstName: String(body.firstName),
      lastName: String(body.lastName),
      dateOfBirth: String(body.dateOfBirth),
      gender: body.gender,
      classId: String(body.classId),
      parentId: String(body.parentId),
      qrCodeUrl,
      schoolYear,
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// GET /api/students/count → total
// ------------------------------------------------------------------
studentsRoutes.get("/students/count", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const [result] = await db.select({ total: sql<number>`count(*)` }).from(students).where(eq(students.isActive, true));
  return c.json({ total: Number(result?.total ?? 0) });
});

// ------------------------------------------------------------------
// GET /api/students/by-level → groupé par niveau
// ------------------------------------------------------------------
studentsRoutes.get("/students/by-level", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const result = await db
    .select({
      levelName: levels.name,
      levelOrder: levels.order,
      count: sql<number>`count(${students.id})`,
    })
    .from(classes)
    .leftJoin(students, and(eq(students.classId, classes.id), eq(students.isActive, true)))
    .leftJoin(levels, eq(classes.levelId, levels.id))
    .groupBy(levels.name, levels.order)
    .orderBy(levels.order);

  return c.json(result);
});

// ------------------------------------------------------------------
// GET /api/students/by-gender → répartition par genre
// ------------------------------------------------------------------
studentsRoutes.get("/students/by-gender", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const result = await db
    .select({
      gender: students.gender,
      count: sql<number>`count(*)`,
    })
    .from(students)
    .where(eq(students.isActive, true))
    .groupBy(students.gender);

  return c.json(result);
});

// ------------------------------------------------------------------
// GET /api/students/recent → 5 derniers inscrits
// ------------------------------------------------------------------
studentsRoutes.get("/students/recent", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const result = await db.query.students.findMany({
    where: eq(students.isActive, true),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
    limit: 5,
    with: {
      class: true,
    },
  });

  return c.json(result);
});

// ------------------------------------------------------------------
// GET /api/students/:id → fiche détaillée
// ------------------------------------------------------------------
studentsRoutes.get("/students/:id", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const student = await db.query.students.findFirst({
    where: eq(students.id, c.req.param("id")),
    with: {
      class: {
        with: {
          level: true,
        },
      },
      parent: true,
    },
  });

  if (!student) return c.json({ error: "Élève introuvable" }, 404);
  return c.json(student);
});

// ------------------------------------------------------------------
// PATCH /api/students/:id → modifier
// ------------------------------------------------------------------
studentsRoutes.patch("/students/:id", async (c) => {
  const auth = await requirePerm(c, "students:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(students)
    .set({
      ...(body.firstName ? { firstName: String(body.firstName) } : {}),
      ...(body.lastName ? { lastName: String(body.lastName) } : {}),
      ...(body.dateOfBirth ? { dateOfBirth: String(body.dateOfBirth) } : {}),
      ...(body.gender ? { gender: body.gender } : {}),
      ...(body.classId ? { classId: String(body.classId) } : {}),
      ...(body.parentId ? { parentId: String(body.parentId) } : {}),
      ...(body.schoolYear ? { schoolYear: String(body.schoolYear) } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    })
    .where(eq(students.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Élève introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/students/:id → désactiver (soft delete)
// ------------------------------------------------------------------
studentsRoutes.delete("/students/:id", async (c) => {
  const auth = await requirePerm(c, "students:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const updated = await db
    .update(students)
    .set({ isActive: false })
    .where(eq(students.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Élève introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// Parents API (inline — liste + création)
// ------------------------------------------------------------------

// GET /api/parents → liste
studentsRoutes.get("/parents", async (c) => {
  const auth = await requirePerm(c, "students:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const result = await db.query.parents.findMany({
    orderBy: (p, { asc }) => [asc(p.name)],
  });
  return c.json(result);
});

// POST /api/parents → créer un parent
studentsRoutes.post("/parents", async (c) => {
  const auth = await requirePerm(c, "students:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.phone) {
    return c.json({ error: "Nom et téléphone sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(parents)
    .values({
      id: crypto.randomUUID(),
      name: String(body.name),
      phone: String(body.phone),
      email: body.email ? String(body.email) : null,
      address: body.address ? String(body.address) : null,
    })
    .returning();

  return c.json(created[0], 201);
});
