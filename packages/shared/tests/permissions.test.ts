import { describe, expect, it } from "vitest";
import { MODULES, ACTIONS, ROLE_PERMISSIONS, hasPermission } from "../src/permissions";

describe("matrice RBAC", () => {
  const REST = MODULES.filter((m) => !["dashboard", "notifications", "journal"].includes(m));
  const NAV = ["dashboard", "notifications", "journal"] as const;

  it("PROPRIETAIRE : CRUD complet sur tous les modules REST (stats pour payments)", () => {
    for (const m of REST) {
      for (const a of ACTIONS) {
        if (a === "stats" && m !== "payments") continue;
        expect(hasPermission("PROPRIETAIRE", `${m}:${a}`), `${m}:${a}`).toBe(true);
      }
    }
  });

  it("PROPRIETAIRE : lecture seule sur les modules de navigation", () => {
    for (const m of NAV) {
      expect(hasPermission("PROPRIETAIRE", `${m}:read`), `${m}:read`).toBe(true);
      expect(hasPermission("PROPRIETAIRE", `${m}:create` as never)).toBe(false);
    }
  });

  it("SECRETAIRE : CRUD paiements uniquement", () => {
    for (const a of ["read", "create", "update", "delete"] as const) {
      expect(hasPermission("SECRETAIRE", `payments:${a}`)).toBe(true);
    }
    expect(hasPermission("SECRETAIRE", "payments:stats")).toBe(false);
    expect(hasPermission("SECRETAIRE", "students:read")).toBe(false);
    expect(hasPermission("SECRETAIRE", "levels:create")).toBe(false);
    expect(hasPermission("SECRETAIRE", "dashboard:read")).toBe(false);
  });

  it("COMPTABLE : lecture/suppression/stats paiements, jamais create/update", () => {
    expect(hasPermission("COMPTABLE", "payments:read")).toBe(true);
    expect(hasPermission("COMPTABLE", "payments:delete")).toBe(true);
    expect(hasPermission("COMPTABLE", "payments:stats")).toBe(true);
    expect(hasPermission("COMPTABLE", "payments:create")).toBe(false);
    expect(hasPermission("COMPTABLE", "payments:update")).toBe(false);
    expect(hasPermission("COMPTABLE", "students:read")).toBe(false);
  });

  it("ENSEIGNANT : aucune permission tant que absences/notes non câblés", () => {
    for (const m of MODULES) {
      for (const a of ACTIONS) {
        expect(hasPermission("ENSEIGNANT", `${m}:${a}`), `${m}:${a}`).toBe(false);
      }
    }
  });

  it("AGENT : CRUD travel uniquement", () => {
    for (const a of ["read", "create", "update", "delete"] as const) {
      expect(hasPermission("AGENT", `travel:${a}`)).toBe(true);
    }
    expect(hasPermission("AGENT", "students:read")).toBe(false);
    expect(hasPermission("AGENT", "payments:read")).toBe(false);
  });
});

describe("hasPermission — cas dégénérés", () => {
  it("retourne false pour rôle null/undefined/chaîne vide", () => {
    expect(hasPermission(null, "students:read")).toBe(false);
    expect(hasPermission(undefined, "students:read")).toBe(false);
    expect(hasPermission("", "students:read")).toBe(false);
  });

  it("retourne false pour un rôle inexistant dans la matrice", () => {
    expect(hasPermission("DIRECTEUR" as never, "students:read")).toBe(false);
  });
});

describe("cohérence structurelle de la matrice", () => {
  it("chaque permission listée est bien module:action avec module et action connus", () => {
    const validModules = new Set<string>(MODULES);
    const validActions = new Set<string>(ACTIONS);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        const [m, a] = p.split(":");
        expect(validModules.has(m), `${role} → ${p} (module inconnu)`).toBe(true);
        expect(validActions.has(a), `${role} → ${p} (action inconnue)`).toBe(true);
      }
    }
  });
});
