/**
 * @verger/shared — Matrice RBAC centralisée.
 *
 * Convention : une permission = `${module}:${action}`.
 * Le helper Hono `requirePerm` (dans chaque copie API) consomme cette matrice.
 * ENSEIGNANT n'a aucune permission tant que les modules absences/notes
 * ne sont pas câblés (AGENT.md §4 — activation progressive).
 */
import type { UserRole } from "./constants";

export const MODULES = [
  "levels",
  "students",
  "grades",
  "absences",
  "whatsapp",
  "events",
  "invoices",
  "payments",
  "expenses",
  "staff",
  "travel",
  // Modules de navigation (pas de route REST associée — servent au filtrage sidebar)
  "dashboard",
  "notifications",
  "journal",
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ["read", "create", "update", "delete", "stats"] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}:${Action}`;

const OWNER_MODULES = [
  "levels",
  "students",
  "grades",
  "absences",
  "whatsapp",
  "events",
  "invoices",
  "expenses",
  "staff",
] as const;
const CRUD: Action[] = ["read", "create", "update", "delete"];

/** PROPRIETAIRE : tout, sur tous les modules. */
const OWNER_PERMISSIONS: readonly Permission[] = [
  ...OWNER_MODULES.flatMap((m) => CRUD.map((a) => `${m}:${a}` as Permission)),
  "payments:read",
  "payments:create",
  "payments:update",
  "payments:delete",
  "payments:stats",
  "travel:read",
  "travel:create",
  "travel:update",
  "travel:delete",
  "dashboard:read",
  "notifications:read",
  "journal:read",
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  PROPRIETAIRE: OWNER_PERMISSIONS,
  SECRETAIRE: ["payments:read", "payments:create", "payments:update", "payments:delete"],
  COMPTABLE: ["payments:read", "payments:delete", "payments:stats"],
  ENSEIGNANT: [],
  AGENT: ["travel:read", "travel:create", "travel:update", "travel:delete"],
};

/** Vérifie si un rôle possède une permission. Retourne false si rôle absent/inconnu. */
export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  return perms ? (perms as readonly string[]).includes(permission) : false;
}
