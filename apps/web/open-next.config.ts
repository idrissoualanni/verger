import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Config par défaut : dummy cache (pas de KV nécessaire au démarrage)
// Pour activer KV : import kvCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache"
// puis passer incrementalCache: kvCache
export default defineCloudflareConfig();
