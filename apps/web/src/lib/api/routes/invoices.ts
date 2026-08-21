import { Hono } from "hono";
import { eq, desc, and, like, sql, count } from "drizzle-orm";
import { createDb } from "../lib/db";
import {
  invoices,
  invoiceItems,
  students,
  parents,
  classes,
} from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

export const invoicesRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


async function generateInvoiceNumber(db: ReturnType<typeof createDb>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}`;
  const [result] = await db
    .select({ max: sql<number>`max(substring(number from ${`${prefix}(\\d+)$`})::int)` })
    .from(invoices);
  const next = (result?.max ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ------------------------------------------------------------------
// GET /api/invoices → liste filtrée
// ------------------------------------------------------------------
invoicesRoutes.get("/invoices", async (c) => {
  const auth = await requirePerm(c, "invoices:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const status = url.searchParams.get("status");
  const month = url.searchParams.get("month");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const whereConditions = [];
  if (studentId) whereConditions.push(eq(invoices.studentId, studentId));
  if (status) whereConditions.push(eq(invoices.status, status as any));
  if (month) {
    whereConditions.push(sql`to_char(${invoices.createdAt}, 'YYYY-MM') = ${month}`);
  }

  const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const [totalResult] = await db
    .select({ total: count() })
    .from(invoices)
    .where(where);

  const data = await db.query.invoices.findMany({
    where,
    orderBy: [desc(invoices.createdAt)],
    limit,
    offset,
    with: {
      student: {
        with: {
          class: true,
          parent: true,
        },
      },
      items: true,
    },
  });

  return c.json({
    data,
    total: Number(totalResult?.total ?? 0),
    limit,
    offset,
  });
});

// ------------------------------------------------------------------
// POST /api/invoices → créer facture avec lignes
// ------------------------------------------------------------------
invoicesRoutes.post("/invoices", async (c) => {
  const auth = await requirePerm(c, "invoices:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.studentId || !body?.items || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "studentId et items (au moins 1) sont requis" }, 400);
  }

  const db = createDb(c.env);
  const number = await generateInvoiceNumber(db);
  const totalAmount = body.items.reduce(
    (sum: number, item: { unitAmount: string; quantity: number }) =>
      sum + parseFloat(item.unitAmount) * (item.quantity ?? 1),
    0
  );

  const invoice = await db
    .insert(invoices)
    .values({
      id: crypto.randomUUID(),
      number,
      studentId: String(body.studentId),
      totalAmount: String(totalAmount),
      paidAmount: "0",
      status: "EN_ATTENTE",
      dueDate: body.dueDate ? String(body.dueDate) : null,
    })
    .returning();

  const items = await Promise.all(
    body.items.map((item: { description?: string; designation?: string; unitAmount: string; quantity?: number; amount?: string }) => {
      const designation = item.description || item.designation || "";
      const quantity = item.quantity ?? 1;
      const unitAmount = item.unitAmount || item.amount || "0";
      return db
        .insert(invoiceItems)
        .values({
          id: crypto.randomUUID(),
          invoiceId: invoice[0].id,
          designation,
          unitAmount: String(unitAmount),
          quantity,
        })
        .returning();
    })
  );

  const created = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoice[0].id),
    with: {
      student: {
        with: {
          class: true,
          parent: true,
        },
      },
      items: true,
    },
  });

  return c.json(created, 201);
});

// ------------------------------------------------------------------
// GET /api/invoices/:id → détail
// ------------------------------------------------------------------
invoicesRoutes.get("/invoices/:id", async (c) => {
  const auth = await requirePerm(c, "invoices:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, c.req.param("id")),
    with: {
      student: {
        with: {
          class: true,
          parent: true,
        },
      },
      items: true,
    },
  });

  if (!invoice) return c.json({ error: "Facture introuvable" }, 404);
  return c.json(invoice);
});

// ------------------------------------------------------------------
// PATCH /api/invoices/:id → modifier statut, marquer payée
// ------------------------------------------------------------------
invoicesRoutes.patch("/invoices/:id", async (c) => {
  const auth = await requirePerm(c, "invoices:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);

  const updates: Record<string, any> = {};
  if (body.status) updates.status = body.status;
  if (body.paidAmount !== undefined) updates.paidAmount = String(body.paidAmount);
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? String(body.dueDate) : null;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "Aucun champ à modifier" }, 400);
  }

  const updated = await db
    .update(invoices)
    .set(updates)
    .where(eq(invoices.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Facture introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/invoices/:id → supprimer (si pas payée)
// ------------------------------------------------------------------
invoicesRoutes.delete("/invoices/:id", async (c) => {
  const auth = await requirePerm(c, "invoices:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, c.req.param("id")),
  });

  if (!invoice) return c.json({ error: "Facture introuvable" }, 404);
  if (invoice.status === "PAYEE") {
    return c.json({ error: "Impossible de supprimer une facture payée" }, 400);
  }

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
  await db.delete(invoices).where(eq(invoices.id, invoice.id));

  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// POST /api/invoices/:id/send → envoyer au parent (WhatsApp simulé)
// ------------------------------------------------------------------
invoicesRoutes.post("/invoices/:id/send", async (c) => {
  const auth = await requirePerm(c, "invoices:create");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, c.req.param("id")),
    with: {
      student: {
        with: {
          parent: true,
        },
      },
    },
  });

  if (!invoice) return c.json({ error: "Facture introuvable" }, 404);

  const parent = invoice.student?.parent;
  if (!parent?.phone) {
    return c.json({ error: "Aucun numéro de téléphone pour le parent" }, 400);
  }

  const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`;
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("fr-FR")
    : "non définie";

  const message = `Facture ${invoice.number} de ${parseFloat(invoice.totalAmount).toLocaleString("fr-FR")} FCFA pour ${studentName}. Échéance : ${dueDate}.`;

  const success = Math.random() < 0.9;

  await db.insert(invoices as any).values({}).catch(() => {});

  return c.json({
    ok: true,
    sent: success,
    phone: parent.phone,
    message,
  });
});

// ------------------------------------------------------------------
// GET /api/invoices/stats → total facturé, payé, en attente
// ------------------------------------------------------------------
invoicesRoutes.get("/invoices/stats", async (c) => {
  const auth = await requirePerm(c, "invoices:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);

  const [totalResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`,
      count: count(),
    })
    .from(invoices);

  const [paidResult] = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)` })
    .from(invoices)
    .where(eq(invoices.status, "PAYEE"));

  const [pendingResult] = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.totalAmount} - ${invoices.paidAmount}, 0)` })
    .from(invoices)
    .where(eq(invoices.status, "EN_ATTENTE"));

  const [partialResult] = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`,
      count: count(),
    })
    .from(invoices)
    .where(eq(invoices.status, "PARTIEL"));

  const [annulledResult] = await db
    .select({ total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`, count: count() })
    .from(invoices)
    .where(eq(invoices.status, "ANNULEE"));

  const monthly = await db
    .select({
      month: sql<string>`to_char(${invoices.createdAt}, 'YYYY-MM')`,
      total: sql<number>`coalesce(sum(${invoices.totalAmount}), 0)`,
      paid: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)`,
      count: count(),
    })
    .from(invoices)
    .groupBy(sql`to_char(${invoices.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${invoices.createdAt}, 'YYYY-MM')`);

  return c.json({
    totalFacture: Number(totalResult?.total ?? 0),
    totalPaye: Number(paidResult?.total ?? 0),
    totalEnAttente: Number(pendingResult?.total ?? 0),
    totalPartiel: Number(partialResult?.total ?? 0),
    totalAnnule: Number(annulledResult?.total ?? 0),
    nbFactures: Number(totalResult?.count ?? 0),
    nbPartiel: Number(partialResult?.count ?? 0),
    nbAnnule: Number(annulledResult?.count ?? 0),
    monthly,
  });
});
