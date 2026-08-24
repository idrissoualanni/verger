import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { createDb, type DbEnv } from "./db";

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
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Instance Better Auth mémoïsée.
 *
 * better-auth est sans état : reconstruire l'instance (adaptateur drizzle,
 * plugins, hooks) À CHAQUE requête gaspillait plusieurs ms de CPU. Sur le
 * plan gratuit Workers (plafond 10 ms/requête), ça déclenchait des
 * "exceededCpu" → 503 / Error 1102 dès que le trafic ou les données grossissent.
 * On ne reconstruit que si une valeur d'env change.
 */
let cachedAuth: { key: string; instance: Auth } | null = null;

export function getAuth(env: AuthEnv): Auth {
  const key = [
    env.DATABASE_URL,
    env.BETTER_AUTH_SECRET,
    env.BETTER_AUTH_URL,
    env.BETTER_AUTH_API_KEY ?? "",
    env.ORIGINS ?? "",
  ].join("|");
  if (!cachedAuth || cachedAuth.key !== key) {
    cachedAuth = { key, instance: createAuth(env) };
  }
  return cachedAuth.instance;
}
