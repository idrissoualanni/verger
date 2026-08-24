/**
 * Tests unitaires du routeur expenses (dépenses, stats, budget).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { expensesRoutes } from "../../src/lib/api/routes/expenses";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", expensesRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};

function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: { expenses: { findMany: vi.fn().mockResolvedValue([]) } },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    execute: vi.fn(),
    ...overrides,
  };
  vi.mocked(createDb).mockReturnValue(db as never);
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/expenses", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/expenses");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (expenses:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/expenses");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste triée au PROPRIETAIRE", async () => {
    const rows = [{ id: "e1", category: "SALAIRE", amount: "150000" }];
    const db = dbMock();
    db.query.expenses.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/expenses");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: rows, total: 1 });
    // where non passé quand aucun filtre fourni
    expect(db.query.expenses.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("passe un filtre when catégorie et mois fournis", async () => {
    const db = dbMock();
    db.query.expenses.findMany.mockResolvedValue([]);

    const res = await makeApp(ownerSession).request("/expenses?category=SALAIRE&month=2026-08");
    expect(res.status).toBe(200);
    const args = db.query.expenses.findMany.mock.calls[0][0];
    expect(args.where).toBeDefined(); // and(cond1, cond2)
  });

  it("ignore une catégorie inconnue dans les filtres", async () => {
    const db = dbMock();
    db.query.expenses.findMany.mockResolvedValue([]);

    await makeApp(ownerSession).request("/expenses?category=PIRATE");
    // seule la condition month pourrait exister ; ici aucune des deux → where undefined
    const args = db.query.expenses.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
  });
});

describe("POST /api/expenses", () => {
  it("renvoie 400 si champs requis manquants", async () => {
    const res = await makeApp(ownerSession).request("/expenses", {
      method: "POST",
      body: JSON.stringify({ category: "SALAIRE" }), // description, amount, date manquants
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Catégorie, description, montant et date sont requis",
    });
  });

  it("crée une dépense avec montant et date convertis", async () => {
    const created = { id: "e-new", category: "FOURNITURES", amount: "25000" };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      expect(arg.amount).toBe("25000");
      expect(arg.date).toBeInstanceOf(Date);
      expect(arg.id).toBeDefined();
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/expenses", {
      method: "POST",
      body: JSON.stringify({ category: "FOURNITURES", description: "Craie", amount: 25000, date: "2026-08-20" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });
});

describe("PATCH /api/expenses/:id", () => {
  function patchChains(updated: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updated);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    return dbMock({ update: vi.fn().mockReturnValue({ set }) });
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/expenses/e1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("renvoie 404 si la dépense n'existe pas", async () => {
    patchChains([]);
    const res = await makeApp(ownerSession).request("/expenses/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ amount: 99 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Dépense introuvable" });
  });

  it("modifie le montant d'une dépense existante", async () => {
    const updated = { id: "e1", amount: "99000" };
    patchChains([updated]);
    const res = await makeApp(ownerSession).request("/expenses/e1", {
      method: "PATCH",
      body: JSON.stringify({ amount: 99000 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
  });
});

describe("DELETE /api/expenses/:id", () => {
  function deleteChains(deletedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(deletedRows);
    const where = vi.fn().mockReturnValue({ returning });
    return dbMock({ delete: vi.fn().mockReturnValue({ where }) });
  }

  it("supprime une dépense existante", async () => {
    deleteChains([{ id: "e1" }]);
    const res = await makeApp(ownerSession).request("/expenses/e1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("renvoie 404 si la dépense est introuvable", async () => {
    deleteChains([]);
    const res = await makeApp(ownerSession).request("/expenses/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("refuse la suppression à une SECRETAIRE", async () => {
    const res = await makeApp(secretaireSession).request("/expenses/e1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/expenses/stats", () => {
  /** Chaîne select→from→where→groupBy (résultat attendu en bout). */
  function statChain(rows: unknown[]) {
    const groupBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    return from;
  }

  it("calcule les pourcentages par catégorie et le grand total", async () => {
    const rows = [
      { category: "SALAIRE", count: "2", total: "300000" },
      { category: "LOYER", count: "1", total: "100000" },
    ];
    dbMock({ select: vi.fn().mockReturnValue({ from: statChain(rows) }) });

    const res = await makeApp(ownerSession).request("/expenses/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grandTotal).toBe(400000);
    expect(body.byCategory).toEqual([
      { category: "SALAIRE", count: 2, total: 300000, percentage: 75 },
      { category: "LOYER", count: 1, total: 100000, percentage: 25 },
    ]);
    expect(body.period).toBe("month"); // défaut
  });

  it("gère un grand total nul sans division par zéro", async () => {
    dbMock({ select: vi.fn().mockReturnValue({ from: statChain([]) }) });

    const res = await makeApp(ownerSession).request("/expenses/stats?period=year");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grandTotal).toBe(0);
    expect(body.period).toBe("year");
  });
});

describe("GET /api/expenses/monthly", () => {
  /** Chaîne complète select→from→where→groupBy→orderBy. */
  function monthlyChain(rows: unknown[]) {
    const orderBy = vi.fn().mockResolvedValue(rows);
    const groupBy = vi.fn().mockReturnValue({ orderBy });
    const where = vi.fn().mockReturnValue({ groupBy });
    return { from: vi.fn().mockReturnValue({ where }) };
  }

  it("fusionne dépenses et revenus par mois, triés", async () => {
    // 1er select = dépenses, 2ᵉ = revenus (payments)
    const expensesRows = [{ month: "2026-07", label: "Jul 2026", total: "80000" }];
    const revenueRows = [
      { month: "2026-06", label: "Jun 2026", total: "500000" },
      { month: "2026-07", label: "Jul 2026", total: "300000" },
    ];
    const chains = [monthlyChain(expensesRows), monthlyChain(revenueRows)];
    dbMock({ select: vi.fn().mockImplementation(() => chains.shift()) as never });

    const res = await makeApp(ownerSession).request("/expenses/monthly");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.monthly).toEqual([
      { month: "2026-06", label: "Jun 2026", revenue: 500000, expenses: 0 },
      { month: "2026-07", label: "Jul 2026", revenue: 300000, expenses: 80000 },
    ]);
  });

  it("renvoie une liste vide si aucune donnée", async () => {
    const chains = [monthlyChain([]), monthlyChain([])];
    dbMock({ select: vi.fn().mockImplementation(() => chains.shift()) as never });

    const res = await makeApp(ownerSession).request("/expenses/monthly");
    expect(res.status).toBe(200);
    expect((await res.json()).monthly).toEqual([]);
  });
});

describe("GET /api/budget", () => {
  it("calcule revenus − dépenses", async () => {
    // 1er select : revenus select→from→where ; 2ᵉ : dépenses select→from
    const revenueWhere = vi.fn().mockResolvedValue([{ total: "1200000" }]);
    const revenueFrom = vi.fn().mockReturnValue({ where: revenueWhere });
    const expenseFrom = vi.fn().mockResolvedValue([{ total: "350000" }]);
    const chains = [
      { from: revenueFrom },
      { from: expenseFrom },
    ];
    dbMock({ select: vi.fn().mockImplementation(() => chains.shift()) as never });

    const res = await makeApp(ownerSession).request("/budget");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revenue: 1200000, expenses: 350000, balance: 850000 });
  });

  it("traite les totaux nuls comme zéro", async () => {
    const revenueWhere = vi.fn().mockResolvedValue([{ total: null }]);
    const revenueFrom = vi.fn().mockReturnValue({ where: revenueWhere });
    const expenseFrom = vi.fn().mockResolvedValue([{ total: null }]);
    const chains = [
      { from: revenueFrom },
      { from: expenseFrom },
    ];
    dbMock({ select: vi.fn().mockImplementation(() => chains.shift()) as never });

    const res = await makeApp(ownerSession).request("/budget");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revenue: 0, expenses: 0, balance: 0 });
  });
});
