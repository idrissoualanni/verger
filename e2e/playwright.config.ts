import { defineConfig, devices } from "@playwright/test";

/**
 * E2E Le Verger — cible par défaut : la prod (worker `verger`).
 * Surchargable : E2E_BASE_URL=https://localhost:8788 pnpm test:e2e
 * Identifiants :
 *  - PROPRIETAIRE : E2E_EMAIL / E2E_PASSWORD
 *  - autres rôles (probe.*) : E2E_PROBE_PASSWORD
 */
const baseURL = process.env.E2E_BASE_URL ?? "https://verger.sabel.workers.dev";

/** Projects connectés par rôle, tous dépendants du setup d'authentification. */
const roleProjects = (testMatch: RegExp) => [
  {
    name: "secretariat",
    testMatch,
    use: { ...devices["Desktop Chrome"], storageState: ".auth/secretariat.json" },
    dependencies: ["setup"],
  },
  {
    name: "comptable",
    testMatch,
    use: { ...devices["Desktop Chrome"], storageState: ".auth/comptable.json" },
    dependencies: ["setup"],
  },
  {
    name: "agent",
    testMatch,
    use: { ...devices["Desktop Chrome"], storageState: ".auth/agent.json" },
    dependencies: ["setup"],
  },
  {
    name: "enseignant",
    testMatch,
    use: { ...devices["Desktop Chrome"], storageState: ".auth/enseignant.json" },
    dependencies: ["setup"],
  },
];

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.(spec|setup)\.ts/,
  fullyParallel: true,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    // 1) Authentifie les 5 comptes de test → un storageState par rôle
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    // 2) Scénarios visiteur non connecté
    {
      name: "anon",
      testMatch: /tests\/auth\.spec\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    // 3) Scénarios connectés en tant que PROPRIETAIRE
    {
      name: "owner",
      testMatch: /tests\/(rbac|students)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ".auth/owner.json" },
      dependencies: ["setup"],
    },
    // 4) Scénarios RBAC des autres rôles (un projet = un storageState)
    ...roleProjects(/tests\/rbac-roles\.spec\.ts/),
  ],
});
