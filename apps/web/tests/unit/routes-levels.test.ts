/**
 * Tests unitaires du routeur levels (niveaux + classes).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { levelsRoutes } from "../../src/lib/api/routes/levels";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", levelsRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      levels: { findMany: vi.fn().mockResolvedValue([]) },
      classes: { findMany: vi.fn().mockResolvedValue([]) },
    },
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

describe("GET /api/levels", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/levels");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (levels:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/levels");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste ordonnée au PROPRIETAIRE", async () => {
    const rows = [{ id: "l1", name: "Primaire", order: 1, classes: [] }];
    const db = dbMock();
    db.query.levels.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/levels");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(db.query.levels.findMany).toHaveBeenCalledOnce();
  });
});

describe("POST /api/levels", () => {
  it("renvoie 400 sans nom", async () => {
    const res = await makeApp(ownerSession).request("/levels", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Le nom est requis" });
  });

  it("crée un niveau et renvoie 201", async () => {
    const created = { id: "l-new", name: "Collège", order: 2, description: null };
    const returning = vi.fn().mockResolvedValue([created]);
    dbMock({ insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) }) });

    const res = await makeApp(ownerSession).request("/levels", {
      method: "POST",
      body: JSON.stringify({ name: "Collège", order: 2 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });
});

describe("PATCH /api/levels/:id", () => {
  it("renvoie 404 si le niveau n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/levels/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ name: "X" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Niveau introuvable" });
  });

  it("renomme un niveau existant", async () => {
    const updated = { id: "l1", name: "Primaire modifié", order: 1 };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/levels/l1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Primaire modifié" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
  });

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/levels/l1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/levels/:id", () => {
  function deleteChains(linkedCount: number, deletedRows: unknown[]) {
    const selectWhere = vi.fn().mockResolvedValue([{ n: linkedCount }]);
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const delReturning = vi.fn().mockResolvedValue(deletedRows);
    const delWhere = vi.fn().mockReturnValue({ returning: delReturning });
    return dbMock({
      select: vi.fn().mockReturnValue({ from: selectFrom }),
      delete: vi.fn().mockReturnValue({ where: delWhere }),
    });
  }

  it("refuse la suppression (409) si des classes sont rattachées", async () => {
    deleteChains(3, []);
    const res = await makeApp(ownerSession).request("/levels/l1", { method: "DELETE" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Des classes sont rattachées à ce niveau" });
  });

  it("renvoie 404 si le niveau n'existe pas", async () => {
    deleteChains(0, []);
    const res = await makeApp(ownerSession).request("/levels/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("supprime un niveau sans classes rattachées", async () => {
    deleteChains(0, [{ id: "l1" }]);
    const res = await makeApp(ownerSession).request("/levels/l1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/classes", () => {
  it("renvoie 400 si champs requis manquants", async () => {
    const res = await makeApp(ownerSession).request("/classes", {
      method: "POST",
      body: JSON.stringify({ name: "CP1" }), // levelId + schoolYear manquants
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nom, niveau et année scolaire sont requis" });
  });

  it("crée une classe avec frais par défaut '0'", async () => {
    const created = { id: "c1", name: "CP1", levelId: "l1", tuitionFee: "0", schoolYear: "2026-2027" };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      expect(arg.tuitionFee).toBe("0"); // défaut appliqué
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/classes", {
      method: "POST",
      body: JSON.stringify({ name: "CP1", levelId: "l1", schoolYear: "2026-2027" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
  });
});

describe("PATCH /api/classes/:id", () => {
  it("renvoie 404 si la classe n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/classes/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ tuitionFee: "50000" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Classe introuvable" });
  });

  it("modifie les frais d'une classe existante", async () => {
    const updated = { id: "c1", name: "CP1", tuitionFee: "50000" };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/classes/c1", {
      method: "PATCH",
      body: JSON.stringify({ tuitionFee: "50000" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
  });
});

describe("DELETE /api/classes/:id", () => {
  it("refuse (409) de supprimer une classe existante (garde-fou élèves)", async () => {
    // La classe existe → le count sur classes.id retourne 1 → 409
    const selectWhere = vi.fn().mockResolvedValue([{ n: 1 }]);
    dbMock({ select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) }) });

    const res = await makeApp(ownerSession).request("/classes/c1", { method: "DELETE" });
    expect(res.status).toBe(409);
  });

  it("supprime une classe vide", async () => {
    const selectWhere = vi.fn().mockResolvedValue([{ n: 0 }]);
    const delReturning = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const delWhere = vi.fn().mockReturnValue({ returning: delReturning });
    dbMock({
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) }),
      delete: vi.fn().mockReturnValue({ where: delWhere }),
    });

    const res = await makeApp(ownerSession).request("/classes/c1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("renvoie 404 si la classe est introuvable", async () => {
    const selectWhere = vi.fn().mockResolvedValue([{ n: 0 }]);
    const delReturning = vi.fn().mockResolvedValue([]);
    const delWhere = vi.fn().mockReturnValue({ returning: delReturning });
    dbMock({
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) }),
      delete: vi.fn().mockReturnValue({ where: delWhere }),
    });

    const res = await makeApp(ownerSession).request("/classes/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
