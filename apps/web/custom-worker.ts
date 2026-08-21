/**
 * Custom Worker — wraps OpenNext fetch handler + exports NotificationHub DO
 * This allows the single Worker to handle both Next.js routes AND Durable Objects.
 */
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

// Re-export the DO class so wrangler can register it
export { NotificationHub } from "./src/lib/api/do";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler;
