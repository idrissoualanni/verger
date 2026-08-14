import { Hono } from "hono";
import { eq, desc, and, sql } from "drizzle-orm";
import { createDb } from "../lib/db.js";
import { expenses, payments, expenseCategoryEnum } from "@verger/shared/src/schema.js";
import { EXPENSE_CATEGORIES } from "@verger/shared";

export const expensesRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();

async function requireOwner(c: { var: { auth: any }; req: { raw: Request } }): Promise<any> {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.role !== "PROPRIETAIRE") return null;
  return session.user;
}

// ------------------------------------------------------------------
// GET /api/expenses → liste filtrée
// ------------------------------------------------------------------
expensesRoutes.get("/expenses", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const category = url.searchParams.get("category");
  const month = url.searchParams.get("month"); // format YYYY-MM

  const whereConditions = [];
  if (category && EXPENSE_CATEGORIES.includes(category as any)) {
    whereConditions.push(eq(expenses.category, category as typeof expenseCategoryEnum.enumValues[number]));
  }
  if (month) {
    whereConditions.push(sql`to_char(${expenses.date}, 'YYYY-MM') = ${month}`);
  }

  const result = await db.query.expenses.findMany({
    where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
    orderBy: [desc(expenses.date), desc(expenses.createdAt)],
  });

  return c.json({ data: result, total: result.length });
});

// ------------------------------------------------------------------
// POST /api/expenses → créer une dépense
// ------------------------------------------------------------------
expensesRoutes.post("/expenses", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.category || !body?.description || !body?.amount || !body?.date) {
    return c.json({ error: "Catégorie, description, montant et date sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(expenses)
    .values({
      id: crypto.randomUUID(),
      category: body.category,
      description: String(body.description),
      amount: String(body.amount),
      date: new Date(body.date),
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/expenses/:id → modifier
// ------------------------------------------------------------------
expensesRoutes.patch("/expenses/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(expenses)
    .set({
      ...(body.category ? { category: body.category } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.amount !== undefined ? { amount: String(body.amount) } : {}),
      ...(body.date ? { date: new Date(body.date) } : {}),
    })
    .where(eq(expenses.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Dépense introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/expenses/:id → supprimer
// ------------------------------------------------------------------
expensesRoutes.delete("/expenses/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const deleted = await db
    .delete(expenses)
    .where(eq(expenses.id, c.req.param("id")))
    .returning();

  if (!deleted.length) return c.json({ error: "Dépense introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// GET /api/expenses/stats → stats par catégorie
// ------------------------------------------------------------------
expensesRoutes.get("/expenses/stats", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const period = url.searchParams.get("period") ?? "month";

  let dateFilter: ReturnType<typeof sql> | undefined;
  if (period === "month") {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    dateFilter = sql`to_char(${expenses.date}, 'YYYY-MM') = ${`${y}-${m}`}`;
  } else if (period === "year") {
    const y = new Date().getFullYear();
    dateFilter = sql`extract(year from ${expenses.date}) = ${y}`;
  }

  const result = await db
    .select({
      category: expenses.category,
      count: sql<number>`count(*)`,
      total: sql<number>`sum(${expenses.amount}::numeric)`,
    })
    .from(expenses)
    .where(dateFilter)
    .groupBy(expenses.category);

  const grandTotal = result.reduce((sum, r) => sum + Number(r.total), 0);

  const byCategory = result.map((r) => ({
    category: r.category,
    count: Number(r.count),
    total: Number(r.total),
    percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 100) : 0,
  }));

  return c.json({ byCategory, grandTotal, period });
});

// ------------------------------------------------------------------
// GET /api/expenses/monthly → évolution mensuelle revenus vs dépenses
// ------------------------------------------------------------------
expensesRoutes.get("/expenses/monthly", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);

  // Dépenses par mois (12 derniers mois)
  const expensesByMonth = await db
    .select({
      month: sql<string>`to_char(${expenses.date}, 'YYYY-MM')`,
      label: sql<string>`to_char(${expenses.date}, 'Mon YYYY')`,
      total: sql<number>`sum(${expenses.amount}::numeric)`,
    })
    .from(expenses)
    .where(sql`${expenses.date} >= now() - interval '12 months'`)
    .groupBy(sql`to_char(${expenses.date}, 'YYYY-MM')`, sql`to_char(${expenses.date}, 'Mon YYYY')`)
    .orderBy(sql`to_char(${expenses.date}, 'YYYY-MM')`);

  // Revenus (paiements validés) par mois
  const revenueByMonth = await db
    .select({
      month: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM')`,
      label: sql<string>`to_char(${payments.createdAt}, 'Mon YYYY')`,
      total: sql<number>`sum(${payments.amount}::numeric)`,
    })
    .from(payments)
    .where(sql`${payments.status} = 'VALIDE' AND ${payments.createdAt} >= now() - interval '12 months'`)
    .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM')`, sql`to_char(${payments.createdAt}, 'Mon YYYY')`)
    .orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM')`);

  // Combiner tous les mois
  const monthMap = new Map<string, { month: string; label: string; revenue: number; expenses: number }>();

  for (const r of expensesByMonth) {
    if (!monthMap.has(r.month)) {
      monthMap.set(r.month, { month: r.month, label: r.label, revenue: 0, expenses: 0 });
    }
    monthMap.get(r.month)!.expenses = Number(r.total);
  }

  for (const r of revenueByMonth) {
    if (!monthMap.has(r.month)) {
      monthMap.set(r.month, { month: r.month, label: r.label, revenue: 0, expenses: 0 });
    }
    monthMap.get(r.month)!.revenue = Number(r.total);
  }

  const monthly = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  return c.json({ monthly });
});

// ------------------------------------------------------------------
// GET /api/budget → vue d'ensemble financière
// ------------------------------------------------------------------
expensesRoutes.get("/budget", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);

  // Revenus totaux (paiements validés)
  const [revenueResult] = await db
    .select({ total: sql<number>`sum(${payments.amount}::numeric)` })
    .from(payments)
    .where(sql`${payments.status} = 'VALIDE'`);

  // Dépenses totales
  const [expenseResult] = await db
    .select({ total: sql<number>`sum(${expenses.amount}::numeric)` })
    .from(expenses);

  const revenue = Number(revenueResult?.total ?? 0);
  const totalExpenses = Number(expenseResult?.total ?? 0);

  return c.json({
    revenue,
    expenses: totalExpenses,
    balance: revenue - totalExpenses,
  });
});
