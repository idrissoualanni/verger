/**
 * Catch-all Route Handler — forward /api/* to Hono
 * This makes the single Worker serve both the Next.js frontend and the API.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import app from "@/lib/api/server";

async function handler(request: Request) {
  const { env, ctx } = getCloudflareContext();
  return app.fetch(request, env as any, ctx);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
