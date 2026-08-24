/**
 * Tests unitaires du routeur staff (personnel).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { staffRoutes } from "../../src/lib/api/routes/staff";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", staffRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const comptableSession: FakeSession = {
  user: { id: "u-compta", role: "COMPTABLE", email: "compta@verger.sn", name: "Comptable" },
};

function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: { staff: { findMany: vi.fn().mockResolvedValue([]) } },
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

describe("GET /api/staff", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/staff");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à un COMPTABLE (staff:read refusé)", async () => {
    const res = await makeApp(comptableSession).request("/staff");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste au PROPRIETAIRE sans filtre", async () => {
    const rows = [{ id: "s1", name: "Mbaye Fall", role: "ENSEIGNANT" }];
    const db = dbMock();
    db.query.staff.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/staff");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 1 });
    const args = db.query.staff.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
  });

  it("cumule les filtres role + search + activeOnly", async () => {
    const db = dbMock();
    db.query.staff.findMany.mockResolvedValue([]);

    await makeApp(ownerSession).request("/staff?role=ENSEIGNANT&search=fall&activeOnly=true");
    const args = db.query.staff.findMany.mock.calls[0][0];
    expect(args.where).toBeDefined(); // and(eq, or(like, like), eq)
  });

  it("passe where undefined quand aucun filtre pertinent", async () => {
    const db = dbMock();
    db.query.staff.findMany.mockResolvedValue([]);

    await makeApp(ownerSession).request("/staff?activeOnly=false");
    // activeOnly=false → pas de condition ; pas de role ni search
    const args = db.query.staff.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
  });
});

describe("POST /api/staff", () => {
  it("renvoie 400 si nom/rôle/date d'embauche manquants", async () => {
    const res = await makeApp(ownerSession).request("/staff", {
      method: "POST",
      body: JSON.stringify({ name: "Fall" }), // role + hireDate manquants
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nom, rôle et date d'embauche sont requis" });
  });

  it("crée un membre avec les champs optionnels à null par défaut", async () => {
    const created = { id: "s-new", name: "Awa Diop", role: "ENSEIGNANT" };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      expect(arg.subject).toBeNull();
      expect(arg.phone).toBeNull();
      expect(arg.email).toBeNull();
      expect(arg.salary).toBeNull();
      expect(arg.address).toBeNull();
      expect(arg.hireDate).toBe("2026-09-01"); // string brute, pas de Date
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/staff", {
      method: "POST",
      body: JSON.stringify({ name: "Awa Diop", role: "ENSEIGNANT", hireDate: "2026-09-01" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });

  it("conserve les champs optionnels fournis", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "s2" }]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      expect(arg.subject).toBe("Mathématiques");
      expect(arg.salary).toBe("150000");
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/staff", {
      method: "POST",
      body: JSON.stringify({
        name: "Fall", role: "ENSEIGNANT", hireDate: "2026-09-01",
        subject: "Mathématiques", salary: 150000,
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/staff/:id", () => {
  function patchChains(updated: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updated);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    return dbMock({ update: vi.fn().mockReturnValue({ set }) });
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/staff/s1", {
      method: "PATCH",
      body: "{invalide",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("renvoie 404 si le membre n'existe pas", async () => {
    patchChains([]);
    const res = await makeApp(ownerSession).request("/staff/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ salary: 200000 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Membre introuvable" });
  });

  it("désactive via isActive et convertit salary en string", async () => {
    const updated = [{ id: "s1", isActive: false }];
    const returning = vi.fn().mockResolvedValue(updated);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      expect(arg.isActive).toBe(false);
      expect(arg.salary).toBe("200000");
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/staff/s1", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false, salary: 200000 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated[0]);
  });
});

describe("DELETE /api/staff/:id (soft delete)", () => {
  function softDeleteChains(rows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    return dbMock({ update: vi.fn().mockReturnValue({ set }) });
  }

  it("désactive le membre au lieu de le supprimer", async () => {
    const set = softDeleteChains([{ id: "s1", isActive: false }])
      .update.mock.calls.length; // juste pour typer ; on vérifie via arg ci-dessous
    void set;
    const res = await makeApp(ownerSession).request("/staff/s1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("passe bien isActive:false au mock (pas de hard delete)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "s1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const updateFn = vi.fn().mockReturnValue({ set });
    vi.mocked(createDb).mockReturnValue({
      query: {}, insert: vi.fn(), update: updateFn, delete: vi.fn(), select: vi.fn(), execute: vi.fn(),
    } as never);

    await makeApp(ownerSession).request("/staff/s1", { method: "DELETE" });
    expect(set).toHaveBeenCalledWith({ isActive: false });
    expect(updateFn).toHaveBeenCalled(); // update, PAS delete
  });

  it("renvoie 404 si le membre est introuvable", async () => {
    softDeleteChains([]);
    const res = await makeApp(ownerSession).request("/staff/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("refuse à un COMPTABLE", async () => {
    const res = await makeApp(comptableSession).request("/staff/s1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/staff/stats", () => {
  /** Construit les 3 chaînes select consommées par la route stats. */
  function statsChains(byRoleRows: unknown[], totalRows: unknown[], countRows: unknown[]) {
    const groupBy = vi.fn().mockResolvedValue(byRoleRows);
    const where1 = vi.fn().mockReturnValue({ groupBy });
    const from1 = vi.fn().mockReturnValue({ where: where1 });

    const where2 = vi.fn().mockResolvedValue(totalRows);
    const from2 = vi.fn().mockReturnValue({ where: where2 });

    const where3 = vi.fn().mockResolvedValue(countRows);
    const from3 = vi.fn().mockReturnValue({ where: where3 });

    const chains = [{ from: from1 }, { from: from2 }, { from: from3 }];
    return vi.fn().mockImplementation(() => chains.shift());
  }

  it("agrège par rôle, masse salariale et effectif actif", async () => {
    const selectSpy = statsChains(
      [{ role: "ENSEIGNANT", count: "3", totalSalary: "450000" }],
      [{ total: "600000" }],
      [{ total: "5" }]
    );
    dbMock({ select: selectSpy as never });

    const res = await makeApp(ownerSession).request("/staff/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      byRole: [{ role: "ENSEIGNANT", count: 3, totalSalary: 450000 }],
      totalSalary: 600000,
      totalActive: 5,
    });
  });

  it("traite les valeurs nulles comme zéro", async () => {
    const selectSpy = statsChains([], [{ total: null }], [{ total: null }]);
    dbMock({ select: selectSpy as never });

    const res = await makeApp(ownerSession).request("/staff/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalSalary).toBe(0);
    expect(body.totalActive).toBe(0);
    expect(body.byRole).toEqual([]);
  });
});
