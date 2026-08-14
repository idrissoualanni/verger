/**
 * Crée le compte PROPRIETAIRE initial (E3).
 *
 * Usage :
 *   OWNER_EMAIL=... OWNER_PASSWORD=... node --env-file=../../.env.local \
 *     node_modules/.bin/tsx scripts/create-owner.ts
 *
 * Variables requises : OWNER_EMAIL, OWNER_PASSWORD (OWNER_NAME optionnel).
 * Le compte est créé avec le rôle PROPRIETAIRE via l'API Better Auth
 * (signUpEmail + additionalFields.role).
 */
import { auth } from "../auth.config.js";

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
      // Champ custom à PLAT dans le body (le schéma sign-up/email n'imbrique
      // pas `data` : z.object(...).and(z.record(z.string(), z.any())))
      role: "PROPRIETAIRE",
    },
  });
  console.log(
    "Compte propriétaire créé :",
    result.user.email,
    "| role:",
    result.user.role
  );
} catch (err) {
  console.error(
    "Échec de création :",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}
