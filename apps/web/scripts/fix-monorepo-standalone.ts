#!/usr/bin/env tsx
/**
 * Fix for pnpm monorepo + Windows:
 * 1. Moves standalone files from apps/web/ to .next/standalone/ root
 * 2. Resolves all symlinks/junctions in .next/standalone/node_modules/
 *    so esbuild can read them on Windows
 * 3. Removes native modules (sharp, @img/*) incompatible with Cloudflare Workers
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const standaloneDir = path.resolve(__dirname, "../.next/standalone");

// === Step 1: Fix monorepo path ===
const monorepoAppDir = path.join(standaloneDir, "apps/web");

if (fs.existsSync(monorepoAppDir)) {
  console.log("[fix-monorepo] Moving standalone files from apps/web/ to root...");
  const items = fs.readdirSync(monorepoAppDir);
  for (const item of items) {
    const src = path.join(monorepoAppDir, item);
    const dest = path.join(standaloneDir, item);
    if (fs.existsSync(dest)) {
      if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      } else {
        fs.copyFileSync(src, dest);
      }
    } else {
      fs.renameSync(src, dest);
    }
  }
  const appsDir = path.join(standaloneDir, "apps");
  if (fs.existsSync(appsDir)) {
    fs.rmSync(appsDir, { recursive: true, force: true });
  }
  console.log("[fix-monorepo] Done.");
}

// === Step 2: Resolve symlinks/junctions in node_modules ===
const nmDir = path.join(standaloneDir, "node_modules");
if (fs.existsSync(nmDir)) {
  console.log("[fix-monorepo] Resolving symlinks in .next/standalone/node_modules/...");
  let resolved = 0;

  function resolveDir(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const realPath = fs.realpathSync(fullPath);
          // Remove the symlink and replace with actual copy
          fs.rmSync(fullPath, { recursive: true, force: true });
          fs.cpSync(realPath, fullPath, { recursive: true });
          resolved++;
        } catch {
          // Skip unreadable targets
        }
      } else if (entry.isDirectory()) {
        resolveDir(fullPath);
      }
    }
  }

  // Resolve top-level packages
  resolveDir(nmDir);

  // Also resolve .pnpm deep junctions
  const pnpmDir = path.join(nmDir, ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    resolveDir(pnpmDir);
  }

  console.log(`[fix-monorepo] Resolved ${resolved} symlinks.`);
}

// === Step 3: Remove native modules incompatible with Cloudflare Workers ===
const REMOVE_PACKAGES = [
  "sharp",
  "@img/sharp-win32-x64",
  "@img/sharp-linux-x64",
  "@img/sharp-darwin-x64",
  "@img/sharp-wasm32",
];

for (const pkg of REMOVE_PACKAGES) {
  const pkgPath = path.join(nmDir, pkg);
  if (fs.existsSync(pkgPath)) {
    fs.rmSync(pkgPath, { recursive: true, force: true });
    console.log(`[fix-monorepo] Removed incompatible package: ${pkg}`);
  }
  // Also remove from .pnpm
  try {
    const pnpmPkgs = fs
      .readdirSync(path.join(nmDir, ".pnpm"))
      .filter((d) => d.startsWith(pkg + "@"));
    for (const p of pnpmPkgs) {
      const pPath = path.join(nmDir, ".pnpm", p);
      fs.rmSync(pPath, { recursive: true, force: true });
      console.log(`[fix-monorepo] Removed from .pnpm: ${p}`);
    }
  } catch {
    // .pnpm directory doesn't exist or can't be read
  }
}
