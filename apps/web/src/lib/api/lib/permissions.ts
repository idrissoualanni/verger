/**
 * Helper Hono RBAC — consomme la matrice @verger/shared.
 * 401 = non connecté ; 403 = connecté mais rôle insuffisant.
 */
import { hasPermission, type Permission } from "@verger/shared/src/permissions";

type AuthContext = {
  var: { auth: any };
  req: { raw: Request };
  json: (data: unknown, status?: number) => Response;
};

/**
 * Vérifie session + permission. Retourne l'utilisateur ou une Response d'erreur.
 * Usage : `const auth = await requirePerm(c, "levels:read"); if ("res" in auth) return auth.res;`
 */
export async function requirePerm(
  c: AuthContext,
  permission: Permission
): Promise<{ user: any } | { res: Response }> {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return { res: c.json({ error: "Non connecté" }, 401) };
  }
  if (!hasPermission(session.user.role, permission)) {
    return { res: c.json({ error: "Accès refusé pour votre rôle" }, 403) };
  }
  return { user: session.user };
}
