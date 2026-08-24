/**
 * Tests unitaires du routeur payments (paiements).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Module multi-rôles :
 * - PROPRIETAIRE : tout
 * - SECRETAIRE   : read/create/update/delete (PAS stats)
 * - COMPTABLE    : read/delete/stats (PAS create ni update)
 * - ENSEIGNANT / AGENT : rien ici
 *
 * Bizarrerie source : POST diffuse une notification via fetch(`${origin}/api/broadcast`)
 * → fetch global est stubbé (l'appel réel serait non bloquant mais indésirable en test).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { paymentsRoutes } from "../../src/lib/api/routes/payments";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", paymentsRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};
const comptableSession: FakeSession = {
  user: { id: "u-compta", role: "COMPTABLE", email: "compta@verger.sn", name: "Comptable" },
};
const enseignantSession: FakeSession = {
  user: { id: "u-ens", role: "ENSEIGNANT", email: "ens@verger.sn", name: "Enseignant" },
};
const agentSession: FakeSession = {
  user: { id: "u-agent", role: "AGENT", email: "agent@verger.sn", name: "Agent" },
};

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      payments: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function validPaymentBody() {
  return { studentId: "s1", amount: 10000, method: "ESPECES", month: "2026-08" };
}

// ------------------------------------------------------------------
// GET /api/payments
// ------------------------------------------------------------------
describe("GET /api/payments", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/payments");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à un ENSEIGNANT (aucune permission)", async () => {
    const res = await makeApp(enseignantSession).request("/payments");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie 403 à un AGENT (travel uniquement)", async () => {
    const res = await makeApp(agentSession).request("/payments");
    expect(res.status).toBe(403);
  });

  it("autorise la lecture à la SECRETAIRE (payments:read)", async () => {
    const rows = [
      { id: "p1", amount: "10000", status: "VALIDE", student: { class: { level: {} }, parent: {} } },
    ];
    const countWhere = vi.fn().mockResolvedValue([{ n: 1 }]);
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: countWhere }),
    });
    const db = dbMock({ select });
    db.query.payments.findMany.mockResolvedValue(rows);

    const res = await makeApp(secretaireSession).request("/payments");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 1, limit: 500, offset: 0 });
  });

  it("renvoie la liste paginée au PROPRIETAIRE avec total issu du count SQL", async () => {
    const rows = [
      { id: "p1", amount: "10000", status: "VALIDE", student: {} },
      { id: "p2", amount: "5000", status: "EN_ATTENTE", student: {} },
    ];
    const selectWhere = vi.fn().mockResolvedValue([{ n: 42 }]);
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: selectWhere }),
    });
    const db = dbMock({ select });
    db.query.payments.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/payments?limit=2&offset=10");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 42, limit: 2, offset: 10 });
    // findMany reçoit bien la page demandée, plafonnée à 500
    const findManyArg = db.query.payments.findMany.mock.calls[0][0];
    expect(findManyArg.limit).toBe(2);
    expect(findManyArg.offset).toBe(10);
  });

  it("plafonne limit à 500 et applique les défauts", async () => {
    const selectWhere = vi.fn().mockResolvedValue([{ n: 0 }]);
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: selectWhere }),
    });
    const db = dbMock({ select });
    db.query.payments.findMany.mockResolvedValue([]);

    const res = await makeApp(ownerSession).request("/payments?limit=9999");
    expect(res.status).toBe(200);
    const findManyArg = db.query.payments.findMany.mock.calls[0][0];
    expect(findManyArg.limit).toBe(500);
    expect(findManyArg.offset).toBe(0);
    expect(await res.json()).toEqual({ data: [], total: 0, limit: 500, offset: 0 });
  });

  it("court-circuite avec liste vide si la classe ne contient aucun élève (classId)", async () => {
    const { select } = selectViaWhere([]); // aucun élève dans la classe
    const db = dbMock({ select });

    const res = await makeApp(ownerSession).request("/payments?classId=c-vide");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], total: 0 });
    expect(db.query.payments.findMany).not.toHaveBeenCalled();
  });

  it("résout les élèves de la classe avant findMany quand classId fourni", async () => {
    // select appelé 2× : 1) sous-select des élèves de la classe, 2) count du total
    const where = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve([{ id: "s1" }, { id: "s2" }]))
      .mockImplementation(() => Promise.resolve([{ n: 3 }]));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const db = dbMock({ select });
    db.query.payments.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);

    const res = await makeApp(ownerSession).request("/payments?classId=c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      total: 3,
      limit: 500,
      offset: 0,
    });
    expect(select).toHaveBeenCalledTimes(2);
    expect(db.query.payments.findMany).toHaveBeenCalledOnce();
  });
});

// ------------------------------------------------------------------
// POST /api/payments
// ------------------------------------------------------------------
describe("POST /api/payments", () => {
  function setupCreation(élève = { id: "s1", firstName: "Awa", lastName: "Diop" }) {
    const created = { id: "p-new", amount: "10000", status: "EN_ATTENTE" };
    const returning = vi.fn().mockResolvedValue([created]);
    const values = vi.fn((arg: Record<string, unknown>) => ({ returning }));
    const db = dbMock({
      insert: vi.fn().mockReturnValue({ values }),
    });
    db.query.students.findFirst.mockResolvedValue(élève);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    return { db, fetchMock, created, values };
  }

  it("renvoie 400 si champs requis manquants", async () => {
    const res = await makeApp(ownerSession).request("/payments", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", amount: 10000 }), // method + month manquants
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Élève, montant, méthode et mois sont requis" });
  });

  it("renvoie 404 si l'élève n'existe pas", async () => {
    dbMock(); // students.findFirst → null par défaut

    const res = await makeApp(ownerSession).request("/payments", {
      method: "POST",
      body: JSON.stringify(validPaymentBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  it("renvoie 403 au COMPTABLE (payments:create refusé)", async () => {
    // Nuance clé : le comptable lit et supprime, mais ne crée pas
    const res = await makeApp(comptableSession).request("/payments", {
      method: "POST",
      body: JSON.stringify(validPaymentBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("crée un paiement à la SECRETAIRE avec secretaryId = son identifiant", async () => {
    const { values } = setupCreation();

    const res = await makeApp(secretaireSession).request("/payments", {
      method: "POST",
      body: JSON.stringify(validPaymentBody()),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "p-new", amount: "10000", status: "EN_ATTENTE" });
    const paiement = values.mock.calls[0][0];
    expect(paiement.secretaryId).toBe("u-sec"); // l'auteur du paiement est tracé
    expect(paiement.amount).toBe("10000"); // montant typé en string
    expect(paiement.status).toBe("EN_ATTENTE"); // statut par défaut
    expect(paiement.reference).toBeNull();
    expect(paiement.notes).toBeNull();
    expect(String(paiement.id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("transmet statut, référence et notes fournis", async () => {
    const { values } = setupCreation();

    const res = await makeApp(ownerSession).request("/payments", {
      method: "POST",
      body: JSON.stringify({
        ...validPaymentBody(),
        status: "VALIDE",
        reference: "OM-123456",
        notes: "Versement espèces",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    const paiement = values.mock.calls[0][0];
    expect(paiement.status).toBe("VALIDE");
    expect(paiement.reference).toBe("OM-123456");
    expect(paiement.notes).toBe("Versement espèces");
  });

  it("diffuse une notification broadcast PAIEMENT sans bloquer la réponse", async () => {
    const { fetchMock } = setupCreation();

    const res = await makeApp(ownerSession).request("/payments", {
      method: "POST",
      body: JSON.stringify(validPaymentBody()),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/broadcast");
    const payload = JSON.parse(init.body);
    expect(payload.type).toBe("PAIEMENT");
    expect(payload.data.paymentId).toBe("p-new");
    expect(payload.data.studentId).toBe("s1");
    expect(payload.message).toContain("Awa Diop");
    expect(payload.message).toContain(
      new Intl.NumberFormat("fr-FR").format(10000) // même formatage que la route
    );
  });
});

// ------------------------------------------------------------------
// PATCH /api/payments/:id
// ------------------------------------------------------------------
describe("PATCH /api/payments/:id", () => {
  it("renvoie 400 si le statut manque", async () => {
    const res = await makeApp(ownerSession).request("/payments/p1", {
      method: "PATCH",
      body: JSON.stringify({ amount: 999 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Le statut est requis" });
  });

  it("renvoie 400 pour un statut autre que VALIDE ou ANNULE", async () => {
    const res = await makeApp(ownerSession).request("/payments/p1", {
      method: "PATCH",
      body: JSON.stringify({ status: "VALIDÉ" }), // accent interdit !
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Statut invalide. Utilisez VALIDE ou ANNULE",
    });
  });

  it("renvoie 403 au COMPTABLE (payments:update refusé)", async () => {
    const res = await makeApp(comptableSession).request("/payments/p1", {
      method: "PATCH",
      body: JSON.stringify({ status: "VALIDE" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si le paiement n'existe pas", async () => {
    dbMock(); // payments.findFirst → null

    const res = await makeApp(secretaireSession).request("/payments/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ status: "VALIDE" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Paiement introuvable" });
  });

  it("valide un paiement existant (set limité au statut)", async () => {
    const current = { id: "p1", status: "EN_ATTENTE", student: { id: "s1" } };
    const updated = { id: "p1", status: "VALIDE" };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where: vi.fn().mockReturnValue({ returning }) };
    });
    const db = dbMock({ update: vi.fn().mockReturnValue({ set }) });
    db.query.payments.findFirst.mockResolvedValue(current);

    const res = await makeApp(secretaireSession).request("/payments/p1", {
      method: "PATCH",
      body: JSON.stringify({ status: "VALIDE" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ status: "VALIDE" }); // seul le statut passe au set
  });
});

// ------------------------------------------------------------------
// GET /api/payments/stats — sommes calculées en JS, vérifiées numériquement
// ------------------------------------------------------------------
describe("GET /api/payments/stats", () => {
  function statsRows() {
    return [
      { id: "p1", amount: "10000.50", status: "VALIDE", method: "ESPECES", month: "2026-08" },
      { id: "p2", amount: "25000", status: "VALIDE", method: "MOBILE_MONEY", month: "2026-08" },
      { id: "p3", amount: "5000", status: "EN_ATTENTE", method: "ESPECES", month: "2026-08" },
      { id: "p4", amount: "1000", status: "ANNULE", method: "VIREMENT", month: "2026-08" },
    ];
  }

  it("renvoie 403 à la SECRETAIRE bien qu'elle gère les paiements (payments:stats refusé)", async () => {
    // Nuance inverse de POST/PATCH : elle a CRUD mais PAS stats
    const res = await makeApp(secretaireSession).request("/payments/stats");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("calcule totaux, comptes et répartition par méthode depuis findMany", async () => {
    const db = dbMock();
    db.query.payments.findMany.mockResolvedValue(statsRows());

    const res = await makeApp(ownerSession).request("/payments/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalValide: 35000.5, // 10000.50 + 25000
      totalEnAttente: 5000,
      totalAnnule: 1000,
      countValide: 2,
      countEnAttente: 1,
      countAnnule: 1,
      byMethod: {
        ESPECES: { count: 1, total: 10000.5 },
        MOBILE_MONEY: { count: 1, total: 25000 },
        // VIREMENT absent : le paiement annulé est exclu de la répartition
      },
      totalPayments: 4,
    });
  });

  it("renvoie 200 au COMPTABLE (payments:stats autorisé) avec zéros si vide", async () => {
    // Nuance clé : le comptable ne peut PAS créer mais consulte les stats
    const db = dbMock();
    db.query.payments.findMany.mockResolvedValue([]);

    const res = await makeApp(comptableSession).request("/payments/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalValide: 0,
      totalEnAttente: 0,
      totalAnnule: 0,
      countValide: 0,
      countEnAttente: 0,
      countAnnule: 0,
      byMethod: {},
      totalPayments: 0,
    });
  });

  it("interroge findMany une fois même avec filtres month/classId", async () => {
    const selectWhere = vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: selectWhere }),
    });
    const db = dbMock({ select });
    db.query.payments.findMany.mockResolvedValue(statsRows());

    const res = await makeApp(ownerSession).request("/payments/stats?month=2026-08&classId=c1");
    expect(res.status).toBe(200);
    expect(db.query.payments.findMany).toHaveBeenCalledOnce();
    // Le filtrage par classe passe par le sous-select des élèves de la classe
    expect(db.select).toHaveBeenCalledOnce();
  });
});

// ------------------------------------------------------------------
// GET /api/payments/unpaid
// ------------------------------------------------------------------
describe("GET /api/payments/unpaid", () => {
  it("renvoie 400 sans paramètre month", async () => {
    dbMock();

    const res = await makeApp(ownerSession).request("/payments/unpaid");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Le paramètre 'month' est requis" });
  });

  it("exclut les élèves déjà payés et renvoie le mois interrogé", async () => {
    const unpaid = [
      { id: "s2", firstName: "Moussa", class: { level: {} }, parent: {} },
    ];
    const { select } = selectViaWhere([{ studentId: "s1" }]); // s1 a payé (VALIDE)
    const db = dbMock({ select });
    db.query.students.findMany.mockResolvedValue(unpaid);

    const res = await makeApp(ownerSession).request("/payments/unpaid?month=2026-08");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: unpaid, total: 1, month: "2026-08" });
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
  });

  it("liste tous les élèves actifs quand personne n'a payé (notInArray omis)", async () => {
    const { select } = selectViaWhere([]); // aucun paiement VALIDE
    const db = dbMock({ select });
    db.query.students.findMany.mockResolvedValue([
      { id: "s1", class: {}, parent: {} },
      { id: "s2", class: {}, parent: {} },
    ]);

    const res = await makeApp(ownerSession).request("/payments/unpaid?month=2026-09&classId=c1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.month).toBe("2026-09");
    expect(db.query.students.findMany).toHaveBeenCalledOnce();
  });

  it("reste accessible à la SECRETAIRE (payments:read)", async () => {
    const { select } = selectViaWhere([]);
    const db = dbMock({ select });
    db.query.students.findMany.mockResolvedValue([]);

    const res = await makeApp(secretaireSession).request("/payments/unpaid?month=2026-08");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], total: 0, month: "2026-08" });
  });
});
