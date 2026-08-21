#!/usr/bin/env tsx
/**
 * Patches the OpenNext-generated handler.mjs so getMiddlewareManifest()
 * does not use a dynamic require() (unsupported by workerd).
 *
 * Bug: Next.js 16.2.x next-server.js calls `require(this.middlewareManifestPath)`
 * to load middleware-manifest.json. Cloudflare Workers has no dynamic require,
 * so EVERY route returns HTTP 500. The manifest is already inlined by OpenNext's
 * loadManifest patch — the call site just bypasses it.
 *
 * Fix: short-circuit to `null`. The edge middleware is executed upstream by
 * `.open-next/worker.js` (middlewareHandler import), so next-server does not
 * need the manifest.
 *
 * Must run AFTER `opennextjs-cloudflare build` (see build:cf script).
 * Ref: https://github.com/opennextjs/opennextjs-cloudflare/issues/1232
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANDLER = path.resolve(
  __dirname,
  "../.open-next/server-functions/default/handler.mjs"
);

const TARGET =
  "getMiddlewareManifest(){return this.minimalMode?null:require(this.middlewareManifestPath)}";
const REPLACEMENT = "getMiddlewareManifest(){return null}";

if (!fs.existsSync(HANDLER)) {
  console.error(`[patch-opennext] handler.mjs not found at ${HANDLER}`);
  process.exit(1);
}

const contents = fs.readFileSync(HANDLER, "utf8");

if (contents.includes(REPLACEMENT)) {
  console.log("[patch-opennext] Already patched — nothing to do");
  process.exit(0);
}

if (!contents.includes(TARGET)) {
  console.error(
    "[patch-opennext] Target pattern not found — OpenNext may have changed the generated code. Inspect getMiddlewareManifest in handler.mjs manually."
  );
  process.exit(1);
}

fs.writeFileSync(HANDLER, contents.replace(TARGET, REPLACEMENT));
console.log("[patch-opennext] Patched getMiddlewareManifest → null");