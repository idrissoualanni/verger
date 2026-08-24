/**
 * Tests unitaires du routeur absences.
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Bizarreries source :
 * - POST /absences renvoie le TABLEAU complet créé (pas created[0]).
 * - POST /absences/notify est une SIMULATION WhatsApp : Math.random() < 0.9,
 *   aucun fetch externe ; en cas de succès il fait un update sans .returning()
 *   (le .where() est donc directement attendu comme promesse).
 * - GET /absences/stats enchaîne QUATRE select().from().where() attendus sur where.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { absencesRoutes } from "../../src/lib/api/routes/absences";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", absencesRoutes);
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
      absences: { findMany: vi.fn().mockResolvedValue([]) },
      students: { findMany: vi.fn().mockResolvedValue([]) },
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

/** Chaîne select → from → where résolue N fois avec des compteurs successifs (stats). */
function statsCounts(counts: unknown[]) {
  const where = vi.fn();
  counts.forEach((c) => where.mockResolvedValueOnce([{ count: c }]));
  const from = vi.fn().mockReturnValue({ where });
  return dbMock({ select: vi.fn().mockReturnValue({ from }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// GET /api/absences
// ------------------------------------------------------------------
describe("GET /api/absences", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/absences");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (absences:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/absences");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste avec élève, classe et parent inclus", async () => {
    const rows = [
      {
        id: "a1",
        date: "2026-08-20",
        student: { firstName: "Awa", class: {}, parent: {} },
      },
    ];
    const db = dbMock();
    db.query.absences.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/absences");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 1 });
    expect(db.query.absences.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { student: { with: { class: true, parent: true } } },
      })
    );
  });

  it("résout d'abord les élèves de la classe quand classId est fourni", async () => {
    const rows = [{ id: "a1" }];
    const db = dbMock();
    db.query.students.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    db.query.absences.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/absences?classId=c1");
    expect(res.status).toBe(200);
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
    expect(db.query.absences.findMany).toHaveBeenCalledOnce();
  });

  it("renvoie une liste vide sans requête absences si la classe n'a pas d'élèves", async () => {
    const db = dbMock(); // students.findMany → [] par défaut

    const res = await makeApp(ownerSession).request("/absences?classId=c-vide");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], total: 0 });
    expect(db.query.absences.findMany).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------
// POST /api/absences
// ------------------------------------------------------------------
describe("POST /api/absences", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/absences", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", date: "2026-08-20" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("renvoie 403 à une SECRETAIRE (absences:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/absences", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", date: "2026-08-20" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/absences", {
      method: "POST",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 400 si aucune absence valide (studentId et date requis)", async () => {
    const res = await makeApp(ownerSession).request("/absences", {
      method: "POST",
      body: JSON.stringify([{ studentId: "s1" }, { date: "2026-08-20" }]),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "studentId et date sont requis pour chaque absence",
    });
  });

  it("crée une absence avec défauts notified=false / justified=false / reason=null", async () => {
    const created = { id: "a-new", studentId: "s1", date: "2026-08-20" };
    const returning = vi.fn().mockResolvedValue([created]);
    // Bizarrerie : values() reçoit toujours un TABLEAU, même pour un corps objet unique
    let capturedList: Record<string, unknown>[] | undefined;
    const values = vi.fn((arg: Record<string, unknown>[]) => {
      capturedList = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/absences", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", date: "2026-08-20" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    // Le routeur renvoie le TABLEAU créé, pas created[0]
    expect(await res.json()).toEqual([created]);
    expect(capturedList).toHaveLength(1);
    const first = capturedList?.[0];
    expect(first?.studentId).toBe("s1");
    expect(first?.date).toBe("2026-08-20");
    expect(first?.reason).toBeNull();
    expect(first?.justified).toBe(false);
    expect(first?.notified).toBe(false);
    expect(String(first?.id)).toMatch(/^[0-9a-f-]{36}$/); // uuid généré
  });

  it("crée plusieurs absences depuis un tableau (batch)", async () => {
    const created = [
      { id: "a1", studentId: "s1", date: "2026-08-20" },
      { id: "a2", studentId: "s2", date: "2026-08-21", reason: "Maladie" },
    ];
    const returning = vi.fn().mockResolvedValue(created);
    let captured: Record<string, unknown>[] | undefined;
    const values = vi.fn((arg: Record<string, unknown>[]) => {
      captured = arg;
      return { returning };
    });
    dbMock({
      insert: vi.fn().mockImplementation(() => ({ values })),
    });

    const res = await makeApp(ownerSession).request("/absences", {
      method: "POST",
      body: JSON.stringify([
        { studentId: "s1", date: "2026-08-20" },
        { studentId: "s2", date: "2026-08-21", reason: "Maladie", justified: true },
      ]),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(captured).toHaveLength(2);
    expect(captured?.[1]?.justified).toBe(true);
    expect(captured?.[1]?.reason).toBe("Maladie");
  });
});

// ------------------------------------------------------------------
// PATCH /api/absences/:id
// ------------------------------------------------------------------
describe("PATCH /api/absences/:id", () => {
  function patchChains(updatedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updatedRows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    return dbMock({ update: vi.fn().mockReturnValue({ set }) });
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/absences/a1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si l'absence n'existe pas", async () => {
    patchChains([]);

    const res = await makeApp(ownerSession).request("/absences/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ justified: true }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Absence introuvable" });
  });

  it("justifie une absence existante (set { justified: true } uniquement)", async () => {
    const updated = { id: "a1", justified: true };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/absences/a1", {
      method: "PATCH",
      body: JSON.stringify({ justified: true }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ justified: true }); // champs non fournis absents du set
  });

  it("convertit une raison vide en null", async () => {
    const updated = { id: "a1", reason: null };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/absences/a1", {
      method: "PATCH",
      body: JSON.stringify({ reason: "" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(capturedSet).toEqual({ reason: null });
  });
});

// ------------------------------------------------------------------
// DELETE /api/absences/:id
// ------------------------------------------------------------------
describe("DELETE /api/absences/:id", () => {
  it("renvoie 404 si l'absence n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/absences/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Absence introuvable" });
  });

  it("supprime une absence existante", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "a1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/absences/a1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ------------------------------------------------------------------
// GET /api/absences/stats
// ------------------------------------------------------------------
describe("GET /api/absences/stats", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/absences/stats");
    expect(res.status).toBe(401);
  });

  it("renvoie 403 à une SECRETAIRE (absences:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/absences/stats");
    expect(res.status).toBe(403);
  });

  it("renvoie les quatre compteurs convertis en nombres", async () => {
    statsCounts(["10", 4, "6", 2]); // total / justifiées / non justifiées / notifiées

    const res = await makeApp(ownerSession).request("/absences/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 10,
      justified: 4,
      unjustified: 6,
      notified: 2,
    });
  });

  it("retombe à 0 si un compteur est absent ou nul", async () => {
    statsCounts([null, undefined, "0", 5]);

    const res = await makeApp(ownerSession).request("/absences/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 0,
      justified: 0,
      unjustified: 0,
      notified: 5,
    });
  });

  it("filtre par classe via les élèves de la classe", async () => {
    const db = statsCounts([3, 1, 2, 0]);
    db.query.students.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

    const res = await makeApp(ownerSession).request("/absences/stats?classId=c1&month=2026-08");
    expect(res.status).toBe(200);
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
    expect(db.query.students.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });
});

// ------------------------------------------------------------------
// POST /api/absences/notify — simulation WhatsApp (Math.random), pas de fetch
// ------------------------------------------------------------------
describe("POST /api/absences/notify", () => {
  function updateChains() {
    const where = vi.fn().mockResolvedValue(undefined); // update sans .returning()
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    return { update, set, where };
  }

  it("renvoie 403 à une SECRETAIRE (absences:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: ["a1"] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 400 si absenceIds manque ou n'est pas un tableau", async () => {
    const resSansChamp = await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    expect(resSansChamp.status).toBe(400);
    expect(await resSansChamp.json()).toEqual({ error: "absenceIds (array) requis" });

    const resPasTableau = await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: "a1" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(resPasTableau.status).toBe(400);
    expect(await resPasTableau.json()).toEqual({ error: "absenceIds (array) requis" });
  });

  it("envoie à tous les parents trouvés et marque les absences comme notifiées", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // < 0.9 → succès partout
    const chains = updateChains();
    const db = dbMock({ update: chains.update });
    db.query.absences.findMany.mockResolvedValue([
      {
        id: "a1",
        student: { firstName: "Awa", lastName: "Diop", parent: { phone: "+221770000001" } },
      },
      {
        id: "a2",
        student: { firstName: "Moussa", lastName: "Ndiaye", parent: null }, // pas de parent → "N/A"
      },
    ]);

    const res = await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: ["a1", "a2"] }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: 2,
      failed: 0,
      details: [
        { absenceId: "a1", studentName: "Awa Diop", parentPhone: "+221770000001", success: true },
        { absenceId: "a2", studentName: "Moussa Ndiaye", parentPhone: "N/A", success: true },
      ],
      total: 2,
    });
    // Un update notified:true par absence envoyée
    expect(chains.set).toHaveBeenCalledTimes(2);
    expect(chains.set).toHaveBeenCalledWith({ notified: true });
    expect(chains.where).toHaveBeenCalledTimes(2);
  });

  it("n'incrémente rien et ne met pas à jour quand l'envoi échoue (random >= 0.9)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.95); // >= 0.9 → échec
    const chains = updateChains();
    const db = dbMock({ update: chains.update });
    db.query.absences.findMany.mockResolvedValue([
      {
        id: "a1",
        student: { firstName: "Awa", lastName: "Diop", parent: { phone: "+221770000001" } },
      },
    ]);

    const res = await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: ["a1"] }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: 0,
      failed: 1,
      details: [
        { absenceId: "a1", studentName: "Awa Diop", parentPhone: "+221770000001", success: false },
      ],
      total: 1,
    });
    expect(chains.update).not.toHaveBeenCalled();
  });

  it("renvoie des compteurs nuls si aucune absence correspondante", async () => {
    const chains = updateChains();
    const db = dbMock({ update: chains.update }); // findMany → [] par défaut

    const res = await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: ["inconnu"] }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, failed: 0, details: [], total: 1 });
    expect(chains.update).not.toHaveBeenCalled();
  });

  it("interroge les absences avec élève et parent inclus", async () => {
    const db = dbMock();

    await makeApp(ownerSession).request("/absences/notify", {
      method: "POST",
      body: JSON.stringify({ absenceIds: ["a1"] }),
      headers: { "Content-Type": "application/json" },
    });

    expect(db.query.absences.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { student: { with: { parent: true } } },
      })
    );
  });
});
