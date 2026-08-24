import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { dash } from "@better-auth/infra";
import * as schema from "@verger/shared/src/schema";

/**
 * Config Better Auth pour les scripts locaux (create-owner).
 * Le runtime Workers utilise la factory createAuth(env) de
 * src/lib/api/lib/auth.ts.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-not-for-prod",
  database: drizzleAdapter(
    drizzle(neon(process.env.DATABASE_URL ?? "postgresql://u:p@localhost:5432/verger"), { schema }),
    { provider: "pg", usePlural: false }
  ),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [jwt(), dash()],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "SECRETAIRE",
      },
      phone: {
        type: "string",
        required: false,
      },
    },
  },
  // Ferme l'escalade de privilèges : le rôle n'est plus choisissable au
  // signup — toute inscription devient SECRETAIRE. PROPRIETAIRE est posé
  // par mise à jour directe en base (script create-owner).
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, role: "SECRETAIRE" } };
        },
      },
    },
  },
});
