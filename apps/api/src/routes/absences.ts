import { Hono } from "hono";
import { eq, desc, and, like, sql } from "drizzle-orm";
import { createDb } from "../lib/db.js";
import { absences, students, classes, parents } from "@verger/shared/src/schema.js";
import { requirePerm } from "../lib/permissions.js";

export const absencesRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


// ------------------------------------------------------------------
// GET /api/absences → liste filtrée
// ------------------------------------------------------------------
absencesRoutes.get("/absences", async (c) => {
  const auth = await requirePerm(c, "absences:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const classId = url.searchParams.get("classId");
  const date = url.searchParams.get("date");
  const justified = url.searchParams.get("justified");

  const whereConditions = [];
  if (studentId) whereConditions.push(eq(absences.studentId, studentId));
  if (date) whereConditions.push(eq(absences.date, date));
  if (justified !== null && justified !== "") {
    whereConditions.push(eq(absences.justified, justified === "true"));
  }

  // Si classId, il faut rejoindre les élèves
  let result: any[];
  if (classId) {
    const classStudents = await db.query.students.findMany({
      where: eq(students.classId, classId),
    });
    const studentIds = classStudents.map((s) => s.id);
    if (studentIds.length === 0) {
      return c.json({ data: [], total: 0 });
    }
    whereConditions.push(sql`${absences.studentId} = ANY(${studentIds})`);
  }

  result = await db.query.absences.findMany({
    where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
    orderBy: [desc(absences.date), desc(absences.createdAt)],
    with: {
      student: {
        with: {
          class: true,
          parent: true,
        },
      },
    },
  });

  return c.json({ data: result, total: result.length });
});

// ------------------------------------------------------------------
// POST /api/absences → créer une ou plusieurs absences (batch)
// ------------------------------------------------------------------
absencesRoutes.post("/absences", async (c) => {
  const auth = await requirePerm(c, "absences:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const records = Array.isArray(body) ? body : [body];

  const validRecords = records.filter(
    (r: any) => r.studentId && r.date
  );

  if (validRecords.length === 0) {
    return c.json({ error: "studentId et date sont requis pour chaque absence" }, 400);
  }

  const values = validRecords.map((r: any) => ({
    id: crypto.randomUUID(),
    studentId: String(r.studentId),
    date: String(r.date),
    reason: r.reason ? String(r.reason) : null,
    justified: Boolean(r.justified ?? false),
    notified: false,
  }));

  const created = await db.insert(absences).values(values).returning();
  return c.json(created, 201);
});

// ------------------------------------------------------------------
// PATCH /api/absences/:id → justifier/modifier
// ------------------------------------------------------------------
absencesRoutes.patch("/absences/:id", async (c) => {
  const auth = await requirePerm(c, "absences:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(absences)
    .set({
      ...(body.justified !== undefined ? { justified: Boolean(body.justified) } : {}),
      ...(body.reason !== undefined ? { reason: body.reason ? String(body.reason) : null } : {}),
      ...(body.notified !== undefined ? { notified: Boolean(body.notified) } : {}),
    })
    .where(eq(absences.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Absence introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/absences/:id → supprimer
// ------------------------------------------------------------------
absencesRoutes.delete("/absences/:id", async (c) => {
  const auth = await requirePerm(c, "absences:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const deleted = await db
    .delete(absences)
    .where(eq(absences.id, c.req.param("id")))
    .returning();

  if (!deleted.length) return c.json({ error: "Absence introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// GET /api/absences/stats → stats par classe/mois
// ------------------------------------------------------------------
absencesRoutes.get("/absences/stats", async (c) => {
  const auth = await requirePerm(c, "absences:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const classId = url.searchParams.get("classId");
  const month = url.searchParams.get("month"); // format YYYY-MM

  // Récupérer les IDs d'élèves de la classe
  let studentIds: string[] | null = null;
  if (classId) {
    const classStudents = await db.query.students.findMany({
      where: eq(students.classId, classId),
    });
    studentIds = classStudents.map((s) => s.id);
  }

  // Construire la clause where
  const whereConditions = [];
  if (studentIds && studentIds.length > 0) {
    whereConditions.push(sql`${absences.studentId} = ANY(${studentIds})`);
  }
  if (month) {
    whereConditions.push(sql`to_char(${absences.date}, 'YYYY-MM') = ${month}`);
  }

  // Total
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(absences)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

  // Justifiées
  const justifiedConditions = [...whereConditions, eq(absences.justified, true)];
  const [justifiedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(absences)
    .where(and(...justifiedConditions));

  // Non justifiées
  const unjustifiedConditions = [...whereConditions, eq(absences.justified, false)];
  const [unjustifiedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(absences)
    .where(and(...unjustifiedConditions));

  // Notifiées
  const notifiedConditions = [...whereConditions, eq(absences.notified, true)];
  const [notifiedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(absences)
    .where(and(...notifiedConditions));

  return c.json({
    total: Number(totalResult?.count ?? 0),
    justified: Number(justifiedResult?.count ?? 0),
    unjustified: Number(unjustifiedResult?.count ?? 0),
    notified: Number(notifiedResult?.count ?? 0),
  });
});

// ------------------------------------------------------------------
// POST /api/absences/notify → simulation WhatsApp
// ------------------------------------------------------------------
absencesRoutes.post("/absences/notify", async (c) => {
  const auth = await requirePerm(c, "absences:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.absenceIds || !Array.isArray(body.absenceIds)) {
    return c.json({ error: "absenceIds (array) requis" }, 400);
  }

  const db = createDb(c.env);

  // Récupérer les absences avec infos élèves/parents
  const absencesList = await db.query.absences.findMany({
    where: sql`${absences.id} = ANY(${body.absenceIds})`,
    with: {
      student: {
        with: {
          parent: true,
        },
      },
    },
  });

  const details: Array<{
    absenceId: string;
    studentName: string;
    parentPhone: string;
    success: boolean;
  }> = [];

  let sent = 0;
  let failed = 0;

  for (const absence of absencesList) {
    const success = Math.random() < 0.9;
    const studentName = `${absence.student.firstName} ${absence.student.lastName}`;
    const parentPhone = absence.student.parent?.phone ?? "N/A";

    details.push({
      absenceId: absence.id,
      studentName,
      parentPhone,
      success,
    });

    if (success) {
      sent++;
      await db
        .update(absences)
        .set({ notified: true })
        .where(eq(absences.id, absence.id));
    } else {
      failed++;
    }
  }

  return c.json({ sent, failed, details, total: body.absenceIds.length });
});
