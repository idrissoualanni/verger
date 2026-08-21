import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@verger/shared/src/schema";

export interface DbEnv {
  DATABASE_URL: string;
}

/**
 * Crée la connexion Drizzle vers Neon PostgreSQL.
 * Utilise le driver HTTP Neon (fetch) — compatible Cloudflare Workers.
 */
export function createDb(env: DbEnv) {
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql, { schema });
}
