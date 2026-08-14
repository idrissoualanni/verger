# ============================================
# Le Verger — Script de déploiement
# ============================================
# Usage (PowerShell) :
#   .\scripts\deploy.ps1
#
# Prérequis :
#   - pnpm installé globalement
#   - wrangler CLI installé et authentifié (`wrangler login`)
#   - Variables d'environnement configurées dans Cloudflare Dashboard
#   - Neon DB production configurée
# ============================================

$ErrorActionPreference = "Stop"

Write-Host "=== Le Verger — Déploiement ===" -ForegroundColor Cyan

# 1. Vérification des prérequis
Write-Host "`n[1/5] Vérification des prérequis..." -ForegroundColor Yellow

$commands = @("pnpm", "wrangler", "node")
foreach ($cmd in $commands) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERREUR : $cmd n'est pas installé ou pas dans le PATH" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  ✓ pnpm: $(pnpm --version)"
Write-Host "  ✓ wrangler: $(wrangler --version 2>&1 | Select-String -Pattern '\d+\.\d+' | ForEach-Object { $_.Matches.Value })"
Write-Host "  ✓ node: $(node --version)"

# 2. Installation des dépendances
Write-Host "`n[2/5] Installation des dépendances..." -ForegroundColor Yellow
pnpm install --frozen-lockfile

# 3. Build de l'API
Write-Host "`n[3/5] Build et déploiement de l'API (Cloudflare Workers)..." -ForegroundColor Yellow
Push-Location apps/api
wrangler deploy --config wrangler.prod.jsonc
$apiUrl = "https://verger-api.<TON_COMPTE>.workers.dev"
Pop-Location
Write-Host "  ✓ API déployée : $apiUrl"

# 4. Build du web
Write-Host "`n[4/5] Build du frontend (Next.js)..." -ForegroundColor Yellow
Push-Location apps/web
$env:API_URL = $apiUrl
pnpm run build:prod
Pop-Location
Write-Host "  ✓ Frontend build terminé"

# 5. Déploiement du web sur Cloudflare Pages
Write-Host "`n[5/5] Déploiement du frontend (Cloudflare Pages)..." -ForegroundColor Yellow
Push-Location apps/web
wrangler pages deploy .next --project-name=le-verger-web --branch=main
$webUrl = "https://le-verger-web.pages.dev"
Pop-Location

# ============================================
# Résumé du déploiement
# ============================================
Write-Host "`n=== Déploiement terminé ===" -ForegroundColor Green
Write-Host "Frontend : $webUrl" -ForegroundColor Cyan
Write-Host "API      : $apiUrl" -ForegroundColor Cyan
Write-Host "`nN'oublie pas de configurer les variables d'environnement dans :" -ForegroundColor Yellow
Write-Host "  - Cloudflare Workers Dashboard (API) : DATABASE_URL, BETTER_AUTH_SECRET, etc." -ForegroundColor Yellow
Write-Host "  - Cloudflare Pages Dashboard (Web)   : API_URL, BETTER_AUTH_SECRET, etc." -ForegroundColor Yellow
