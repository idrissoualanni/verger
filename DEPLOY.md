# Déploiement — Le Verger

> ⚠️ Ce document remplace l'ancienne architecture 2 workers (Pages + verger-api + verger-frontend),
> supprimée en août 2026. **Un seul Worker déploie tout.**

---

## Architecture

```
[GitHub push master]
   └─> GitHub Actions (deploy.yml)
         ├─ pnpm test            (tests unitaires shared + web)
         ├─ Build OpenNext       (apps/web, patch getMiddlewareManifest inclus)
         ├─ wrangler deploy      → Worker "verger"
         └─ job e2e              → Playwright contre la prod
                                    https://verger.sabel.workers.dev
                                          │
        ┌─────────────────────────────────┤
        │                                 │
 [Next.js/OpenNext SSR]           [API Hono /api/*] ──Drizzle──> [Neon PostgreSQL]
  assets statiques (ASSETS)               │
                                          ├── Durable Object NotificationHub (WebSockets)
                                          └── better-auth (sessions cookie, JWT pour Sentinel)
```

- **Worker unique** `verger` : `custom-worker.ts` wrappe `.open-next/worker.js`
  (front Next.js via OpenNext) + expose l'API Hono sur `/api/*` (catch-all
  `src/app/api/[...all]/route.ts`) + le DO `NotificationHub`.
- URL prod : **https://verger.sabel.workers.dev**
- Base : **Neon** (`round-paper-78033335`, région eu-central-1, base `verger`).
- Pas d'Upstash : le rate limiting est in-memory dans server.ts (100 req/min/IP).

## Secrets du Worker (wrangler secret put --name verger)

| Secret | Valeur |
|---|---|
| `DATABASE_URL` | connection string Neon |
| `BETTER_AUTH_SECRET` | secret better-auth |
| `BETTER_AUTH_URL` | `https://verger.sabel.workers.dev` |

## Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Rôle |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | deploy wrangler |
| `CLOUDFLARE_API_TOKEN` | token avec permission Workers Scripts:Edit |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | compte PROPRIETAIRE de sonde e2e |

## Pipeline CI/CD (.github/workflows/deploy.yml)

Déclenché sur push `master` (paths: apps/web, packages/shared, e2e, fichiers racine).

1. **Job deploy** : install → tests unitaires (`pnpm test`, exclut @verger/e2e) →
   build OpenNext → typecheck → `wrangler deploy` → smoke test HTTP.
2. **Job e2e** (needs: deploy) : installe Chromium headless, lance Playwright
   contre la prod (auth setup + scénarios anon/owner/multi-rôles), upload le
   rapport si échec.

## Commandes locales

```bash
pnpm build:web          # build Next.js (apps/web)
pnpm deploy:web         # build:cf + wrangler deploy (depuis apps/web)
pnpm test               # tous les tests unitaires (exclut e2e)
cd e2e && npx playwright test   # e2e contre la prod (env E2E_EMAIL/E2E_PASSWORD)
```

Scripts de build apps/web : `clean-sharp` (purge sharp/@img inbundlables sous workerd)
→ build OpenNext → `patch-opennext` (court-circuite `getMiddlewareManifest()`,
issue opennextjs-cloudflare #1232/#1258).

## Pièges connus

- Le renommage d'un Worker = nouveau Worker sans secrets → re-poser les 3 secrets
  + le binding WORKER_SELF_REFERENCE.
- Plan gratuit Workers = **10 ms CPU/requête** (Error 1102 au-delà). Surveiller
  `cpuTimeMs` via Workers Logs ; pagination obligatoire sur les grosses listes ;
  Workers Paid (5 $/mois, 30 s CPU) si dépassements fréquents.
- `getAuth(env)` est mémoïsé dans lib/auth.ts — ne pas recréer createAuth par requête.
