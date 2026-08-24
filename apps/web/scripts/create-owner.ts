/**
 * Crée le compte PROPRIETAIRE initial (E3).
 *
 * Usage :
 *   OWNER_EMAIL=... OWNER_PASSWORD=... pnpm --filter web create-owner
 *
 * Variables requises : OWNER_EMAIL, OWNER_PASSWORD (OWNER_NAME optionnel).
 *
 * Le signup force désormais SECRETAIRE (hook databaseHooks — fermeture de
 * l'escalade de privilèges). Ce script pose donc le rôle PROPRIETAIRE par
 * mise à jour directe en base, après la création du compte.
 */
import { eq } from "drizzle-orm";
import { auth } from "./auth-cli.config";
import { user } from "@verger/shared/src/auth-schema";
import { createDb } from "../src/lib/api/lib/db";

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;
const name = process.env.OWNER_NAME ?? "Propriétaire";

if (!email || !password) {
  console.error("OWNER_EMAIL et OWNER_PASSWORD sont requis.");
  process.exit(1);
}

try {
  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
    },
  });

  // Pose le rôle PROPRIETAIRE directement en base (contourne le hook signup).
  const db = createDb({
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://u:p@localhost:5432/verger",
  });
  await db.update(user).set({ role: "PROPRIETAIRE" }).where(eq(user.email, email));

  console.log(
    "Compte propriétaire créé :",
    result.user.email,
    "| role:",
    "PROPRIETAIRE"
  );
} catch (err) {
  console.error(
    "Échec de création :",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}
