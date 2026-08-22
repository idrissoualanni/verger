import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // Ne jamais scanner les artefacts de build Next/OpenNext
    exclude: ["node_modules/**", ".next/**", ".open-next/**", ".vercel/**"],
  },
});
