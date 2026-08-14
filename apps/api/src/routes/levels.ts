import { Hono } from "hono";
import { eq, count } from "drizzle-orm";
import { createDb } from "../lib/db.js";
import { levels, classes } from "@verger/shared/src/schema.js";

/**
 * Routes niveaux & classes — protégées : session + rôle PROPRIETAIRE.
 * E4 : saisie des vraies structures de l'école par le propriétaire.
 * (Les autres rôles s'activent avec leurs modules — AGENT.md §4)
 */

export const levelsRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();

/** Vérifie session + rôle PROPRIETAIRE. Renvoie l'utilisateur ou null. */
async function requireOwner(c: { var: { auth: any }; req: { raw: Request } }): Promise<any> {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || session.user.role !== "PROPRIETAIRE") return null;
  return session.user;
}

// ------------------------------------------------------------------
// Niveaux (Primaire, Collège, Lycée…)
// ------------------------------------------------------------------

// GET /api/levels → niveaux + leurs classes, ordonnés
levelsRoutes.get("/levels", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const result = await db.query.levels.findMany({
    orderBy: (l, { asc }) => [asc(l.order)],
    with: { classes: true },
  });
  return c.json(result);
});

// POST /api/levels → créer un niveau
levelsRoutes.post("/levels", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.name) return c.json({ error: "Le nom est requis" }, 400);

  const db = createDb(c.env);
  const created = await db
    .insert(levels)
    .values({
      id: crypto.randomUUID(),
      name: String(body.name),
      order: Number(body.order ?? 0),
      description: body.description ? String(body.description) : null,
    })
    .returning();
  return c.json(created[0], 201);
});

// PATCH /api/levels/:id → renommer / réordonner
levelsRoutes.patch("/levels/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(levels)
    .set({
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.order !== undefined ? { order: Number(body.order) } : {}),
      ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
    })
    .where(eq(levels.id, c.req.param("id")))
    .returning();
  if (!updated.length) return c.json({ error: "Niveau introuvable" }, 404);
  return c.json(updated[0]);
});

// DELETE /api/levels/:id → refus si des classes y sont rattachées
levelsRoutes.delete("/levels/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const [linked] = await db
    .select({ n: count() })
    .from(classes)
    .where(eq(classes.levelId, c.req.param("id")));
  if (linked && linked.n > 0) {
    return c.json({ error: "Des classes sont rattachées à ce niveau" }, 409);
  }

  const deleted = await db
    .delete(levels)
    .where(eq(levels.id, c.req.param("id")))
    .returning();
  if (!deleted.length) return c.json({ error: "Niveau introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// Classes (CP1, CE1, 6e, Terminale…)
// ------------------------------------------------------------------

// POST /api/classes → créer une classe
levelsRoutes.post("/classes", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.name || !body?.levelId || !body?.schoolYear) {
    return c.json({ error: "Nom, niveau et année scolaire sont requis" }, 400);
  }

  const db = createDb(c.env);
  const created = await db
    .insert(classes)
    .values({
      id: crypto.randomUUID(),
      name: String(body.name),
      levelId: String(body.levelId),
      tuitionFee: String(body.tuitionFee ?? "0"),
      schoolYear: String(body.schoolYear),
    })
    .returning();
  return c.json(created[0], 201);
});

// PATCH /api/classes/:id → modifier une classe
levelsRoutes.patch("/classes/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(classes)
    .set({
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.levelId ? { levelId: String(body.levelId) } : {}),
      ...(body.tuitionFee !== undefined ? { tuitionFee: String(body.tuitionFee) } : {}),
      ...(body.schoolYear ? { schoolYear: String(body.schoolYear) } : {}),
    })
    .where(eq(classes.id, c.req.param("id")))
    .returning();
  if (!updated.length) return c.json({ error: "Classe introuvable" }, 404);
  return c.json(updated[0]);
});

// DELETE /api/classes/:id → refus si des élèves y sont rattachés
levelsRoutes.delete("/classes/:id", async (c) => {
  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);

  const db = createDb(c.env);
  const [linked] = await db
    .select({ n: count() })
    .from(classes)
    .where(eq(classes.id, c.req.param("id")));
  // Garde-fou : une classe avec élèves ne se supprime pas (les élèves existent à partir d'E8).
  if (linked && linked.n > 0) {
    // TODO E8 : compter les élèves liés (students.classId) avant suppression.
    return c.json({ error: "Impossible de supprimer une classe existante" }, 409);
  }

  const deleted = await db
    .delete(classes)
    .where(eq(classes.id, c.req.param("id")))
    .returning();
  if (!deleted.length) return c.json({ error: "Classe introuvable" }, 404);
  return c.json({ ok: true });
});
