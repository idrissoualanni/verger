import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { createDb, type DbEnv } from "./db.js";

export interface AuthEnv extends DbEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_API_KEY?: string;
  ORIGINS?: string;
}

/**
 * Crée l'instance Better Auth — appelée à chaque requête (pattern Workers).
 * RBAC : seul PROPRIETAIRE est actif au démarrage (E3) ; les autres rôles
 * s'activent avec leurs modules (cf. AGENT.md §4).
 */
export function createAuth(env: AuthEnv) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: (env.ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    database: drizzleAdapter(createDb(env), {
      provider: "pg",
      usePlural: false,
    }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 jours
      updateAge: 60 * 60 * 24, // prolongation toutes les 24h si activité
    },
    plugins: [
      jwt(),
      dash({
        // Workers : pas de process.env — la clé vient du binding.
        apiKey: env.BETTER_AUTH_API_KEY,
      }),
    ],
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
  });
}

export type Auth = ReturnType<typeof createAuth>;
