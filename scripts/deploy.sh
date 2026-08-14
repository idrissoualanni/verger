#!/bin/bash
# ============================================
# Le Verger — Script de déploiement (bash)
# ============================================
# Usage :
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Prérequis :
#   - pnpm installé globalement
#   - wrangler CLI installé et authentifié (`wrangler login`)
#   - Variables d'environnement configurées dans Cloudflare Dashboard
#   - Neon DB production configurée
# ============================================

set -e

echo -e "\033[36m=== Le Verger — Déploiement ===\033[0m"

# 1. Vérification des prérequis
echo -e "\n\033[33m[1/5] Vérification des prérequis...\033[0m"

for cmd in pnpm wrangler node; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "\033[31mERREUR : $cmd n'est pas installé ou pas dans le PATH\033[0m"
        exit 1
    fi
done

echo "  ✓ pnpm: $(pnpm --version)"
echo "  ✓ wrangler: $(wrangler --version 2>&1 | grep -oP '\d+\.\d+' | head -1)"
echo "  ✓ node: $(node --version)"

# 2. Installation des dépendances
echo -e "\n\033[33m[2/5] Installation des dépendances...\033[0m"
pnpm install --frozen-lockfile

# 3. Build de l'API
echo -e "\n\033[33m[3/5] Build et déploiement de l'API (Cloudflare Workers)...\033[0m"
cd apps/api
wrangler deploy --config wrangler.prod.jsonc
API_URL="https://verger-api.<TON_COMPTE>.workers.dev"
cd ../..
echo "  ✓ API déployée : $API_URL"

# 4. Build du web
echo -e "\n\033[33m[4/5] Build du frontend (Next.js)...\033[0m"
cd apps/web
API_URL=$API_URL pnpm run build:prod
cd ../..
echo "  ✓ Frontend build terminé"

# 5. Déploiement du web sur Cloudflare Pages
echo -e "\n\033[33m[5/5] Déploiement du frontend (Cloudflare Pages)...\033[0m"
cd apps/web
wrangler pages deploy .next --project-name=le-verger-web --branch=main
WEB_URL="https://le-verger-web.pages.dev"
cd ../..

# ============================================
# Résumé du déploiement
# ============================================
echo -e "\n\033[32m=== Déploiement terminé ===\033[0m"
echo -e "\033[36mFrontend : $WEB_URL\033[0m"
echo -e "\033[36mAPI      : $API_URL\033[0m"
echo -e "\n\033[33mN'oublie pas de configurer les variables d'environnement dans :\033[0m"
echo -e "\033[33m  - Cloudflare Workers Dashboard (API) : DATABASE_URL, BETTER_AUTH_SECRET, etc.\033[0m"
echo -e "\033[33m  - Cloudflare Pages Dashboard (Web)   : API_URL, BETTER_AUTH_SECRET, etc.\033[0m"
