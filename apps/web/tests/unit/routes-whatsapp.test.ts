/**
 * Tests unitaires du routeur whatsapp (envoi individuel, envoi de masse,
 * historique, statistiques).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * BIZARRERIE SOURCE : l'« envoi » ne passe par aucun fetch vers un provider —
 * tout repose sur simulateSend() qui tire un Math.random() (< 0.9 = succès).
 * On pilot donc le spyOn(Math, "random") pour rendre les deux branches
 * déterministes :
 *   - tirage < 0.9            → statut ENVOYE
 *   - tirage >= 0.9           → statut ECHOUE + un 2e tirage choisit le libellé
 *     d'erreur parmi ["Numéro invalide", ...] via Math.floor(random*4).
 *
 * Autre bizarrerie : POST /whatsapp/send en échec répond 200 (pas 201 ni 500).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { whatsappRoutes } from "../../src/lib/api/routes/whatsapp";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", whatsappRoutes);
  return app;
}

const ownerSession: FakeSession = {
  user: { id: "u-owner", role: "PROPRIETAIRE", email: "owner@verger.sn", name: "Propriétaire" },
};
const secretaireSession: FakeSession = {
  user: { id: "u-sec", role: "SECRETAIRE", email: "sec@verger.sn", name: "Secrétaire" },
};
const comptableSession: FakeSession = {
  user: { id: "u-cpt", role: "COMPTABLE", email: "cpt@verger.sn", name: "Comptable" },
};
const agentSession: FakeSession = {
  user: { id: "u-agent", role: "AGENT", email: "agent@verger.sn", name: "Agent" },
};

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      whatsappMessages: {
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

/** Chaîne insert → values → returning avec capture des valeurs insérées. */
function insertChain(captured?: Record<string, unknown>) {
  const returning = vi.fn().mockResolvedValue([{ id: "m-new" }]);
  const values = vi.fn((arg: Record<string, unknown>) => {
    if (captured) Object.assign(captured, arg);
    return { returning };
  });
  dbMock({ insert: vi.fn().mockReturnValue({ values }) });
  return { values, returning };
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

// Le spy Math.random ne doit jamais fuiter dans un autre test.
afterEach(() => {
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// POST /api/whatsapp/send
// ------------------------------------------------------------------
describe("POST /api/whatsapp/send", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: "+221770000001", message: "Bonjour" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 400 si phoneNumber ou message manque", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = await makeApp(ownerSession).request("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: "+221770000001" }), // message manquant
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "phoneNumber et message requis" });
  });

  it("renvoie 403 à une SECRETAIRE (whatsapp:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: "+221770000001", message: "Bonjour" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("succès de simulation → 201 avec statut ENVOYE enregistré en base", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // < 0.9 → succès
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await makeApp(ownerSession).request("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({
        phoneNumber: "+221770000001",
        message: "Bonjour Mme Fall",
        studentId: "s1",
        recipientName: "Fatou Fall",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "m-new" });

    // Valeurs écrites en base
    expect(String(captured.id)).toMatch(/^[0-9a-f-]{36}$/); // uuid généré
    expect(captured.type).toBe("INDIVIDUEL");
    expect(captured.recipientPhone).toBe("+221770000001");
    expect(captured.message).toBe("Bonjour Mme Fall");
    expect(captured.studentId).toBe("s1");
    expect(captured.recipientName).toBe("Fatou Fall");
    expect(captured.status).toBe("ENVOYE");
    expect(captured.errorMessage).toBeNull();
  });

  it("échec de simulation → statut ECHOUE + message d'erreur, et réponse 200 (bizarrerie)", async () => {
    // Tirages : 1er ≥ 0.9 → échec ; 2e choisit le libellé (0 → "Numéro invalide")
    vi.spyOn(Math, "random").mockReturnValueOnce(0.95).mockReturnValueOnce(0);
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await makeApp(ownerSession).request("/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({
        phoneNumber: "+221771112233",
        message: "Rappel de paiement",
        parentId: "p1",
      }),
      headers: { "Content-Type": "application/json" },
    });

    // L'échec d'envoi N'EST PAS une erreur HTTP : la route répond 200
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "m-new" });

    expect(captured.status).toBe("ECHOUE");
    expect(captured.errorMessage).toBe("Numéro invalide"); // errors[floor(0*4)]
    expect(captured.parentId).toBe("p1");
  });
});

// ------------------------------------------------------------------
// POST /api/whatsapp/send-bulk
// ------------------------------------------------------------------
describe("POST /api/whatsapp/send-bulk", () => {
  function bulkRequest(messages: unknown, extra: Record<string, unknown> = {}) {
    return makeApp(ownerSession).request("/whatsapp/send-bulk", {
      method: "POST",
      body: JSON.stringify({ messages, ...extra }),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/whatsapp/send-bulk", {
      method: "POST",
      body: JSON.stringify({ messages: [{ phoneNumber: "+1", message: "a" }] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("renvoie 400 sans tableau messages", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = await bulkRequest(undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages (array) requis" });
  });

  it("renvoie 400 si messages n'est pas un tableau", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const res = await bulkRequest({ phoneNumber: "+1", message: "pas-un-tableau" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages (array) requis" });
  });

  it("ignore les entrées sans téléphone ou sans message (non comptées)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // toutes réussites
    const { values } = insertChain();

    const res = await bulkRequest([
      { phoneNumber: "+221770000001", message: "Message 1" },
      { message: "sans téléphone" }, // ignoré
      { phoneNumber: "+221770000003" }, // ignoré
    ]);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      sent: 1,
      failed: 0,
      total: 1, // seules les entrées complètes comptent
      results: [{ phoneNumber: "+221770000001", success: true, errorMessage: undefined }],
    });
    expect(values).toHaveBeenCalledOnce(); // une seule insertion
  });

  it("mélange succès/échecs : compteurs exacts, type MASSE par défaut", async () => {
    // msg1 : 0.5 → succès. msg2 : 0.95 → échec puis 0 → "Numéro invalide".
    // msg3 : 0.99 → échec puis 0.75 → errors[floor(0.75*4)=3] = "Destinataire non joignable"
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.95).mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99).mockReturnValueOnce(0.75);

    const capturedTypes: Array<Record<string, unknown>> = [];
    const returning = vi.fn().mockResolvedValue([{ id: "m-bulk" }]);
    const values = vi.fn((arg: Record<string, unknown>) => {
      capturedTypes.push(arg);
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await bulkRequest([
      { phoneNumber: "+221770000001", message: "A" },
      { phoneNumber: "+221770000002", message: "B" },
      { phoneNumber: "+221770000003", message: "C" },
    ]);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      sent: 1,
      failed: 2,
      total: 3,
      results: [
        { phoneNumber: "+221770000001", success: true, errorMessage: undefined },
        { phoneNumber: "+221770000002", success: false, errorMessage: "Numéro invalide" },
        { phoneNumber: "+221770000003", success: false, errorMessage: "Destinataire non joignable" },
      ],
    });
    expect(values).toHaveBeenCalledTimes(3);
    // Chaque envoi valide est bien persisté, même en échec
    expect(capturedTypes.every((r) => r.status === "ENVOYE" || r.status === "ECHOUE")).toBe(true);
    expect(capturedTypes[0].type).toBe("MASSE"); // défaut
  });

  it("respecte un type fourni (ex : RELANCE) et les identifiants liés", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const captured: Record<string, unknown> = {};
    insertChain(captured);

    const res = await bulkRequest(
      [{ phoneNumber: "+221770000009", message: "Relance", studentId: "s9", parentId: "p9" }],
      { type: "RELANCE" }
    );

    expect(res.status).toBe(201);
    expect(captured.type).toBe("RELANCE");
    expect(captured.studentId).toBe("s9");
    expect(captured.parentId).toBe("p9");
  });
});

// ------------------------------------------------------------------
// GET /api/whatsapp/history
// ------------------------------------------------------------------
describe("GET /api/whatsapp/history", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/whatsapp/history");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie la page par défaut (limit 50, offset 0) avec le total du count", async () => {
    const rows = [
      { id: "m1", status: "ENVOYE", sentAt: "2026-08-20T10:00:00.000Z", student: {}, parent: {} },
      { id: "m2", status: "ECHOUE", sentAt: "2026-08-19T10:00:00.000Z", student: {}, parent: {} },
    ];
    const chains = selectWhereQueue([[{ count: "12" }]]);
    const db = dbMock({ select: chains.select });
    db.query.whatsappMessages.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/whatsapp/history");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 12, limit: 50, offset: 0 });

    // Le count passe par la chaîne select/from/where attendue
    expect(chains.where).toHaveBeenCalledTimes(1);
    const arg = db.query.whatsappMessages.findMany.mock.calls[0][0];
    expect(arg.where).toBeUndefined(); // aucun filtre
    expect(arg.limit).toBe(50);
    expect(arg.offset).toBe(0);
    expect(arg.with).toEqual({ student: true, parent: true });
  });

  it("transmet les filtres studentId/parentId/status et la pagination personnalisée", async () => {
    const chains = selectWhereQueue([[{ count: "3" }]]);
    const db = dbMock({ select: chains.select });
    db.query.whatsappMessages.findMany.mockResolvedValue([]);

    const res = await makeApp(ownerSession).request(
      "/whatsapp/history?studentId=s1&parentId=p1&status=ENVOYE&limit=10&offset=5"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], total: 3, limit: 10, offset: 5 });

    const arg = db.query.whatsappMessages.findMany.mock.calls[0][0];
    expect(arg.where).toBeDefined(); // des filtres sont présents
    expect(arg.limit).toBe(10);
    expect(arg.offset).toBe(5);
  });

  it("renvoie 403 à un AGENT (whatsapp:read hors périmètre travel)", async () => {
    dbMock(); // le refus RBAC survient avant tout accès DB
    const res = await makeApp(agentSession).request("/whatsapp/history");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });
});

// ------------------------------------------------------------------
// GET /api/whatsapp/stats
// ------------------------------------------------------------------
describe("GET /api/whatsapp/stats", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/whatsapp/stats");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("calcule total/sent/failed/successRate sur la période par défaut (week)", async () => {
    // Ordre des appels : total, ENVOYE, ECHOUE
    const chains = selectWhereQueue([[{ count: "8" }], [{ count: "6" }], [{ count: "2" }]]);
    dbMock({ select: chains.select });

    const res = await makeApp(ownerSession).request("/whatsapp/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 8,
      sent: 6,
      failed: 2,
      successRate: 75, // round(6/8 * 100)
      period: "week", // défaut
    });
    expect(chains.select).toHaveBeenCalledTimes(3);
  });

  it("accepte period=day", async () => {
    const chains = selectWhereQueue([[{ count: "5" }], [{ count: "4" }], [{ count: "1" }]]);
    dbMock({ select: chains.select });

    const res = await makeApp(ownerSession).request("/whatsapp/stats?period=day");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 5,
      sent: 4,
      failed: 1,
      successRate: 80,
      period: "day",
    });
  });

  it("renvoie successRate 0 quand aucun message n'est parti", async () => {
    dbMock({ select: selectWhereQueue([[{ count: "0" }], [{ count: "0" }], [{ count: "0" }]]).select });

    const res = await makeApp(ownerSession).request("/whatsapp/stats?period=month");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 0,
      sent: 0,
      failed: 0,
      successRate: 0, // pas de division par zéro
      period: "month",
    });
  });

  it("renvoie 403 à une SECRETAIRE (seuls payments:* lui sont accordés)", async () => {
    const res = await makeApp(secretaireSession).request("/whatsapp/stats");
    expect(res.status).toBe(403);
  });

  it("renvoie 403 à un COMPTABLE (payments:read/delete/stats uniquement)", async () => {
    const res = await makeApp(comptableSession).request("/whatsapp/stats");
    expect(res.status).toBe(403);
  });
});
