/**
 * @verger/shared — Matrice RBAC centralisée.
 *
 * Convention : une permission = `${module}:${action}`.
 * Le helper Hono `requirePerm` (dans chaque copie API) consomme cette matrice.
 * ENSEIGNANT n'a aucune permission tant que les modules absences/notes
 * ne sont pas câblés (AGENT.md §4 — activation progressive).
 */
import type { UserRole } from "./constants";

/** Modules métier — chacun a des routes REST `/api/<module>`. */
const REST_MODULES = [
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
] as const;

/** Modules de navigation (pas de route REST associée — servent au filtrage sidebar). */
const NAV_MODULES = ["dashboard", "notifications", "journal"] as const;

export const MODULES = [...REST_MODULES, ...NAV_MODULES] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ["read", "create", "update", "delete", "stats"] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}:${Action}`;

const CRUD = ["read", "create", "update", "delete"] as const satisfies readonly Action[];

/** PROPRIETAIRE : tout, sur tous les modules. */
const OWNER_PERMISSIONS: readonly Permission[] = [
  // Tout module REST sauf payments/travel, qui ont leur matrice fine ci-dessous.
  // (Un nouveau module ajouté à REST_MODULES hérite automatiquement du CRUD owner.)
  ...REST_MODULES
    .filter((m) => m !== "payments" && m !== "travel")
    .flatMap((m) => CRUD.map((a) => `${m}:${a}` as Permission)),
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

export const ROLE_PERMISSIONS = {
  PROPRIETAIRE: OWNER_PERMISSIONS,
  SECRETAIRE: ["payments:read", "payments:create", "payments:update", "payments:delete"],
  COMPTABLE: ["payments:read", "payments:delete", "payments:stats"],
  ENSEIGNANT: [],
  AGENT: ["travel:read", "travel:create", "travel:update", "travel:delete"],
} as const satisfies Record<UserRole, readonly Permission[]>;

/** Vérifie si un rôle possède une permission. Retourne false si rôle absent/inconnu. */
export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  const perms: readonly Permission[] | undefined = ROLE_PERMISSIONS[role];
  return perms?.includes(permission) ?? false;
}
