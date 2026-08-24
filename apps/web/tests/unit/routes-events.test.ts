/**
 * Tests unitaires du routeur events (agenda + notification WhatsApp simulée).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Bizarreries source :
 * - POST /events/:id/notify est une SIMULATION WhatsApp : Math.random() < 0.9,
 *   aucun fetch externe ni broadcast ; les parents sont dédupliqués par
 *   téléphone, les élèves sans parent joignable sont ignorés, et les messages
 *   ne sont insérés en base QUE s'il y en a au moins un.
 * - Les audiences de niveau (PRIMAIRE…) filtrent sur class.level.name en majuscules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { eventsRoutes } from "../../src/lib/api/routes/events";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", eventsRoutes);
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
      events: { findMany: vi.fn().mockResolvedValue([]) },
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks(); // restaure notamment l'espion Math.random
});

// ------------------------------------------------------------------
// GET /api/events
// ------------------------------------------------------------------
describe("GET /api/events", () => {
  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/events");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });

  it("renvoie 403 à une SECRETAIRE (events:read refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/events");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie la liste triée par date décroissante sans filtre", async () => {
    const rows = [
      { id: "e2", title: "Sortie", date: "2026-10-01T00:00:00.000Z" },
      { id: "e1", title: "Réunion", date: "2026-09-15T00:00:00.000Z" },
    ];
    const db = dbMock();
    db.query.events.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/events");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 2 });
    // Pas de filtres → clause where explicitement undefined
    expect(db.query.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("applique une clause where quand des filtres mois/type/audience sont passés", async () => {
    const db = dbMock();

    const res = await makeApp(ownerSession).request(
      "/events?month=2026-09&type=REUNION&audience=PARENTS"
    );
    expect(res.status).toBe(200);
    expect(db.query.events.findMany).toHaveBeenCalledOnce();
    expect(db.query.events.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });
});

// ------------------------------------------------------------------
// POST /api/events
// ------------------------------------------------------------------
describe("POST /api/events", () => {
  function validBody() {
    return {
      title: "Réunion de rentrée",
      date: "2026-09-15",
      type: "REUNION",
      audience: "PARENTS",
    };
  }

  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/events", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("renvoie 403 à une SECRETAIRE (events:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/events", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 400 si un champ requis manque", async () => {
    const res = await makeApp(ownerSession).request("/events", {
      method: "POST",
      body: JSON.stringify({ title: "Réunion", date: "2026-09-15", type: "REUNION" }), // audience manquant
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Titre, date, type et public cible sont requis",
    });
  });

  it("crée un événement avec défauts null et date convertie en Date", async () => {
    const created = { id: "e-new", title: "Réunion de rentrée" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/events", {
      method: "POST",
      body: JSON.stringify(validBody()),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created); // ici c'est bien created[0]
    expect(captured?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(captured?.title).toBe("Réunion de rentrée");
    expect(captured?.description).toBeNull();
    expect(captured?.endDate).toBeNull();
    expect(captured?.location).toBeNull();
    expect(captured?.date).toBeInstanceOf(Date);
    expect((captured?.date as Date).getTime()).toBe(new Date("2026-09-15").getTime());
    expect(captured?.type).toBe("REUNION");
    expect(captured?.audience).toBe("PARENTS");
  });

  it("conserve les champs optionnels fournis (description, lieu, date de fin)", async () => {
    const created = { id: "e-new2" };
    const returning = vi.fn().mockResolvedValue([created]);
    let captured: Record<string, unknown> | undefined;
    const values = vi.fn((arg: Record<string, unknown>) => {
      captured = arg;
      return { returning };
    });
    dbMock({ insert: vi.fn().mockReturnValue({ values }) });

    const res = await makeApp(ownerSession).request("/events", {
      method: "POST",
      body: JSON.stringify({
        ...validBody(),
        description: "Merci d'être à l'heure",
        location: "Salle polyvalente",
        endDate: "2026-09-16",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(captured?.description).toBe("Merci d'être à l'heure");
    expect(captured?.location).toBe("Salle polyvalente");
    expect(captured?.endDate).toBeInstanceOf(Date);
    expect((captured?.endDate as Date).getTime()).toBe(new Date("2026-09-16").getTime());
  });
});

// ------------------------------------------------------------------
// PATCH /api/events/:id
// ------------------------------------------------------------------
describe("PATCH /api/events/:id", () => {
  function patchChains(updatedRows: unknown[]) {
    const returning = vi.fn().mockResolvedValue(updatedRows);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    return dbMock({ update: vi.fn().mockReturnValue({ set }) });
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/events/e1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 404 si l'événement n'existe pas", async () => {
    patchChains([]);

    const res = await makeApp(ownerSession).request("/events/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ title: "Nouveau titre" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Événement introuvable" });
  });

  it("ne met à jour que les champs fournis", async () => {
    const updated = { id: "e1", title: "Reporté au 20 septembre" };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/events/e1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Reporté au 20 septembre", date: "2026-09-20" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({
      title: "Reporté au 20 septembre",
      date: new Date("2026-09-20"),
    });
  });

  it("convertit une description vide en null (effacement)", async () => {
    const updated = { id: "e1", description: null };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/events/e1", {
      method: "PATCH",
      body: JSON.stringify({ description: "" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(capturedSet).toEqual({ description: null });
  });
});

// ------------------------------------------------------------------
// DELETE /api/events/:id
// ------------------------------------------------------------------
describe("DELETE /api/events/:id", () => {
  it("renvoie 404 si l'événement n'existe pas", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/events/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Événement introuvable" });
  });

  it("supprime un événement existant", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "e1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    dbMock({ delete: vi.fn().mockReturnValue({ where }) });

    const res = await makeApp(ownerSession).request("/events/e1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ------------------------------------------------------------------
// POST /api/events/:id/notify — simulation WhatsApp (Math.random), pas de fetch
// ------------------------------------------------------------------
describe("POST /api/events/:id/notify", () => {
  const eventRow = {
    id: "ev1",
    title: "Réunion de rentrée",
    date: "2026-09-15T00:00:00.000Z",
    location: "Salle polyvalente",
    description: "Merci d'être à l'heure",
    audience: "TOUS",
  };

  /** Chaîne insert(...).values(messages[]) pour capturer le batch de messages. */
  function insertChains() {
    let capturedMessages: Record<string, unknown>[] | undefined;
    const values = vi.fn((arg: Record<string, unknown>[]) => {
      capturedMessages = arg;
      return Promise.resolve([]);
    });
    const insert = vi.fn().mockReturnValue({ values });
    return { insert, values, messages: () => capturedMessages };
  }

  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/events/ev1/notify", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("renvoie 403 à une SECRETAIRE (events:create refusé)", async () => {
    dbMock();
    const res = await makeApp(secretaireSession).request("/events/ev1/notify", {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si l'événement n'existe pas", async () => {
    const db = dbMock(); // events.findMany → [] par défaut

    const res = await makeApp(ownerSession).request("/events/inconnu/notify", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Événement introuvable" });
    expect(db.query.students.findMany).not.toHaveBeenCalled();
  });

  it("refuse l'audience PERSONNEL (pas de WhatsApp vers le personnel)", async () => {
    const db = dbMock();
    db.query.events.findMany.mockResolvedValue([{ ...eventRow, audience: "PERSONNEL" }]);

    const res = await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "L'audience PERSONNEL ne peut pas être notifiée via WhatsApp parents",
    });
  });

  it("audience TOUS : déduplique les parents par téléphone et insère les messages", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // < 0.9 → succès partout
    const chains = insertChains();
    const db = dbMock({ insert: chains.insert });
    db.query.events.findMany.mockResolvedValue([eventRow]);
    db.query.students.findMany.mockResolvedValue([
      {
        firstName: "Awa",
        lastName: "Diop",
        parent: { name: "Fatou Fall", phone: "+221770000001" },
        class: { level: { name: "Primaire" } },
      },
      {
        firstName: "Ousmane",
        lastName: "Diop",
        parent: { name: "Fatou Fall", phone: "+221770000001" }, // même parent → dédupliqué
        class: { level: { name: "Primaire" } },
      },
      {
        firstName: "Binet",
        lastName: "Sow",
        parent: { name: "Moussa Ndiaye", phone: "+221770000002" },
        class: { level: { name: "Collège" } },
      },
    ]);

    const res = await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(2); // 3 élèves mais 2 parents uniques
    expect(body.details).toEqual([
      { parentName: "Fatou Fall", parentPhone: "+221770000001", success: true },
      { parentName: "Moussa Ndiaye", parentPhone: "+221770000002", success: true },
    ]);

    // Un message MASSE par parent unique, lié à l'événement
    const messages = chains.messages();
    expect(messages).toHaveLength(2);
    expect(messages?.[0]).toMatchObject({
      type: "MASSE",
      recipientName: "Fatou Fall",
      recipientPhone: "+221770000001",
      status: "ENVOYE",
      eventId: "ev1",
    });
    expect(String(messages?.[0]?.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(messages?.[0]?.message)).toContain("Réunion de rentrée");
  });

  it("ignore les élèves dont le parent est injoignable (sans téléphone)", async () => {
    const chains = insertChains();
    const db = dbMock({ insert: chains.insert });
    db.query.events.findMany.mockResolvedValue([eventRow]);
    db.query.students.findMany.mockResolvedValue([
      { firstName: "Awa", lastName: "Diop", parent: null },
      { firstName: "Binet", lastName: "Sow", parent: { name: "Sans téléphone" } },
    ]);

    const res = await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, failed: 0, details: [], total: 0 });
    // Aucun message → aucune insertion en base
    expect(chains.insert).not.toHaveBeenCalled();
  });

  it("audience PRIMAIRE : ne garde que les élèves dont le niveau correspond (insensible à la casse)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const chains = insertChains();
    const db = dbMock({ insert: chains.insert });
    db.query.events.findMany.mockResolvedValue([
      { ...eventRow, audience: "PRIMAIRE", description: null, location: null },
    ]);
    db.query.students.findMany.mockResolvedValue([
      {
        firstName: "Awa",
        lastName: "Diop",
        parent: { name: "Fatou Fall", phone: "+221770000001" },
        class: { level: { name: "Primaire" } }, // correspond (majuscules comparées)
      },
      {
        firstName: "Binet",
        lastName: "Sow",
        parent: { name: "Autre", phone: "+221770000002" },
        class: { level: { name: "Collège" } }, // filtré
      },
      {
        firstName: "Zeynab",
        lastName: "Fall",
        parent: { name: "Encore", phone: "+221770000003" },
        class: null, // filtré aussi
      },
    ]);

    const res = await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.details).toEqual([
      { parentName: "Fatou Fall", parentPhone: "+221770000001", success: true },
    ]);
  });

  it("échec d'envoi : message enregistré en ECHOUE et failed incrémenté", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.95); // >= 0.9 → échec
    const chains = insertChains();
    const db = dbMock({ insert: chains.insert });
    db.query.events.findMany.mockResolvedValue([eventRow]);
    db.query.students.findMany.mockResolvedValue([
      {
        firstName: "Awa",
        lastName: "Diop",
        parent: { name: "Fatou Fall", phone: "+221770000001" },
        class: { level: { name: "Primaire" } },
      },
    ]);

    const res = await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.failed).toBe(1);

    const messages = chains.messages();
    expect(messages).toHaveLength(1);
    expect(messages?.[0]).toMatchObject({
      type: "MASSE",
      recipientName: "Fatou Fall",
      recipientPhone: "+221770000001",
      status: "ECHOUE",
      eventId: "ev1",
    });
    // Le contenu du message embarque titre, lieu, description et signature
    const message = String(messages?.[0]?.message);
    expect(message).toContain("Réunion de rentrée");
    expect(message).toContain("Salle polyvalente");
    expect(message).toContain("Merci d'être à l'heure");
    expect(message).toContain("Le Verger");
  });

  it("interroge les événements par id et les élèves actifs avec parent et niveau", async () => {
    const db = dbMock();
    db.query.events.findMany.mockResolvedValue([eventRow]);
    db.query.students.findMany.mockResolvedValue([]);

    await makeApp(ownerSession).request("/events/ev1/notify", { method: "POST" });

    expect(db.query.events.findMany).toHaveBeenCalledOnce();
    expect(db.query.students.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        with: { parent: true, class: { with: { level: true } } },
      })
    );
  });
});
