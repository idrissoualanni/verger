import type { NextConfig } from "next";
import path from "node:path";

const MONOREPO_ROOT = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  // Turbopack: monorepo root pour résoudre les packages via symlinks pnpm
  turbopack: {
    root: MONOREPO_ROOT,
  },

  // Aligner outputFileTracingRoot avec turbopack.root
  outputFileTracingRoot: MONOREPO_ROOT,

  // OpenNext a besoin du standalone pour le bundle Cloudflare
  output: "standalone",

  // Exclure les modules natifs du bundle (pas compatibles Workers)
  serverExternalPackages: ["sharp"],

  // Exclure sharp du tracing
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },

  // Images : désactivation de l'optimisation Next (sharp)
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
