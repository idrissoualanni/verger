import { expect, test } from "@playwright/test";

/**
 * RBAC multi-rôles contre la prod. Ce fichier est exécuté par 4 projets
 * playwright (secretariat / comptable / agent / enseignant), chacun avec
 * son propre storageState. Les assertions suivent la matrice
 * packages/shared/src/permissions.ts :
 *   SECRETAIRE  = payments CRUD seul
 *   COMPTABLE   = payments read/delete/stats (PAS create)
 *   AGENT       = travel CRUD seul
 *   ENSEIGNANT  = rien
 *
 * Chaque describe se saute lui-même si le projet courant ne correspond pas.
 */

/** Nom de project playwright → rôle réel en base. */
const ROLE_BY_PROJECT: Record<string, string> = {
  secretariat: "SECRETAIRE",
  comptable: "COMPTABLE",
  agent: "AGENT",
  enseignant: "ENSEIGNANT",
};

/** Vérifie la session et saute tout le worker si le projet ≠ rôle attendu. */
async function guard(request: APIRequestContext, expected: string) {
  const project = test.info().project.name;
  if (project !== expected) {
    test.skip(true, `scénarios ${expected} : projet courant = ${project}`);
    return false;
  }
  const res = await request.get("/api/auth/get-session");
  expect(res.ok(), "get-session doit réussir (storageState du projet)").toBeTruthy();
  const body = await res.json();
  expect(body?.user?.role, "le rôle de session doit correspondre au projet").toBe(
    ROLE_BY_PROJECT[expected] ?? expected.toUpperCase()
  );
  return true;
}

// Alias d'import propre pour le typage du helper
import type { APIRequestContext } from "@playwright/test";

test.describe("SECRETAIRE — payments CRUD seul", () => {
  let ok = false;
  test.beforeAll(async ({ request }) => {
    ok = await guard(request, "secretariat");
  });

  test("la liste des paiements est accessible avec pagination", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.get("/api/payments?limit=5");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("total");
    expect(body.limit).toBe(5);
  });

  test("payments:create est autorisé (404 élève inconnu ≠ 403)", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.post("/api/payments", {
      data: { studentId: "e2e-inexistant", amount: 1000, method: "ESPECES", month: "2026-08" },
    });
    // L'élève n'existe pas → la route va au bout de sa logique métier :
    // la permission est accordée, c'est la donnée qui manque.
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Élève introuvable" });
  });

  test("les modules hors périmètre renvoient 403", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    for (const path of ["/api/levels", "/api/students", "/api/expenses"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} doit être refusé à SECRETAIRE`).toBe(403);
    }
  });

  test("payments:stats est refusé à SECRETAIRE", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.get("/api/payments/stats");
    expect(res.status()).toBe(403);
  });

  test("la sidebar n'affiche pas Élèves", async ({ page }) => {
    test.skip(!ok, "hors rôle");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Élèves" })).toHaveCount(0);
  });
});

test.describe("COMPTABLE — payments read/delete/stats, sans create", () => {
  let ok = false;
  test.beforeAll(async ({ request }) => {
    ok = await guard(request, "comptable");
  });

  test("lecture + stats des paiements accessibles", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const list = await request.get("/api/payments?limit=5");
    expect(list.status()).toBe(200);

    const stats = await request.get("/api/payments/stats");
    expect(stats.status()).toBe(200);
  });

  test("payments:create est refusé (403)", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.post("/api/payments", {
      data: { studentId: "x", amount: 1000, method: "ESPECES", month: "2026-08" },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Accès refusé pour votre rôle" });
  });

  test("les autres modules renvoient 403", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.get("/api/students");
    expect(res.status()).toBe(403);
  });
});

test.describe("AGENT — travel CRUD seul", () => {
  let ok = false;
  test.beforeAll(async ({ request }) => {
    ok = await guard(request, "agent");
  });

  test("les agences sont lisibles, créables, désactivables", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const list = await request.get("/api/travel/agencies");
    expect(list.status()).toBe(200);

    const created = await request.post("/api/travel/agencies", {
      data: { name: `E2E Probe ${Date.now()}`, phone: "770000000" },
    });
    expect(created.status()).toBe(201);
    const agency = await created.json();

    // Cleanup : désactiver l'agence créée (travel:update autorisé)
    const patched = await request.patch(`/api/travel/agencies/${agency.id}`, {
      data: { isActive: false },
    });
    expect(patched.status()).toBe(200);
  });

  test("travel:stats est accessible", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    const res = await request.get("/api/travel/stats");
    expect(res.status()).toBe(200);
  });

  test("les modules hors périmètre renvoient 403", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    for (const path of ["/api/students", "/api/payments", "/api/events"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} doit être refusé à AGENT`).toBe(403);
    }
  });
});

test.describe("ENSEIGNANT — zéro permission", () => {
  let ok = false;
  test.beforeAll(async ({ request }) => {
    ok = await guard(request, "enseignant");
  });

  test("tous les modules métier renvoient 403", async ({ request }) => {
    test.skip(!ok, "hors rôle");
    for (const path of [
      "/api/students",
      "/api/levels",
      "/api/payments",
      "/api/travel/agencies",
      "/api/events",
      "/api/grades",
    ]) {
      const res = await request.get(path);
      expect(res.status(), `${path} doit être refusé à ENSEIGNANT`).toBe(403);
    }
  });
});
