# Déploiement — Le Verger

Guide de déploiement en production sur Cloudflare Pages (frontend) et Cloudflare Workers (API).

---

## Architecture de déploiement

```
[Cloudflare Pages] ──HTTP──> [Cloudflare Workers] ──Drizzle──> [Neon PostgreSQL]
        │                          │
        │                          ├── Upstash Redis (queue + cache)
        │                          └── Durable Objects (WebSockets temps réel)
        │
    └─> https://le-verger-web.pages.dev
```

---

## 1. Prérequis

### 1.1 Comptes à créer/configurer

| Service | URL | Rôle |
|---------|-----|------|
| Cloudflare | dash.cloudflare.com | Workers + Pages + Durable Objects |
| Neon | console.neon.tech | PostgreSQL serverless |
| Upstash | console.upstash.com | Redis (queue async, cache) |

### 1.2 CLI à installer

```bash
# Cloudflare Wrangler
npm install -g wrangler
wrangler login

# pnpm (si pas déjà fait)
npm install -g pnpm
```

---

## 2. Configuration de la base de données (Neon)

### 2.1 Créer un projet production

1. Aller sur [console.neon.tech](https://console.neon.tech)
2. Créer un nouveau projet : `le-verger-prod`
3. Récupérer la **connection string** (avec `?sslmode=require`)

### 2.2 Exécuter les migrations

```bash
# Depuis la racine du monorepo
cd packages/shared
# Configurer DATABASE_URL avec la connection string Neon dans .env.local
# Puis lancer les migrations Drizzle
npx drizzle-kit push
```

---

## 3. Configuration Upstash Redis

1. Aller sur [console.upstash.com](https://console.upstash.com)
2. Créer une base Redis `le-verger-prod`
3. Récupérer :
   - **UPSTASH_REDIS_REST_URL** : `https://<id>.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN** : token d'accès

---

## 4. Configuration de l'API (Cloudflare Workers)

### 4.1 Déployer l'API

```bash
# Depuis la racine du monorepo
cd apps/api
wrangler deploy --config wrangler.prod.jsonc
```

L'URL de l'API sera : `https://verger-api.<TON_COMPTE>.workers.dev`

### 4.2 Variables d'environnement (Cloudflare Dashboard)

Aller dans **Workers & Pages > verger-api > Settings > Variables** et ajouter :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | Connection string Neon PostgreSQL | `postgresql://...?sslmode=require` |
| `BETTER_AUTH_SECRET` | Secret de session (min 32 chars) | Générer avec `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | URL de l'API en prod | `https://verger-api.<TON_COMPTE>.workers.dev` |
| `BETTER_AUTH_API_KEY` | Clé API Better Auth (dash plugin) | `ba_...` |
| `APP_ENV` | Environnement | `production` |
| `UPSTASH_REDIS_REST_URL` | URL Upstash Redis (optionnel) | `https://<id>.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Token Upstash Redis (optionnel) | `<token>` |

### 4.3 Durable Objects

Le Durable Object `NotificationHub` est configuré dans `wrangler.prod.jsonc`. Il sera automatiquement déployé avec le Worker.

---

## 5. Configuration du Frontend (Cloudflare Pages)

### 5.1 Mettre à jour l'URL de l'API

Dans `apps/web/package.json`, le script `build:prod` utilise `NODE_ENV=production`. Le `next.config.ts` lira `API_URL` pour les rewrites.

### 5.2 Déployer le frontend

```bash
# Depuis la racine du monorepo
cd apps/web
API_URL=https://verger-api.<TON_COMPTE>.workers.dev pnpm run build:prod
wrangler pages deploy .next --project-name=le-verger-web --branch=main
```

L'URL du frontend sera : `https://le-verger-web.pages.dev`

### 5.3 Variables d'environnement (Cloudflare Pages Dashboard)

Aller dans **Workers & Pages > le-verger-web > Settings > Environment variables** et ajouter :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `API_URL` | URL de l'API Workers en prod | `https://verger-api.<TON_COMPTE>.workers.dev` |
| `BETTER_AUTH_SECRET` | Doit matcher celui de l'API | `<même_secret>` |
| `NEXT_PUBLIC_APP_URL` | URL du frontend en prod | `https://le-verger-web.pages.dev` |

---

## 6. Déploiement automatisé (script)

### Windows (PowerShell)

```powershell
.\scripts\deploy.ps1
```

### Linux/macOS (bash)

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Important :** Éditer les scripts pour remplacer `<TON_COMPTE>` par ton compte Cloudflare réel.

---

## 7. URLs de production (à remplir après déploiement)

| Service | URL | Statut |
|---------|-----|--------|
| Frontend | `https://le-verger-web.pages.dev` | ⬜ À déployer |
| API | `https://verger-api.<TON_COMPTE>.workers.dev` | ⬜ À déployer |
| Neon DB | `console.neon.tech` | ⬜ À configurer |
| Upstash Redis | `console.upstash.com` | ⬜ À configurer |
| Dashboard Sentinel | `dash.better-auth.com` | ⬜ À connecter |

---

## 8. Vérification post-déploiement

### 8.1 Tester l'API

```bash
# Health check
curl https://verger-api.<TON_COMPTE>.workers.dev/health

# Info
curl https://verger-api.<TON_COMPTE>.workers.dev/
```

### 8.2 Tester le frontend

1. Ouvrir `https://le-verger-web.pages.dev`
2. Vérifier que la page charge correctement
3. Tester le login avec le compte propriétaire
4. Vérifier que les rewrites `/api/*` fonctionnent (Network tab → vérifier que les appels API répondent)

### 8.3 Tester les WebSockets (Durable Objects)

1. Ouvrir la console navigateur (F12)
2. Vérifier qu'il n'y a pas d'erreur de connexion WebSocket
3. Déclencher un événement (ex: créer une absence) → vérifier la notification temps réel

---

## 9. Déploiement continu (GitHub Actions — optionnel)

Pour automatiser les déploiements à chaque push sur `main` :

### `.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: apps/api
          command: deploy --config wrangler.prod.jsonc
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  deploy-web:
    runs-on: ubuntu-latest
    needs: deploy-api
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm --filter web build
        env:
          API_URL: ${{ vars.API_URL }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          workingDirectory: apps/web
          command: pages deploy .next --project-name=le-verger-web --branch=main
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Secrets GitHub à configurer

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Token API Cloudflare (scope: Workers, Pages, Durable Objects) |
| `CLOUDFLARE_ACCOUNT_ID` | ID du compte Cloudflare |

### Variables GitHub à configurer

| Variable | Description |
|----------|-------------|
| `API_URL` | URL de l'API Workers en prod |

---

## 10. Custom domain (optionnel)

### Frontend (Pages)

1. Aller dans **Workers & Pages > le-verger-web > Custom domains**
2. Ajouter `app.leverger.sn` (ou ton domaine)
3. Cloudflare configure automatiquement le DNS

### API (Workers)

1. Aller dans **Workers > verger-api > Triggers**
2. Ajouter une route : `api.leverger.sn/*`
3. Configurer le DNS dans Cloudflare

---

## 11. Monitoring

### Cloudflare Observability

- Logs : **Workers > verger-api > Logs**
- Metrics : **Workers > verger-api > Metrics**

### Neon Dashboard

- **console.neon.tech** → métriques de requêtes, stockage, connections

### Upstash Dashboard

- **console.upstash.com** → métriques Redis (commandes/sec, mémoire, connections)

---

## 12. Rollback

### API (Workers)

```bash
wrangler deploy --config wrangler.prod.jsonc --message "rollback"
# ou via Dashboard : Workers > verger-api > Versions & History → Revert
```

### Frontend (Pages)

```bash
# Via Dashboard : Pages > le-verger-web > Deployments → Revert to previous
```
