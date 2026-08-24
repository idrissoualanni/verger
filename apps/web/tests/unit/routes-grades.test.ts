/**
 * Tests unitaires du routeur grades (matières + notes + moyennes + bulletin).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Points délicats du source :
 * - /grades/averages : chaîne select → from → innerJoin ×2 → leftJoin → where
 *   (mock auto-référencé sur innerJoin).
 * - /grades/bulletin : agrégation 100% JS côté route — moyennes pondérées,
 *   moyenne de classe, rang et mentions vérifiées NUMÉRIQUEMENT.
 * - POST /grades ignore silencieusement les entrées invalides (pas de 400).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { gradesRoutes } from "../../src/lib/api/routes/grades";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", gradesRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};

/** Reproduit currentSchoolYear() du source : mois >= 7 (août+) → <y>-<y+1>, sinon <y-1>-<y>. */
function expectedSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      subjects: { findMany: vi.fn().mockResolvedValue([]) },
      grades: { findMany: vi.fn().mockResolvedValue([]) },
      students: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
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

/** Chaîne select → from → innerJoin ×N → leftJoin → where (awaited sur where). */
function joinChain(finalRows: unknown[]) {
  const where = vi.fn().mockResolvedValue(finalRows);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const innerJoin = vi.fn(() => ({ innerJoin, leftJoin }));
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, innerJoin, leftJoin, where };
}

/** Chaîne select → from → innerJoin → where (sans leftJoin, comme le bulletin). */
function joinChainNoLeft(finalRows: unknown[]) {
  const where = vi.fn().mockResolvedValue(finalRows);
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// GET /api/subjects
// ------------------------------------------------------------------
describe("GET /api/subjects", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/subjects");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (grades:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/subjects");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie 403 aux rôles sans aucune permission grades (COMPTABLE, ENSEIGNANT, AGENT)", async () => {
    for (const role of ["COMPTABLE", "ENSEIGNANT", "AGENT"]) {
      const session: FakeSession = {
        user: { id: `u-${role}`, role, email: `${role.toLowerCase()}@verger.sn`, name: role },
      };
      const res = await makeApp(session).request("/subjects");
      expect(res.status).toBe(403);
    }
  });

  it("renvoie la liste triée des matières sans re-seeder si non vide", async () => {
    const rows = [{ id: "anglais", name: "Anglais", coefficient: 2 }];
    const db = dbMock();
    db.query.subjects.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/subjects");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(db.query.subjects.findMany).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("seed automatiquement les 8 matières par défaut si la table est vide", async () => {
    const seeded = [
      { id: "math", name: "Mathématiques", coefficient: 4 },
      { id: "francais", name: "Français", coefficient: 4 },
    ];
    const db = dbMock();
    db.query.subjects.findMany
      .mockResolvedValueOnce([]) // 1er appel : vide → déclenche le seed
      .mockResolvedValueOnce(seeded); // 2e appel : après seed
    const inserted: Array<Record<string, unknown>> = [];
    const values = vi.fn((arg: Record<string, unknown>) => {
      inserted.push(arg);
      return {};
    });
    db.insert = vi.fn().mockReturnValue({ values });

    const res = await makeApp(ownerSession).request("/subjects");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(seeded);
    expect(db.insert).toHaveBeenCalledTimes(8);
    expect(inserted.map((s) => s.id)).toEqual([
      "math",
      "francais",
      "sciences",
      "histoire_geo",
      "anglais",
      "eps",
      "education_artistique",
      "instruction_civique",
    ]);
    expect(inserted[0]).toEqual({ id: "math", name: "Mathématiques", coefficient: 4 });
  });
});

// ------------------------------------------------------------------
// POST /api/subjects
// ------------------------------------------------------------------
describe("POST /api/subjects", () => {
  it("renvoie 400 sans nom", async () => {
    const res = await makeApp(ownerSession).request("/subjects", {
      method: "POST",
      body: JSON.stringify({ coefficient: 3 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Le nom est requis" });
  });

  it("renvoie 403 à une SECRETAIRE (grades:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/subjects", {
      method: "POST",
      body: JSON.stringify({ name: "Géométrie" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("crée une matière avec coefficient par défaut 1 et id uuid généré", async () => {
    const created = { id: "uuid-1", name: "Géométrie", coefficient: 1 };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/subjects", {
      method: "POST",
      body: JSON.stringify({ name: "Géométrie" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(captured?.name).toBe("Géométrie");
    expect(captured?.coefficient).toBe(1); // défaut appliqué
    expect(String(captured?.id)).toMatch(/^[0-9a-f-]{36}$/); // uuid généré
  });

  it("utilise l'id fourni et convertit le coefficient en nombre", async () => {
    const created = { id: "geom", name: "Géométrie", coefficient: 3 };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/subjects", {
      method: "POST",
      body: JSON.stringify({ id: "geom", name: "Géométrie", coefficient: "3" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captured?.id).toBe("geom");
    expect(captured?.coefficient).toBe(3); // Number("3")
  });
});

// ------------------------------------------------------------------
// PATCH /api/subjects/:id
// ------------------------------------------------------------------
describe("PATCH /api/subjects/:id", () => {
  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/subjects/s1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si la matière n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/subjects/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ name: "X" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Matière introuvable" });
  });

  it("ne met à jour que les champs fournis", async () => {
    const updated = { id: "math", name: "Mathématiques", coefficient: 5 };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/subjects/math", {
      method: "PATCH",
      body: JSON.stringify({ coefficient: 5 }), // nom absent → pas touché
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ coefficient: 5 });
  });
});

// ------------------------------------------------------------------
// DELETE /api/subjects/:id
// ------------------------------------------------------------------
describe("DELETE /api/subjects/:id", () => {
  it("renvoie 404 si la matière n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/subjects/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Matière introuvable" });
  });

  it("supprime une matière existante", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "eps" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/subjects/eps", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ------------------------------------------------------------------
// GET /api/grades
// ------------------------------------------------------------------
describe("GET /api/grades", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/grades");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (grades:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/grades");
    expect(res.status).toBe(403);
  });

  it("renvoie les notes avec l'élève inclus (with: { student: true })", async () => {
    const rows = [
      { id: "g1", studentId: "s1", subjectId: "math", value: "12.00", createdAt: "2026-08-01T08:00:00.000Z", student: {} },
    ];
    const db = dbMock();
    db.query.grades.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/grades?studentId=s1&trimester=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(db.query.grades.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ with: { student: true } })
    );
    expect(db.query.students.findMany).not.toHaveBeenCalled(); // pas de classId
  });

  it("filtre par classe : ne garde que les notes des élèves actifs de la classe", async () => {
    const rows = [
      { id: "g1", studentId: "s1", value: "12.00" },
      { id: "g2", studentId: "s3", value: "08.00" }, // hors classe
    ];
    const db = dbMock();
    db.query.grades.findMany.mockResolvedValue(rows);
    db.query.students.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

    const res = await makeApp(ownerSession).request("/grades?classId=c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([rows[0]]);
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
  });
});

// ------------------------------------------------------------------
// POST /api/grades
// ------------------------------------------------------------------
describe("POST /api/grades", () => {
  function insertCapturing(returningRowsPerCall: unknown[][]) {
    const captured: Array<Record<string, unknown>> = [];
    let call = 0;
    const returning = vi.fn(() =>
      Promise.resolve(returningRowsPerCall[Math.min(call++, returningRowsPerCall.length - 1)])
    );
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured.push(arg);
      return { returning };
    });
    return { captured, values };
  }

  it("renvoie 400 si le corps ne contient pas un tableau de notes", async () => {
    const res = await makeApp(ownerSession).request("/grades", {
      method: "POST",
      body: JSON.stringify({ grades: "pas-un-tableau" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Un tableau de notes est requis" });
  });

  it("renvoie 400 sans corps JSON", async () => {
    const res = await makeApp(ownerSession).request("/grades", {
      method: "POST",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("renvoie 403 à une SECRETAIRE (grades:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/grades", {
      method: "POST",
      body: JSON.stringify({ grades: [] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("insère les notes valides avec valeurs normalisées et respecte le schoolYear explicite", async () => {
    const { captured, values } = insertCapturing([[{ id: "g1" }], [{ id: "g2" }]]);
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/grades", {
      method: "POST",
      body: JSON.stringify({
        schoolYear: "2025-2026",
        grades: [
          { studentId: "s1", subjectId: "math", value: 12.5, trimester: 1 },
          { studentId: "s2", subjectId: "francais", value: "20", trimester: 2, teacherId: "t1", appreciation: "Très bien" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.created).toEqual([{ id: "g1" }, { id: "g2" }]);
    expect(captured[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      studentId: "s1",
      subjectId: "math",
      trimester: 1,
      value: "12.50", // toFixed(2)
      appreciation: null, // défaut
      teacherId: "", // défaut
      schoolYear: "2025-2026",
    });
    expect(captured[1]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      studentId: "s2",
      subjectId: "francais",
      trimester: 2,
      value: "20.00",
      appreciation: "Très bien",
      teacherId: "t1",
      schoolYear: "2025-2026",
    });
  });

  it("ignore silencieusement les entrées invalides (champ manquant, NaN, > 20, < 0)", async () => {
    const { captured, values } = insertCapturing([[{ id: "g1" }]]);
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/grades", {
      method: "POST",
      body: JSON.stringify({
        grades: [
          {}, // tout manque
          { studentId: "s1", subjectId: "math", value: "abc", trimester: 1 }, // NaN
          { studentId: "s1", subjectId: "math", value: 25, trimester: 1 }, // > 20
          { studentId: "s1", subjectId: "math", value: -1, trimester: 1 }, // < 0
          { studentId: "s1", subjectId: "math", value: 0, trimester: 1 }, // valide : zéro accepté
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(dbInsertCallCount(values)).toBe(1);
    expect(captured[0]?.value).toBe("0.00");
  });

  it("applique le schoolYear courant par défaut", async () => {
    const { captured, values } = insertCapturing([[{ id: "g1" }]]);
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/grades", {
      method: "POST",
      body: JSON.stringify({
        grades: [{ studentId: "s1", subjectId: "math", value: 10, trimester: 1 }],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captured[0]?.schoolYear).toBe(expectedSchoolYear());
  });
});

/** Compte les appels effectifs au values() d'insert. */
function dbInsertCallCount(values: ReturnType<typeof vi.fn>): number {
  return values.mock.calls.length;
}

// ------------------------------------------------------------------
// PATCH /api/grades/:id
// ------------------------------------------------------------------
describe("PATCH /api/grades/:id", () => {
  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/grades/g1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si la note n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/grades/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ value: 12 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Note introuvable" });
  });

  it("normalise tous les champs fournis (valeur toFixed(2), trimestre en nombre)", async () => {
    const updated = { id: "g1", value: "15.00" };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/grades/g1", {
      method: "PATCH",
      body: JSON.stringify({
        value: "15",
        appreciation: "Bien",
        subjectId: "math",
        trimester: "2",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({
      value: "15.00",
      appreciation: "Bien",
      subjectId: "math",
      trimester: 2,
    });
  });

  it("arrondit la valeur à 2 décimales et vide l'appréciation ('' → null)", async () => {
    const updated = { id: "g1", value: "14.57", appreciation: null };
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/grades/g1", {
      method: "PATCH",
      body: JSON.stringify({ value: 14.567, appreciation: "" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(capturedSet).toEqual({ value: "14.57", appreciation: null });
  });
});

// ------------------------------------------------------------------
// DELETE /api/grades/:id
// ------------------------------------------------------------------
describe("DELETE /api/grades/:id", () => {
  it("renvoie 404 si la note n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/grades/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Note introuvable" });
  });

  it("supprime une note existante", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "g1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/grades/g1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ------------------------------------------------------------------
// GET /api/grades/averages
// ------------------------------------------------------------------
describe("GET /api/grades/averages", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/grades/averages");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (grades:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/grades/averages");
    expect(res.status).toBe(403);
  });

  it("renvoie un tableau vide quand il n'y a aucune note", async () => {
    const { select } = joinChain([]);
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/grades/averages?classId=c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("calcule les moyennes pondérées par coefficient, trie et classe les élèves", async () => {
    // s1 : math (coef 4) moyenne (12+16)/2 = 14, français (coef 4) moyenne 10
    //      → générale (14×4 + 10×4)/8 = 12 — note en matière inconnue ignorée
    // s2 : math (coef 4) moyenne 18 → générale 18
    const allGrades = [
      { studentId: "s1", subjectId: "math", value: "12", studentFirstName: "Awa", studentLastName: "Diop", className: "CM2 A", levelName: "Primaire" },
      { studentId: "s1", subjectId: "math", value: "16", studentFirstName: "Awa", studentLastName: "Diop", className: "CM2 A", levelName: "Primaire" },
      { studentId: "s1", subjectId: "francais", value: "10", studentFirstName: "Awa", studentLastName: "Diop", className: "CM2 A", levelName: "Primaire" },
      { studentId: "s1", subjectId: "matiere_inconnue", value: "20", studentFirstName: "Awa", studentLastName: "Diop", className: "CM2 A", levelName: "Primaire" },
      { studentId: "s2", subjectId: "math", value: "18", studentFirstName: "Moussa", studentLastName: "Ndiaye", className: "CM2 B", levelName: "Primaire" },
    ];
    const { select } = joinChain(allGrades);
    const db = dbMock({ select });
    db.query.subjects.findMany.mockResolvedValue([
      { id: "math", name: "Mathématiques", coefficient: 4 },
      { id: "francais", name: "Français", coefficient: 4 },
    ]);

    const res = await makeApp(ownerSession).request("/grades/averages");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        studentId: "s2",
        firstName: "Moussa",
        lastName: "Ndiaye",
        className: "CM2 B",
        levelName: "Primaire",
        subjectAverages: [
          { subjectId: "math", subjectName: "Mathématiques", coefficient: 4, average: 18 },
        ],
        generalAverage: 18,
        rank: 1,
      },
      {
        studentId: "s1",
        firstName: "Awa",
        lastName: "Diop",
        className: "CM2 A",
        levelName: "Primaire",
        subjectAverages: [
          { subjectId: "math", subjectName: "Mathématiques", coefficient: 4, average: 14 },
          { subjectId: "francais", subjectName: "Français", coefficient: 4, average: 10 },
        ],
        generalAverage: 12,
        rank: 2,
      },
    ]);
  });
});

// ------------------------------------------------------------------
// GET /api/grades/bulletin
// ------------------------------------------------------------------
describe("GET /api/grades/bulletin", () => {
  /** Élève fictif renvoyé par findFirst. */
  const student = {
    id: "s1",
    matricule: "ELE-2025-001",
    firstName: "Awa",
    lastName: "Diop",
    classId: "c1",
    class: { name: "CM2 A", level: { name: "Primaire" } },
    parent: { name: "Fatou Fall" },
  };

  it("renvoie 400 sans studentId", async () => {
    dbMock();
    const res = await makeApp(ownerSession).request("/grades/bulletin");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "studentId requis" });
  });

  it("renvoie 404 si l'élève n'existe pas", async () => {
    dbMock(); // findFirst → null
    const res = await makeApp(ownerSession).request("/grades/bulletin?studentId=inconnu");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  it("calcule le bulletin complet : moyennes pondérées, moyenne de classe, rang et mentions", async () => {
    const db = dbMock();
    db.query.students.findFirst.mockResolvedValue(student);

    // Notes de l'élève : anglais 7 (coef 2), math (12+16)/2 = 14 (coef 4)
    db.query.grades.findMany.mockResolvedValue([
      { subjectId: "anglais", value: "7" },
      { subjectId: "math", value: "12" },
      { subjectId: "math", value: "16" },
    ]);

    // Matières triées par nom asc (comme le ferait la BDD)
    db.query.subjects.findMany.mockResolvedValue([
      { id: "anglais", name: "Anglais", coefficient: 2 },
      { id: "math", name: "Mathématiques", coefficient: 4 },
    ]);

    // Notes de toute la classe : ajoute s2 (math 10 seul)
    const classRows = [
      { studentId: "s1", subjectId: "math", value: "12" },
      { studentId: "s1", subjectId: "math", value: "16" },
      { studentId: "s1", subjectId: "anglais", value: "7" },
      { studentId: "s2", subjectId: "math", value: "10" },
    ];
    const { select } = joinChainNoLeft(classRows);
    db.select = select;

    // Calculs attendus :
    // - moyennes de classe par matière : math (14 + 10)/2 = 12 ; anglais 7
    // - général élève : (14×4 + 7×2)/6 = 70/6 = 11.666… → 11.67
    // - général s2 : (10×4)/4 = 10 → classement s1 = 1er sur 2
    // - moyenne de classe : (11.666… + 10)/2 = 10.833… → 10.83
    const res = await makeApp(ownerSession).request(
      "/grades/bulletin?studentId=s1&trimester=2&schoolYear=2025-2026"
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      student: {
        id: "s1",
        matricule: "ELE-2025-001",
        firstName: "Awa",
        lastName: "Diop",
        className: "CM2 A",
        levelName: "Primaire",
        parentName: "Fatou Fall",
      },
      trimester: 2,
      schoolYear: "2025-2026",
      subjects: [
        {
          subjectId: "anglais",
          subjectName: "Anglais",
          coefficient: 2,
          average: 7,
          classAverage: 7,
          appreciation: "Très insuffisant", // 7 < 8
        },
        {
          subjectId: "math",
          subjectName: "Mathématiques",
          coefficient: 4,
          average: 14,
          classAverage: 12,
          appreciation: "Bien", // 14 ≥ 14
        },
      ],
      generalAverage: 11.67,
      classAverage: 10.83,
      rank: 1,
      totalStudents: 2,
    });

    // La fiche élève charge bien classe+niveau+parent
    expect(db.query.students.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { class: { with: { level: true } }, parent: true },
      })
    );
  });

  it("couvre toutes les mentions de la barème (18→Excellent … 5→Très insuffisant)", async () => {
    const db = dbMock();
    db.query.students.findFirst.mockResolvedValue(student);

    const values: Record<string, number> = {
      a: 18,
      b: 16,
      c: 14,
      d: 12,
      e: 10,
      f: 8,
      g: 5,
    };
    db.query.grades.findMany.mockResolvedValue(
      Object.entries(values).map(([subjectId, value]) => ({ subjectId, value: String(value) }))
    );
    db.query.subjects.findMany.mockResolvedValue(
      ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({
        id,
        name: id.toUpperCase(),
        coefficient: 1,
      }))
    );

    // Mêmes notes pour toute la classe (élève seul) → rang 1/1, moyenne de classe égale
    const chain = joinChainNoLeft(
      Object.entries(values).map(([subjectId, value]) => ({
        studentId: "s1",
        subjectId,
        value: String(value),
      }))
    );
    db.select = chain.select;

    const res = await makeApp(ownerSession).request("/grades/bulletin?studentId=s1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects.map((s: { appreciation: string }) => s.appreciation)).toEqual([
      "Excellent",
      "Très bien",
      "Bien",
      "Assez bien",
      "Passable",
      "Insuffisant",
      "Très insuffisant",
    ]);
    // (18+16+14+12+10+8+5)/7 = 83/7 = 11.857… → 11.86 ; élève seul → rang 1/1
    expect(body.generalAverage).toBeCloseTo(11.86, 2);
    expect(body.classAverage).toBeCloseTo(11.86, 2);
    expect(body.rank).toBe(1);
    expect(body.totalStudents).toBe(1);
  });
});
