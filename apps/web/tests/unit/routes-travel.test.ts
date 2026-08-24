/**
 * Tests unitaires du routeur travel (agences + candidatures + stats).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * NUANCE RBAC : l'AGENT ne possède QUE travel:read/create/update/delete —
 * il doit donc avoir 200 sur le CRUD travel mais 403 partout ailleurs
 * (ex : students). Vérifié via un app combinant les deux routeurs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { travelRoutes } from "../../src/lib/api/routes/travel";
import { studentsRoutes } from "../../src/lib/api/routes/students";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession, combinedWithStudents = false) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", travelRoutes);
  if (combinedWithStudents) app.route("/", studentsRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};
const agentSession: FakeSession = {
  user: { id: "u-agent", role: "AGENT", email: "agent@verger.sn", name: "Agent" },
};
const enseignantSession: FakeSession = {
  user: { id: "u-ens", role: "ENSEIGNANT", email: "ens@verger.sn", name: "Enseignant" },
};

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      travelAgencies: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      applications: {
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

/** Chaîne select → from → where (awaited sur where), résultats en file d'attente. */
function selectWhereQueue(rowsPerCall: unknown[][]) {
  let i = 0;
  const where = vi.fn(() => Promise.resolve(rowsPerCall[i++] ?? []));
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// GET /api/travel/agencies
// ------------------------------------------------------------------
describe("GET /api/travel/agencies", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/travel/agencies");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (travel:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/travel/agencies");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste des agences au PROPRIETAIRE sans filtre (where undefined)", async () => {
    const rows = [
      { id: "a1", name: "Agence Teranga", phone: "+221770000001" },
      { id: "a2", name: "Voyage Express", phone: "+221770000002" },
    ];
    const db = dbMock();
    db.query.travelAgencies.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/travel/agencies");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);

    const arg = db.query.travelAgencies.findMany.mock.calls[0][0];
    expect(arg.where).toBeUndefined();
    expect(arg.orderBy).toHaveLength(1);
  });

  it("transmet une condition when isActive est fourni en query", async () => {
    const db = dbMock();
    db.query.travelAgencies.findMany.mockResolvedValue([]);

    const res = await makeApp(ownerSession).request("/travel/agencies?isActive=true");
    expect(res.status).toBe(200);

    const arg = db.query.travelAgencies.findMany.mock.calls[0][0];
    expect(arg.where).toBeDefined();
  });
});

// ------------------------------------------------------------------
// POST /api/travel/agencies
// ------------------------------------------------------------------
describe("POST /api/travel/agencies", () => {
  function insertChain(captured?: Record<string, unknown>) {
    const returning = vi.fn().mockResolvedValue([{ id: "a-new", name: "capturé" }]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      if (captured) Object.assign(captured, arg);
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });
    return { values, returning };
  }

  it("renvoie 400 si le nom ou le téléphone manque", async () => {
    const res = await makeApp(ownerSession).request("/travel/agencies", {
      method: "POST",
      body: JSON.stringify({ name: "Agence sans téléphone" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nom et téléphone sont requis" });
  });

  it("crée une agence avec les champs optionnels à null et isActive true par défaut", async () => {
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await makeApp(ownerSession).request("/travel/agencies", {
      method: "POST",
      body: JSON.stringify({ name: "Agence Teranga", phone: "+221770000001" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "a-new", name: "capturé" });
    expect(String(captured.id)).toMatch(/^[0-9a-f-]{36}$/); // uuid généré
    expect(captured.name).toBe("Agence Teranga");
    expect(captured.phone).toBe("+221770000001");
    expect(captured.contactName).toBeNull();
    expect(captured.email).toBeNull();
    expect(captured.address).toBeNull();
    expect(captured.services).toBeNull();
    expect(captured.isActive).toBe(true);
  });

  it("respecte les champs fournis : contactName, email, services et isActive false", async () => {
    const captured: Record<string, unknown> = {};
    const { returning } = insertChain(captured);

    const res = await makeApp(ownerSession).request("/travel/agencies", {
      method: "POST",
      body: JSON.stringify({
        name: "Voyage Express",
        phone: "+221770000002",
        contactName: "Fatou Fall",
        email: "contact@voyage.sn",
        address: "Dakar",
        services: "Visas, billets",
        isActive: false,
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(returning).toHaveBeenCalledOnce();
    expect(captured.contactName).toBe("Fatou Fall");
    expect(captured.email).toBe("contact@voyage.sn");
    expect(captured.address).toBe("Dakar");
    expect(captured.services).toBe("Visas, billets");
    expect(captured.isActive).toBe(false);
  });
});

// ------------------------------------------------------------------
// PATCH /api/travel/agencies/:id
// ------------------------------------------------------------------
describe("PATCH /api/travel/agencies/:id", () => {
  function updateChain(updatedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updatedRows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });
    return { set, where, returning };
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/travel/agencies/a1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si l'agence n'existe pas", async () => {
    updateChain([]);
    const res = await makeApp(ownerSession).request("/travel/agencies/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ name: "X" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Agence introuvable" });
  });

  it("ne met à jour que les champs fournis (phone seul)", async () => {
    const updated = { id: "a1", name: "Agence Teranga", phone: "+221781234567" };
    let capturedSet: Record<string, unknown> | undefined;
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/travel/agencies/a1", {
      method: "PATCH",
      body: JSON.stringify({ phone: "+221781234567" }), // un seul champ
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ phone: "+221781234567" });
  });

  it("peut désactiver une agence (isActive false) et vider un champ optionnel (email vide → null)", async () => {
    const updated = { id: "a1", isActive: false, email: null };
    let capturedSet: Record<string, unknown> | undefined;
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/travel/agencies/a1", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false, email: "" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(capturedSet?.isActive).toBe(false);
    expect(capturedSet?.email).toBeNull(); // chaîne vide → null
  });
});

// ------------------------------------------------------------------
// GET /api/travel/applications
// ------------------------------------------------------------------
describe("GET /api/travel/applications", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/travel/applications");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie les candidatures avec étudiant et agence inclus (data + total)", async () => {
    const rows = [
      { id: "ap1", status: "EN_ATTENTE", student: {}, agency: {} },
      { id: "ap2", status: "ACCEPTE", student: {}, agency: {} },
    ];
    const db = dbMock();
    db.query.applications.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/travel/applications");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 2 });

    const arg = db.query.applications.findMany.mock.calls[0][0];
    expect(arg.with).toEqual({ student: true, agency: true });
    expect(arg.where).toBeUndefined();
  });

  it("construit une condition when des filtres studentId/agencyId/status sont passés", async () => {
    const db = dbMock();
    db.query.applications.findMany.mockResolvedValue([]);

    const res = await makeApp(ownerSession).request(
      "/travel/applications?studentId=s1&agencyId=a1&status=ACCEPTE"
    );
    expect(res.status).toBe(200);

    const arg = db.query.applications.findMany.mock.calls[0][0];
    expect(arg.where).toBeDefined();
    expect(await res.json()).toEqual({ data: [], total: 0 });
  });
});

// ------------------------------------------------------------------
// POST /api/travel/applications
// ------------------------------------------------------------------
describe("POST /api/travel/applications", () => {
  function insertChain(captured?: Record<string, unknown>) {
    const returning = vi.fn().mockResolvedValue([{ id: "ap-new" }]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      if (captured) Object.assign(captured, arg);
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });
    return returning;
  }

  it("renvoie 400 si studentId ou agencyId manque", async () => {
    const res = await makeApp(ownerSession).request("/travel/applications", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1" }), // agencyId manquant
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "studentId et agencyId sont requis" });
  });

  it("crée une candidature avec statut par défaut EN_ATTENTE et notes null", async () => {
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await makeApp(ownerSession).request("/travel/applications", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", agencyId: "a1" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "ap-new" });
    expect(String(captured.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(captured.studentId).toBe("s1");
    expect(captured.agencyId).toBe("a1");
    expect(captured.status).toBe("EN_ATTENTE"); // défaut
    expect(captured.notes).toBeNull();
  });

  it("respecte le statut et les notes fournis", async () => {
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await makeApp(ownerSession).request("/travel/applications", {
      method: "POST",
      body: JSON.stringify({
        studentId: "s2",
        agencyId: "a2",
        status: "ACCEPTE",
        notes: "Dossier complet",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captured.status).toBe("ACCEPTE");
    expect(captured.notes).toBe("Dossier complet");
  });
});

// ------------------------------------------------------------------
// PATCH /api/travel/applications/:id
// ------------------------------------------------------------------
describe("PATCH /api/travel/applications/:id", () => {
  function updateChain(updatedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updatedRows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });
    return { set };
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/travel/applications/ap1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 400 si aucun champ modifiable n'est fourni", async () => {
    updateChain([]);
    const res = await makeApp(ownerSession).request("/travel/applications/ap1", {
      method: "PATCH",
      body: JSON.stringify({}), // ni status ni notes
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Aucun champ à modifier" });
  });

  it("renvoie 404 si la candidature n'existe pas", async () => {
    updateChain([]);
    const res = await makeApp(ownerSession).request("/travel/applications/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ status: "REFUSE" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Candidature introuvable" });
  });

  it("met à jour le statut et les notes (chaîne vide → null)", async () => {
    const updated = { id: "ap1", status: "ACCEPTE", notes: null };
    let capturedSet: Record<string, unknown> | undefined;
    const returning = vi.fn().mockResolvedValue([updated]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/travel/applications/ap1", {
      method: "PATCH",
      body: JSON.stringify({ status: "ACCEPTE", notes: "" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ status: "ACCEPTE", notes: null });
  });
});

// ------------------------------------------------------------------
// GET /api/travel/stats — cinq selects séquentiels attendus sur .where()
// ------------------------------------------------------------------
describe("GET /api/travel/stats", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/travel/stats");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("calcule total, ventilations et taux d'acceptation (5 requêtes)", async () => {
    // Ordre des appels : total, EN_ATTENTE, EN_COURS, ACCEPTE, REFUSE
    const chains = selectWhereQueue([
      [{ count: "10" }],
      [{ count: "4" }],
      [{ count: "3" }],
      [{ count: "2" }],
      [{ count: "1" }],
    ]);
    dbMock({ select: chains.select });

    const res = await makeApp(ownerSession).request("/travel/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 10,
      enAttente: 4,
      enCours: 3,
      accepte: 2,
      refuse: 1,
      tauxAcceptation: 20, // round(2/10 * 100)
    });
    expect(chains.select).toHaveBeenCalledTimes(5);
  });

  it("renvoie un taux d'acceptation de 0 quand il n'y a aucune candidature", async () => {
    dbMock({ select: selectWhereQueue([[{ count: "0" }]]).select });

    const res = await makeApp(ownerSession).request("/travel/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 0,
      enAttente: 0,
      enCours: 0,
      accepte: 0,
      refuse: 0,
      tauxAcceptation: 0,
    });
  });

  it("accepte un filtre agencyId (condition where définie)", async () => {
    const chains = selectWhereQueue([
      [{ count: "2" }],
      [{ count: "1" }],
      [{ count: "0" }],
      [{ count: "1" }],
      [{ count: "0" }],
    ]);
    dbMock({ select: chains.select });

    const res = await makeApp(ownerSession).request("/travel/stats?agencyId=a1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 2,
      enAttente: 1,
      enCours: 0,
      accepte: 1,
      refuse: 0,
      tauxAcceptation: 50,
    });
  });

  it("renvoie 403 à une SECRETAIRE (travel:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/travel/stats");
    expect(res.status).toBe(403);
  });
});

// ------------------------------------------------------------------
// Nuance RBAC AGENT : travel uniquement — 200 ici, 403 ailleurs
// ------------------------------------------------------------------
describe("RBAC : l'AGENT n'a accès qu'au module travel", () => {
  it("l'AGENT obtient 200 sur GET /travel/agencies (travel:read accordé)", async () => {
    const rows = [{ id: "a1", name: "Agence Teranga" }];
    const db = dbMock();
    db.query.travelAgencies.findMany.mockResolvedValue(rows);

    const res = await makeApp(agentSession).request("/travel/agencies");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
  });

  it("l'AGENT obtient 201 sur POST /travel/agencies (travel:create accordé)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "a-new", name: "Via Agent" }]);
    dbMock({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ returning }),
      }),
    });

    const res = await makeApp(agentSession).request("/travel/agencies", {
      method: "POST",
      body: JSON.stringify({ name: "Via Agent", phone: "+221770000009" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "a-new", name: "Via Agent" });
  });

  it("l'AGENT obtient 403 sur GET /students (hors périmètre travel)", async () => {
    dbMock(); // le refus RBAC survient avant tout accès DB
    const res = await makeApp(agentSession, true).request("/students");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("l'AGENT obtient 200 sur GET /travel/stats (couvert par travel:read)", async () => {
    const chains = selectWhereQueue([[{ count: "1" }]]);
    dbMock({ select: chains.select });

    const res = await makeApp(agentSession).request("/travel/stats");
    expect(res.status).toBe(200);
  });

  it("l'ENSEIGNANT (aucune permission) obtient 403 sur GET /travel/agencies", async () => {
    const res = await makeApp(enseignantSession).request("/travel/agencies");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });
});
