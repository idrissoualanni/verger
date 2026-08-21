#!/usr/bin/env tsx
/**
 * Removes sharp and @img/* native packages from ALL node_modules locations
 * before OpenNext/esbuild runs. sharp contains .node native binaries that
 * esbuild cannot bundle for Cloudflare Workers.
 *
 * Must run BEFORE `opennextjs-cloudflare build` (see build:cf script).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../../.."); // monorepo root
const APP = path.resolve(__dirname, ".."); // apps/web

const REMOVE = ["sharp", "@img"];

function removeDir(dirPath: string): boolean {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

function cleanNodeModules(nmDir: string, label: string): number {
  if (!fs.existsSync(nmDir)) return 0;

  let removed = 0;

  // Top-level packages: sharp, @img/*
  for (const pkg of REMOVE) {
    const pkgPath = path.join(nmDir, pkg);
    if (removeDir(pkgPath)) {
      console.log(`[clean-sharp] Removed ${pkgPath} (${label})`);
      removed++;
    }
  }

  // .pnpm deep packages
  const pnpmDir = path.join(nmDir, ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith("sharp@") || entry.startsWith("@img+")) {
          const p = path.join(pnpmDir, entry);
          if (removeDir(p)) {
            console.log(`[clean-sharp] Removed ${p} (${label})`);
            removed++;
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return removed;
}

// Clean root node_modules (where esbuild resolves from)
const rootNm = path.join(ROOT, "node_modules");
const r1 = cleanNodeModules(rootNm, "root");

// Clean apps/web node_modules
const appNm = path.join(APP, "node_modules");
const r2 = cleanNodeModules(appNm, "app");

// Clean apps/web/.next/standalone (in case it was already built)
const standaloneNm = path.join(APP, ".next", "standalone", "node_modules");
const r3 = cleanNodeModules(standaloneNm, "standalone");

const total = r1 + r2 + r3;
console.log(`[clean-sharp] Total removed: ${total} packages`);
