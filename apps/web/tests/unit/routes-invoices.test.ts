/**
 * Tests unitaires du routeur invoices (factures).
 * Pattern : fausse session injectée via middleware + createDb mocké.
 * requirePerm est exercé pour de vrai (matrice RBAC réelle).
 *
 * Module mono-rôle : seul PROPRIETAIRE a des permissions invoices:*.
 * - SECRETAIRE gère les paiements mais doit prendre 403 sur CHAQUE route facture.
 * - COMPTABLE a payments:stats mais rien sur invoices (403 sur /invoices/stats).
 *
 * Bizarreries sources :
 * - generateInvoiceNumber attend `db.select(...).from(invoices)` DIRECTEMENT
 *   (awaited sur from, sans .where), comme le compteur de matricule élèves ;
 *   le numéro produit est `FAC-<année><seq sur 4>` sans tiret (FAC-20260001).
 * - POST /:id/send ne contacte AUCUN service externe : succès simulé via
 *   Math.random() < 0.9, puis un insert vide `values({}).catch()` est tenté
 *   → la chaîne mockée doit exposer un `.catch`.
 * - GET /stats enchaîne 6 requêtes sur UN SEUL db.select : la 1re est awaited
 *   sur .from(), les 4 suivantes sur .where(), la dernière via .groupBy().orderBy()
 *   → mock hybride (promesse portant les méthodes de chaîne).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/lib/api/lib/db", () => ({ createDb: vi.fn() }));

import { createDb } from "../../src/lib/api/lib/db";
import { invoicesRoutes } from "../../src/lib/api/routes/invoices";

type FakeSession = { user: { id: string; role: string; email: string; name: string } } | null;

function makeApp(session: FakeSession) {
  const app = new Hono<{ Bindings: Record<string, never>; Variables: { auth: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("auth", { api: { getSession: async () => session } });
    await next();
  });
  app.route("/", invoicesRoutes);
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

/** Construit un mock drizzle minimal avec les comportements passés en override. */
function dbMock(overrides: Record<string, unknown> = {}) {
  const db = {
    query: {
      invoices: {
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

/**
 * Chaîne pour le compteur de numéro : select → from awaited SANS .where
 * (même forme que le compteur de matricule dans students).
 */
function selectDirectFrom(rows: unknown[]) {
  const from = vi.fn().mockResolvedValue(rows);
  const select = vi.fn().mockReturnValue({ from });
  return { select, from };
}

/**
 * Insert polyvalent : chaque appel à values() enregistre l'argument et renvoie
 * un objet avec .returning() (création facture + lignes) ET .catch()
 * (insert vide de /send). Les appels sont conservés dans `calls` dans l'ordre.
 */
function insertChain(returningRows: unknown[]) {
  const calls: Record<string, unknown>[] = [];
  const returning = vi.fn().mockResolvedValue(returningRows);
  const values = vi.fn((arg: Record<string, unknown>) => {
    calls.push(arg);
    return { returning, catch: vi.fn().mockResolvedValue(undefined) };
  });
  return {
    insert: vi.fn().mockReturnValue({ values }),
    values,
    returning,
    calls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function validInvoiceBody() {
  return {
    studentId: "s1",
    dueDate: "2026-09-30",
    items: [{ description: "Frais de scolarité", unitAmount: "25000", quantity: 1 }],
  };
}

// ------------------------------------------------------------------
// Autorisation transversale — module invoices interdit aux autres rôles
// ------------------------------------------------------------------
describe("Autorisation du module invoices (mono-rôle)", () => {
  it.each([
    ["liste", "/invoices", "GET"],
    ["statistiques", "/invoices/stats", "GET"],
    ["détail", "/invoices/i1", "GET"],
  ] as const)("renvoie 403 à la SECRETAIRE sur la %s (elle crée pourtant des paiements)", async (_label, path, method) => {
    // Contrepartie du test routes-payments : SECRETAIRE = payments:* mais RIEN ici
    dbMock();
    const res = await makeApp(secretaireSession).request(path, { method });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("renvoie 403 au COMPTABLE sur les stats (il a payments:stats mais pas invoices:read)", async () => {
    dbMock();

    const res = await makeApp(comptableSession).request("/invoices/stats");
    expect(res.status).toBe(403);
  });

  it("renvoie 401 sans session", async () => {
    const res = await makeApp(null).request("/invoices");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Non connecté" });
  });
});

// ------------------------------------------------------------------
// GET /api/invoices
// ------------------------------------------------------------------
describe("GET /api/invoices", () => {
  it("renvoie la liste paginée avec défauts limit=50 / offset=0 et total du count", async () => {
    const rows = [
      {
        id: "i1",
        number: "FAC-20260001",
        createdAt: "2026-08-01T08:00:00.000Z",
        student: { class: {}, parent: {} },
        items: [],
      },
    ];
    const { select } = selectViaWhere([{ total: 42 }]);
    const db = dbMock({ select });
    db.query.invoices.findMany.mockResolvedValue(rows);

    const res = await makeApp(ownerSession).request("/invoices");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: rows, total: 42, limit: 50, offset: 0 });
    expect(db.query.invoices.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
  });

  it("transmet limit/offset de la requête et plafonne limit à 200", async () => {
    const { select } = selectViaWhere([{ total: 0 }]);
    const db = dbMock({ select });

    const res1 = await makeApp(ownerSession).request("/invoices?limit=5&offset=10");
    expect(res1.status).toBe(200);
    expect(db.query.invoices.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 5, offset: 10 })
    );

    const res2 = await makeApp(ownerSession).request("/invoices?limit=9999");
    expect(res2.status).toBe(200);
    expect(db.query.invoices.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 200 })
    );
  });
});

// ------------------------------------------------------------------
// POST /api/invoices
// ------------------------------------------------------------------
describe("POST /api/invoices", () => {
  function setupCréation(maxExistant: number | null, créée: Record<string, unknown>) {
    const counter = selectDirectFrom([{ max: maxExistant }]);
    const chain = insertChain([créée]);
    const db = dbMock({ select: counter.select, insert: chain.insert });
    db.query.invoices.findFirst.mockResolvedValue(créée); // relecture finale
    return { db, chain };
  }

  it("renvoie 400 sans studentId", async () => {
    const res = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify({ items: [{ unitAmount: "1000" }] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "studentId et items (au moins 1) sont requis" });
  });

  it("renvoie 400 si items manque ou est un tableau vide", async () => {
    const resSansItems = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(resSansItems.status).toBe(400);

    const resItemsVide = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify({ studentId: "s1", items: [] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(resItemsVide.status).toBe(400);
  });

  it("renvoie 403 à la SECRETAIRE (invoices:create refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify(validInvoiceBody()),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("génère le numéro FAC-<année> incrémenté depuis le max et calcule le total", async () => {
    const année = new Date().getFullYear();
    const créée = { id: "i-new", number: `FAC-${année}0013`, totalAmount: "27500.25" };
    const { chain } = setupCréation(12, créée);

    const res = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify({
        studentId: "s1",
        items: [
          { description: "Frais inscription", unitAmount: "10000", quantity: 2 }, // 20000
          { description: "Cantine", unitAmount: "7500.25" },                      // 7500.25 (qté défaut 1)
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(créée);

    // Facture : 1er appel values
    const facture = chain.calls[0];
    expect(facture.number).toBe(`FAC-${année}0013`); // 12 + 1, séquence sur 4 chiffres collée au préfixe
    expect(facture.studentId).toBe("s1");
    expect(facture.totalAmount).toBe("27500.25");
    expect(facture.paidAmount).toBe("0");
    expect(facture.status).toBe("EN_ATTENTE");
    expect(facture.dueDate).toBeNull(); // non fourni → null
  });

  it("numérote à partir de 0001 s'il n'existe aucune facture", async () => {
    const année = new Date().getFullYear();
    const créée = { id: "i-first", number: `FAC-${année}0001` };
    const { chain } = setupCréation(null, créée);

    const res = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify(validInvoiceBody()),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(chain.calls[0].number).toBe(`FAC-${année}0001`);
  });

  it("reporte dueDate, insère une ligne par item avec fallbacks designation/amount/quantité", async () => {
    const créée = { id: "i-new", number: "FAC-20260009", totalAmount: "29500" };
    const { chain } = setupCréation(8, créée);

    const res = await makeApp(ownerSession).request("/invoices", {
      method: "POST",
      body: JSON.stringify({
        studentId: "s9",
        dueDate: "2026-10-15",
        items: [
          { description: "Inscription", unitAmount: "10000", quantity: 2 },
          { designation: "Cantine", amount: "7500" }, // fallbacks : designation + amount
          { unitAmount: "2000" },                     // désignation vide, quantité défaut
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(201);
    expect(chain.calls[0].dueDate).toBe("2026-10-15");
    expect(chain.calls[0].totalAmount).toBe("29500"); // 20000 + 7500 + 2000

    const [ligne1, ligne2, ligne3] = chain.calls.slice(1);
    expect(ligne1.designation).toBe("Inscription"); // description prioritaire
    expect(ligne1.quantity).toBe(2);
    expect(ligne2.designation).toBe("Cantine");     // designation en repli
    expect(ligne2.unitAmount).toBe("7500");         // amount en repli
    expect(ligne3.designation).toBe("");            // rien fourni → chaîne vide
    expect(ligne3.quantity).toBe(1);                // quantité par défaut
    for (const ligne of [ligne1, ligne2, ligne3]) {
      expect(ligne.invoiceId).toBe("i-new"); // rattachées à la facture créée
    }
  });
});

// ------------------------------------------------------------------
// GET /api/invoices/:id
// ------------------------------------------------------------------
describe("GET /api/invoices/:id", () => {
  it("renvoie 404 si la facture n'existe pas", async () => {
    dbMock(); // findFirst → null

    const res = await makeApp(ownerSession).request("/invoices/inconnu");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Facture introuvable" });
  });

  it("renvoie le détail avec élève, classe, parent et lignes", async () => {
    const invoice = {
      id: "i1",
      number: "FAC-20260001",
      student: { firstName: "Awa", class: {}, parent: {} },
      items: [{ designation: "Scolarité", unitAmount: "25000", quantity: 1 }],
    };
    const db = dbMock();
    db.query.invoices.findFirst.mockResolvedValue(invoice);

    const res = await makeApp(ownerSession).request("/invoices/i1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(invoice);
    expect(db.query.invoices.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: { student: { with: { class: true, parent: true } }, items: true },
      })
    );
  });
});

// ------------------------------------------------------------------
// PATCH /api/invoices/:id
// ------------------------------------------------------------------
describe("PATCH /api/invoices/:id", () => {
  function updateChain() {
    const returning = vi.fn().mockResolvedValue([]);
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where: vi.fn().mockReturnValue({ returning }) };
    });
    return { update: vi.fn().mockReturnValue({ set }), set, returning, get capturedSet() { return capturedSet; } };
  }

  it("renvoie 400 si le corps est invalide", async () => {
    const res = await makeApp(ownerSession).request("/invoices/i1", {
      method: "PATCH",
      body: "pas-du-json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Corps invalide" });
  });

  it("renvoie 400 si aucun champ modifiable n'est fourni", async () => {
    const res = await makeApp(ownerSession).request("/invoices/i1", {
      method: "PATCH",
      body: JSON.stringify({ champInconnu: "x" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Aucun champ à modifier" });
  });

  it("renvoie 403 à la SECRETAIRE (invoices:update refusé)", async () => {
    const res = await makeApp(secretaireSession).request("/invoices/i1", {
      method: "PATCH",
      body: JSON.stringify({ status: "PAYEE" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si la facture n'existe pas", async () => {
    const chain = updateChain();
    dbMock({ update: chain.update });

    const res = await makeApp(ownerSession).request("/invoices/inconnu", {
      method: "PATCH",
      body: JSON.stringify({ status: "PAYEE" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Facture introuvable" });
  });

  it("marque payée : status transmis, paidAmount typé string, dueDate annulable", async () => {
    const updated = { id: "i1", status: "PAYEE", paidAmount: "25000" };
    const returning = vi.fn().mockResolvedValue([updated]);
    let capturedSet: Record<string, unknown> | undefined;
    const set = vi.fn((arg: Record<string, unknown>) => {
      capturedSet = arg;
      return { where: vi.fn().mockReturnValue({ returning }) };
    });
    dbMock({ update: vi.fn().mockReturnValue({ set }) });

    const res = await makeApp(ownerSession).request("/invoices/i1", {
      method: "PATCH",
      body: JSON.stringify({ status: "PAYEE", paidAmount: 25000, dueDate: null }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(capturedSet).toEqual({ status: "PAYEE", paidAmount: "25000", dueDate: null });
  });
});

// ------------------------------------------------------------------
// DELETE /api/invoices/:id
// ------------------------------------------------------------------
describe("DELETE /api/invoices/:id", () => {
  function deleteChain() {
    const where = vi.fn().mockResolvedValue([]);
    const del = vi.fn().mockReturnValue({ where });
    return { del, where };
  }

  it("renvoie 404 si la facture n'existe pas", async () => {
    dbMock(); // findFirst → null

    const res = await makeApp(ownerSession).request("/invoices/inconnu", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Facture introuvable" });
  });

  it("renvoie 403 au COMPTABLE malgré payments:delete (invoices:delete refusé)", async () => {
    const invoice = { id: "i1", status: "EN_ATTENTE" };
    const db = dbMock();
    db.query.invoices.findFirst.mockResolvedValue(invoice);

    const res = await makeApp(comptableSession).request("/invoices/i1", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("refuse (400) de supprimer une facture déjà payée", async () => {
    const invoice = { id: "i1", status: "PAYEE" };
    const db = dbMock();
    db.query.invoices.findFirst.mockResolvedValue(invoice);

    const res = await makeApp(ownerSession).request("/invoices/i1", { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Impossible de supprimer une facture payée" });
  });

  it("supprime les lignes puis la facture", async () => {
    const invoice = { id: "i1", status: "EN_ATTENTE" };
    const { del, where } = deleteChain();
    const db = dbMock({ delete: del });
    db.query.invoices.findFirst.mockResolvedValue(invoice);

    const res = await makeApp(ownerSession).request("/invoices/i1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(del).toHaveBeenCalledTimes(2); // invoiceItems d'abord, invoices ensuite
    expect(where).toHaveBeenCalledTimes(2);
  });
});

// ------------------------------------------------------------------
// POST /api/invoices/:id/send — envoi simulé (WhatsApp)
// ------------------------------------------------------------------
describe("POST /api/invoices/:id/send", () => {
  const factureEnvoyable = {
    id: "i1",
    number: "FAC-20260007",
    totalAmount: "25000",
    dueDate: "2026-09-30",
    student: {
      firstName: "Awa",
      lastName: "Diop",
      parent: { phone: "+221770000001" },
    },
  };

  it("renvoie 404 si la facture n'existe pas", async () => {
    dbMock(); // findFirst → null

    const res = await makeApp(ownerSession).request("/invoices/inconnu/send", { method: "POST" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Facture introuvable" });
  });

  it("renvoie 400 si le parent n'a pas de téléphone", async () => {
    const sansTéléphone = {
      ...factureEnvoyable,
      student: { firstName: "Awa", lastName: "Diop", parent: {} },
    };
    const db = dbMock();
    db.query.invoices.findFirst.mockResolvedValue(sansTéléphone);

    const res = await makeApp(ownerSession).request("/invoices/i1/send", { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Aucun numéro de téléphone pour le parent" });
  });

  it("envoie avec message formaté quand Math.random < 0.9 (succès simulé)", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      // L'insert vide interne échoue volontairement : il ne doit PAS bloquer l'envoi
      const values = vi.fn(() => Promise.reject(new Error("insert parasite")));
      const db = dbMock({ insert: vi.fn().mockReturnValue({ values }) });
      db.query.invoices.findFirst.mockResolvedValue(factureEnvoyable);

      const res = await makeApp(ownerSession).request("/invoices/i1/send", { method: "POST" });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        sent: true,
        phone: "+221770000001",
        message:
          `Facture FAC-20260007 de ${parseFloat("25000").toLocaleString("fr-FR")} FCFA pour Awa Diop. ` +
          `Échéance : ${new Date("2026-09-30").toLocaleDateString("fr-FR")}.`,
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("renvoie sent=false quand Math.random >= 0.9 (échec simulé)", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);
    try {
      const values = vi.fn(() => Promise.reject(new Error("insert parasite")));
      const db = dbMock({ insert: vi.fn().mockReturnValue({ values }) });
      db.query.invoices.findFirst.mockResolvedValue({
        ...factureEnvoyable,
        dueDate: null, // échéance non définie
      });

      const res = await makeApp(ownerSession).request("/invoices/i1/send", { method: "POST" });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBe(false);
      expect(body.message).toContain("Échéance : non définie");
    } finally {
      randomSpy.mockRestore();
    }
  });
});

// ------------------------------------------------------------------
// GET /api/invoices/stats — agrégats SQL mockés, coercions Number vérifiées
// ------------------------------------------------------------------
describe("GET /api/invoices/stats", () => {
  /**
   * La route partage UN SEUL db.select entre 6 requêtes, dans cet ordre :
   * 1 total (awaited sur from) ; 2-5 paid/pending/partial/annulled
   * (awaited sur where) ; 6 monthly (via groupBy → orderBy).
   */
  function statsSelects(config: {
    total: unknown[];
    paid: unknown[];
    pending: unknown[];
    partial: unknown[];
    annulled: unknown[];
    monthly: unknown[];
  }) {
    const where = vi.fn();
    where.mockResolvedValueOnce(config.paid)
      .mockResolvedValueOnce(config.pending)
      .mockResolvedValueOnce(config.partial)
      .mockResolvedValueOnce(config.annulled);
    const orderBy = vi.fn().mockResolvedValue(config.monthly);
    const groupBy = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn(
      () => Object.assign(Promise.resolve(config.total), { where, groupBy })
    );
    const select = vi.fn().mockReturnValue({ from });
    return { select, from, where, groupBy, orderBy };
  }

  it("agrège total/payé/en attente/partiel/annulé + séries mensuelles", async () => {
    const monthly = [
      { month: "2026-07", total: 70000, paid: 30000, count: 4 },
      { month: "2026-08", total: 80000, paid: 50000, count: 6 },
    ];
    const { select, where, orderBy } = statsSelects({
      total: [{ total: "150000.75", count: 10 }], // strings → Number() dans la réponse
      paid: [{ total: 80000 }],
      pending: [{ total: 30000 }],
      partial: [{ total: "20000", count: 2 }],
      annulled: [{ total: 5000, count: 1 }],
      monthly,
    });
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/invoices/stats");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalFacture: 150000.75,
      totalPaye: 80000,
      totalEnAttente: 30000,
      totalPartiel: 20000,
      totalAnnule: 5000,
      nbFactures: 10,
      nbPartiel: 2,
      nbAnnule: 1,
      monthly,
    });
    // 6 requêtes distinctes traversent le même select partagé
    expect(select).toHaveBeenCalledTimes(6);
    expect(where).toHaveBeenCalledTimes(4);
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("retourne des zéros quand aucune facture n'existe", async () => {
    const { select } = statsSelects({
      total: [{ total: 0, count: 0 }],
      paid: [{ total: 0 }],
      pending: [{ total: 0 }],
      partial: [{ total: 0, count: 0 }],
      annulled: [{ total: 0, count: 0 }],
      monthly: [],
    });
    dbMock({ select });

    const res = await makeApp(ownerSession).request("/invoices/stats");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalFacture: 0,
      totalPaye: 0,
      totalEnAttente: 0,
      totalPartiel: 0,
      totalAnnule: 0,
      nbFactures: 0,
      nbPartiel: 0,
      nbAnnule: 0,
      monthly: [],
    });
  });
});
