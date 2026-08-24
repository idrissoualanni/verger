/**
 * Tests unitaires du routeur students (élèves + parents).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Bizarrerie source : le compteur de matricule passe par
 * db.select(...).from(students) attendu directement (PAS db.execute),
 * avec déstructuration [result] et lecture result?.max ?? 0.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { studentsRoutes } from "../../src/lib/api/routes/students";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", studentsRoutes);
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
      students: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      parents: { findMany: vi.fn().mockResolvedValue([]) },
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

/** Chaîne select → from → where (awaited sur where). */
function selectViaWhere(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// GET /api/students
// ------------------------------------------------------------------
describe("GET /api/students", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/students");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (students:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/students");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste paginée avec défauts limit=20 / offset=0", async () => {
    const rows = [
      { id: "s1", firstName: "Awa", lastName: "Diop", class: {}, parent: {} },
      { id: "s2", firstName: "Moussa", lastName: "Ndiaye", class: {}, parent: {} },
    ];
    const { select } = selectViaWhere([{ total: 2 }]);
    const db = dbMock({ select });
    db.query.students.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/students");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 2, limit: 20, offset: 0 });
    // défauts appliqués à findMany
    expect(db.query.students.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 })
    );
  });

  it("transmet classId et search aux conditions (findMany appelé)", async () => {
    const { select } = selectViaWhere([{ total: 0 }]);
    const db = dbMock({ select });

    const res = await makeApp(ownerSession).request("/students?classId=c1&search=awa");
    expect(res.status).toBe(200);
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ------------------------------------------------------------------
// POST /api/students
// ------------------------------------------------------------------
describe("POST /api/students", () => {
  function validBody() {
    return {
      firstName: "Awa",
      lastName: "Diop",
      dateOfBirth: "2015-05-10",
      gender: "F",
      classId: "c1",
      parentId: "p1",
    };
  }

  it("renvoie 400 si champs requis manquants", async () => {
    const res = await makeApp(ownerSession).request("/students", {
      method: "POST",
      body: JSON.stringify({ firstName: "Awa" }), // tout le reste manquant
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Prénom, nom, date de naissance, genre, classe et parent sont requis",
    });
  });

  it("renvoie 403 à une SECRETAIRE (students:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/students", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("crée un élève avec matricule généré depuis le max existant et qrCodeUrl", async () => {
    const created = { id: "s-new", matricule: "ELE-2026-006", firstName: "Awa" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });

    // Compteur de matricule : select → from → awaited (pas de where)
    const fromCounter = vi.fn().mockResolvedValue([{ max: 5 }]);
    const selectCounter = vi.fn().mockReturnValue({ from: fromCounter });
    dbMock({
      select: selectCounter,
      insert: vi.fn().mockReturnValue({ values }),
    });

    const res = await makeApp(ownerSession).request("/students", {
      method: "POST",
      body: JSON.stringify({ ...validBody(), schoolYear: "2026-2027" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);

    // Préfixe matricule ELE-<année du schoolYear>- + incrément du max
    expect(captured?.matricule).toBe("ELE-2026-006");
    // QR code construit depuis le matricule encodé
    expect(captured?.qrCodeUrl).toContain(
      `data=${encodeURIComponent("ELE-2026-006")}`
    );
    // Année scolaire explicite transmise
    expect(captured?.schoolYear).toBe("2026-2027");
    // Champs métier typés en string
    expect(captured?.firstName).toBe("Awa");
    expect(captured?.classId).toBe("c1");
    expect(captured?.parentId).toBe("p1");
  });

  it("applique les défauts : schoolYear courant et matricule ELE-<année>-001 si aucun élève", async () => {
    const created = { id: "s-new2", matricule: "ELE-2026-001" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });

    const fromCounter = vi.fn().mockResolvedValue([{ max: null }]);
    const selectCounter = vi.fn().mockReturnValue({ from: fromCounter });
    dbMock({
      select: selectCounter,
      insert: vi.fn().mockReturnValue({ values }),
    });

    const res = await makeApp(ownerSession).request("/students", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);

    // Reproduit currentSchoolYear() : mois >= 7 (août+) → <y>-<y+1>, sinon <y-1>-<y>
    const now = new Date();
    const y = now.getFullYear();
    const expectedSchoolYear =
      now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    const expectedYear = expectedSchoolYear.split("-")[0];

    expect(captured?.schoolYear).toBe(expectedSchoolYear);
    expect(captured?.matricule).toBe(`ELE-${expectedYear}-001`);
  });
});

// ------------------------------------------------------------------
// GET /api/students/count
// ------------------------------------------------------------------
describe("GET /api/students/count", () => {
  it("renvoie le nombre d'élèves actifs", async () => {
    const { select } = selectViaWhere([{ total: "7" }]);
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/students/count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 7 }); // Number("7")
  });
});

// ------------------------------------------------------------------
// GET /api/students/by-level
// ------------------------------------------------------------------
describe("GET /api/students/by-level", () => {
  it("renvoie la répartition groupée par niveau (chaîne leftJoin/groupBy/orderBy)", async () => {
    const rows = [
      { levelName: "Primaire", levelOrder: 1, count: 12 },
      { levelName: "Collège", levelOrder: 2, count: 8 },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const groupBy = vi.fn().mockReturnValue({ orderBy });
    // leftJoin est appelé deux fois ; chaque appel rend un objet portant leftJoin + groupBy
    const leftJoin = vi.fn(() => ({ leftJoin, groupBy }));
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/students/by-level");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(leftJoin).toHaveBeenCalledTimes(2);
    expect(orderBy).toHaveBeenCalledOnce();
  });
});

// ------------------------------------------------------------------
// GET /api/students/by-gender
// ------------------------------------------------------------------
describe("GET /api/students/by-gender", () => {
  it("renvoie la répartition par genre (chaîne where/groupBy)", async () => {
    const rows = [
      { gender: "F", count: 15 },
      { gender: "M", count: 10 },
    ];
    const groupBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ groupBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/students/by-gender");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
  });
});

// ------------------------------------------------------------------
// GET /api/students/recent
// ------------------------------------------------------------------
describe("GET /api/students/recent", () => {
  it("renvoie les 5 derniers inscrits (limit figée à 5, classe incluse)", async () => {
    const rows = [{ id: "s1", createdAt: "2026-08-01T08:00:00.000Z", class: {} }]; // dates sérialisées en ISO via c.json
    const db = dbMock();
    db.query.students.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/students/recent");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(db.query.students.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, with: { class: true } })
    );
  });
});

// ------------------------------------------------------------------
// GET /api/students/:id
// ------------------------------------------------------------------
describe("GET /api/students/:id", () => {
  it("renvoie 404 si l'élève n'existe pas", async () => {
    dbMock(); // findFirst → null par défaut

    const res = await makeApp(ownerSession).request("/students/inconnu");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  it("renvoie la fiche détaillée (classe + niveau + parent inclus)", async () => {
    const student = { id: "s1", firstName: "Awa", class: { level: {} }, parent: {} };
    const db = dbMock();
    db.query.students.findFirst.mockResolvedValue(student);

    const res = await makeApp(ownerSession).request("/students/s1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(student);
    expect(db.query.students.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: {
          class: { with: { level: true } },
          parent: true,
        },
      })
    );
  });
});

// ------------------------------------------------------------------
// PATCH /api/students/:id
// ------------------------------------------------------------------
describe("PATCH /api/students/:id", () => {
  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/students/s1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si l'élève n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/students/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ firstName: "X" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  it("ne met à jour que les champs fournis", async () => {
    const updated = { id: "s1", firstName: "Awa modifié" };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/students/s1", {
      method: "PATCH",
      body: JSON.stringify({ firstName: "Awa modifié" }), // pas d'autres champs
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ firstName: "Awa modifié" });
  });
});

// ------------------------------------------------------------------
// DELETE /api/students/:id — soft delete (désactivation), pas de garde-fou 409
// ------------------------------------------------------------------
describe("DELETE /api/students/:id", () => {
  it("renvoie 404 si l'élève n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/students/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  it("désactive l'élève au lieu de le supprimer (isActive: false)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "s1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/students/s1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(capturedSet).toEqual({ isActive: false }); // soft delete
  });
});

// ------------------------------------------------------------------
// GET /api/parents
// ------------------------------------------------------------------
describe("GET /api/parents", () => {
  it("renvoie la liste des parents triée par nom", async () => {
    const rows = [{ id: "p1", name: "Fatou Fall", phone: "+221770000001" }];
    const db = dbMock();
    db.query.parents.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/parents");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(db.query.parents.findMany).toHaveBeenCalledOnce();
  });
});

// ------------------------------------------------------------------
// POST /api/parents
// ------------------------------------------------------------------
describe("POST /api/parents", () => {
  it("renvoie 400 sans nom ou téléphone", async () => {
    const res = await makeApp(ownerSession).request("/parents", {
      method: "POST",
      body: JSON.stringify({ name: "Fatou Fall" }), // phone manquant
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nom et téléphone sont requis" });
  });

  it("crée un parent avec email/adresse à null par défaut", async () => {
    const created = { id: "p-new", name: "Fatou Fall", phone: "+221770000001" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/parents", {
      method: "POST",
      body: JSON.stringify({ name: "Fatou Fall", phone: "+221770000001" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(captured?.email).toBeNull(); // défauts appliqués
    expect(captured?.address).toBeNull();
    expect(String(captured?.id)).toMatch(/^[0-9a-f-]{36}$/); // uuid généré
  });

  it("crée un parent avec email et adresse fournis", async () => {
    const created = { id: "p-new2", name: "Moussa Ndiaye", phone: "+221770000002" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/parents", {
      method: "POST",
      body: JSON.stringify({
        name: "Moussa Ndiaye",
        phone: "+221770000002",
        email: "moussa@ex.sn",
        address: "Dakar",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(captured?.email).toBe("moussa@ex.sn");
    expect(captured?.address).toBe("Dakar");
  });
});
