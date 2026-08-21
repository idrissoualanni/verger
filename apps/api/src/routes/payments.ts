/**
 * @verger/api — Routes paiements
 *
 * GET    /api/payments              → liste filtrée
 * POST   /api/payments              → créer un paiement
 * PATCH  /api/payments/:id          → modifier statut
 * GET    /api/payments/stats        → stats agrégées
 * GET    /api/payments/unpaid       → élèves sans paiement pour un mois
 */

import { Hono } from "hono";
import { eq, desc, and, notInArray, sql, inArray } from "drizzle-orm";
import { createDb } from "../lib/db.js";
import {
  payments,
  students,
  classes,
  levels,
  parents,
  user,
} from "@verger/shared/src/schema.js";
import { requirePerm } from "../lib/permissions.js";

export const paymentsRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatAmount(n: number | string): string {
  return new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) : n);
}

const methodLabels: Record<string, string> = {
  ESPECES: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  VIREMENT: "Virement",
};

/* ------------------------------------------------------------------ */
/* GET /api/payments → liste filtrée                                    */
/* ------------------------------------------------------------------ */
paymentsRoutes.get("/payments", async (c) => {
  const auth = await requirePerm(c, "payments:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const classId = url.searchParams.get("classId");
  const status = url.searchParams.get("status");
  const month = url.searchParams.get("month");
  const method = url.searchParams.get("method");

  const whereConditions = [];

  if (studentId) whereConditions.push(eq(payments.studentId, studentId));
  if (status) whereConditions.push(eq(payments.status, status as any));
  if (month) whereConditions.push(eq(payments.month, month));
  if (method) whereConditions.push(eq(payments.method, method as any));

  // Si on filtre par classe, on doit joindre students
  if (classId) {
    const studentIds = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.classId, classId));
    if (studentIds.length > 0) {
      whereConditions.push(
        inArray(
          payments.studentId,
          studentIds.map((s) => s.id)
        )
      );
    } else {
      return c.json({ data: [], total: 0 });
    }
  }

  const result = await db.query.payments.findMany({
    where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
    orderBy: [desc(payments.createdAt)],
    with: {
      student: {
        with: {
          class: {
            with: {
              level: true,
            },
          },
          parent: true,
        },
      },
    },
  });

  return c.json({ data: result, total: result.length });
});

/* ------------------------------------------------------------------ */
/* POST /api/payments → créer un paiement                               */
/* ------------------------------------------------------------------ */
paymentsRoutes.post("/payments", async (c) => {
  const auth = await requirePerm(c, "payments:create");
  if ("res" in auth) return auth.res;
  const { user: authUser } = auth;

  const body = await c.req.json().catch(() => null);
  if (!body?.studentId || !body?.amount || !body?.method || !body?.month) {
    return c.json(
      { error: "Élève, montant, méthode et mois sont requis" },
      400
    );
  }

  const db = createDb(c.env);

  // Vérifier que l'élève existe
  const student = await db.query.students.findFirst({
    where: eq(students.id, body.studentId),
  });
  if (!student) return c.json({ error: "Élève introuvable" }, 404);

  const created = await db
    .insert(payments)
    .values({
      id: crypto.randomUUID(),
      studentId: String(body.studentId),
      amount: String(body.amount),
      method: body.method,
      status: body.status ?? "EN_ATTENTE",
      month: String(body.month),
      reference: body.reference ? String(body.reference) : null,
      secretaryId: authUser.id,
      notes: body.notes ? String(body.notes) : null,
    })
    .returning();

  // Broadcast notification temps réel au propriétaire
  try {
    const baseUrl = new URL(c.req.url).origin;
    await fetch(`${baseUrl}/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "PAIEMENT",
        message: `${student.firstName} ${student.lastName} — ${formatAmount(body.amount)} FCFA (${methodLabels[body.method]})`,
        timestamp: new Date().toISOString(),
        data: {
          paymentId: created[0].id,
          studentId: student.id,
          amount: body.amount,
          month: body.month,
          status: created[0].status,
        },
      }),
    });
  } catch {
    // La notification n'est pas bloquante
  }

  return c.json(created[0], 201);
});

/* ------------------------------------------------------------------ */
/* PATCH /api/payments/:id → modifier statut                            */
/* ------------------------------------------------------------------ */
paymentsRoutes.patch("/payments/:id", async (c) => {
  const auth = await requirePerm(c, "payments:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.status) {
    return c.json({ error: "Le statut est requis" }, 400);
  }

  if (!["VALIDE", "ANNULE"].includes(body.status)) {
    return c.json({ error: "Statut invalide. Utilisez VALIDE ou ANNULE" }, 400);
  }

  const db = createDb(c.env);

  const current = await db.query.payments.findFirst({
    where: eq(payments.id, c.req.param("id")),
    with: {
      student: true,
    },
  });

  if (!current) return c.json({ error: "Paiement introuvable" }, 404);

  const updated = await db
    .update(payments)
    .set({
      status: body.status,
    })
    .where(eq(payments.id, c.req.param("id")))
    .returning();

  return c.json(updated[0]);
});

/* ------------------------------------------------------------------ */
/* GET /api/payments/stats → stats agrégées                             */
/* ------------------------------------------------------------------ */
paymentsRoutes.get("/payments/stats", async (c) => {
  const auth = await requirePerm(c, "payments:stats");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const classId = url.searchParams.get("classId");
  const month = url.searchParams.get("month");

  const whereConditions = [];

  if (month) whereConditions.push(eq(payments.month, month));

  if (classId) {
    const studentIds = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.classId, classId));
    if (studentIds.length > 0) {
      whereConditions.push(
        inArray(
          payments.studentId,
          studentIds.map((s) => s.id)
        )
      );
    }
  }

  const allPayments = await db.query.payments.findMany({
    where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
  });

  const totalValide = allPayments
    .filter((p) => p.status === "VALIDE")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const totalEnAttente = allPayments
    .filter((p) => p.status === "EN_ATTENTE")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const totalAnnule = allPayments
    .filter((p) => p.status === "ANNULE")
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const countValide = allPayments.filter((p) => p.status === "VALIDE").length;
  const countEnAttente = allPayments.filter((p) => p.status === "EN_ATTENTE").length;
  const countAnnule = allPayments.filter((p) => p.status === "ANNULE").length;

  // Répartition par méthode
  const byMethod: Record<string, { count: number; total: number }> = {};
  for (const p of allPayments) {
    if (p.status !== "VALIDE") continue;
    if (!byMethod[p.method]) {
      byMethod[p.method] = { count: 0, total: 0 };
    }
    byMethod[p.method].count++;
    byMethod[p.method].total += parseFloat(p.amount);
  }

  return c.json({
    totalValide,
    totalEnAttente,
    totalAnnule,
    countValide,
    countEnAttente,
    countAnnule,
    byMethod,
    totalPayments: allPayments.length,
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/payments/unpaid → élèves sans paiement pour un mois         */
/* ------------------------------------------------------------------ */
paymentsRoutes.get("/payments/unpaid", async (c) => {
  const auth = await requirePerm(c, "payments:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const month = url.searchParams.get("month");
  const classId = url.searchParams.get("classId");

  if (!month) {
    return c.json({ error: "Le paramètre 'month' est requis" }, 400);
  }

  // Élèves qui ont un paiement VALIDE pour ce mois
  const paidStudentIds = await db
    .select({ studentId: payments.studentId })
    .from(payments)
    .where(and(eq(payments.month, month), eq(payments.status, "VALIDE")));

  const paidIds = paidStudentIds.map((r) => r.studentId);

  // Tous les élèves actifs
  const allStudentsConditions = [eq(students.isActive, true)];
  if (classId) {
    allStudentsConditions.push(eq(students.classId, classId));
  }

  const unpaidStudents = await db.query.students.findMany({
    where: and(
      ...allStudentsConditions,
      paidIds.length > 0 ? notInArray(students.id, paidIds) : undefined
    ),
    orderBy: [desc(students.createdAt)],
    with: {
      class: {
        with: {
          level: true,
        },
      },
      parent: true,
    },
  });

  return c.json({ data: unpaidStudents, total: unpaidStudents.length, month });
});
