# AGENT.md — Le Verger

> **État au 14/08/2026 :** audit complet du code (3 passes lecture seule) → plan de correction `docs/superpowers/plans/2026-08-14-corrections-completes.md` (18 phases, de l'auth au déploiement, une fonctionnalité à la fois). E4–E19 et E22 implémentés, en recette via ce plan. E20 (offline) et E21 (sécurité) non satisfaites — corrections phases 14/15. Déploiement effectif : phase 17 (pas encore fait).

Source de vérité du projet. Lis ce fichier AVANT toute tâche. Si une information manque, signale-le avant de deviner.

## 1. Le projet en 5 lignes

Plateforme de gestion scolaire intégrée pour écoles privées K-12 d'Afrique de l'Ouest (Dakar, Sénégal).
Élèves du CP1 à la Terminale. Résout : suivi manuel des paiements, communication parents (WhatsApp), factures/dépenses disparates, zéro visibilité financière temps réel, suivi pédagogique faible.
Exigence critique : **mode hors-ligne** (coupures internet fréquentes) + notifications **temps réel** au propriétaire.
5 rôles : PROPRIETAIRE, SECRETAIRE, COMPTABLE, ENSEIGNANT, AGENT (voyage bacheliers).

## 2. Stack technique

**Décisions validées (à valider avec l'utilisateur avant de coder) :**

- **Frontend/Framework :** Next.js (App Router) + React + TypeScript, PWA (Workbox + Dexie.js/IndexedDB pour offline)
- **Styling/UI :** Tailwind CSS + shadcn/ui — code couleur école : vert dominant, jaune alertes, rouge erreurs
- **Backend API :** Cloudflare Workers + Hono.js (API edge, routes dédiées par module)
- **Base de données :** Neon (PostgreSQL serverless) via **Drizzle ORM**
- **Temps réel :** Durable Objects (WebSockets) pour alertes instantanées propriétaire
- **Redis :** Upstash Redis (REST, compatible Workers) — rôle par défaut : **queue async** (envois WhatsApp massifs, sync offline) + **cache** (lectures fréquentes, sessions). À confirmer.
- **Auth :** Better Auth, RBAC 5 rôles — **activation progressive : seul PROPRIETAIRE est actif au démarrage**, les autres rôles s'activent avec leurs modules
- **Factures :** PDF personnalisés (logo école, identité élève/parent, lignes détaillées) **envoyés au parent** (WhatsApp/email) — génération à définir à E16 (pdf-lib/pdfmake côté edge ou client)
- **Données :** pas de données fictives en production ni dans la landing page — fixtures de test autorisées en dev uniquement
- **Déploiement :** sans VPS — Cloudflare (Pages pour le front, Workers pour l'API) + Neon + Upstash
- **WhatsApp :** simulation (90% succès / 10% échec) au prototype, puis Meta WhatsApp Cloud API
- **Paiements :** PayTech / Hub2 / Chapa (Mobile Money) — phase Finances

**Coût d'infra au démarrage ≈ 0** (tiers gratuits Workers/Neon/Upstash) — vérifier les quotas exacts à E1.

## 3. Architecture

```
[PWA Next.js (Cloudflare Pages)] ──HTTP──> [Workers + Hono (API edge)] ──Drizzle──> [Neon PostgreSQL]
        │                                        │         │
        ├─ Service Worker (offline cache)        │         └─ Upstash Redis (queue + cache)
        └─ IndexedDB (queue offline, sync auto)  └─ [Durable Objects] ── WebSockets ──> alertes temps réel
```

Flux critique : Secrétaire enregistre un paiement (même offline) → stocké IndexedDB → sync → queue Redis → notification WebSocket instantanée au propriétaire (via DO).

## 4. Rôles & RBAC

**Activation progressive (décision utilisateur) :** seuls les accès PROPRIETAIRE sont ouverts au démarrage. Les autres rôles s'activent avec leurs modules : ENSEIGNANT (phase Pédagogie), SECRETAIRE + COMPTABLE (phase Finances), AGENT (phase Production). Le schéma et le middleware sont conçus pour les 5 dès le départ.

| Rôle | Modules accessibles | Restrictions | Activé en |
|---|---|---|---|
| PROPRIETAIRE | Tout | Aucune | Phase 0 |
| SECRETAIRE | Élèves, paiements, absences, scan QR, notifications | Pas de vue financière globale | Phase 4 |
| COMPTABLE | Factures, dépenses, budget, paiements (lecture) | Pas de modification des notes | Phase 4 |
| ENSEIGNANT | Notes, absences, bulletins | Classes assignées uniquement | Phase 2 |
| AGENT | Partenariats voyage, candidatures | Dossiers assignés uniquement | Phase 5 |

## 5. Plan de construction — étapes

Macro-phases **réordonnées : pédagogie avant finances** (décision utilisateur — le PRD plaçait les paiements en priorité ; conséquence assumée : le dashboard aura des KPIs financiers vides jusqu'à la phase Finances, et le temps réel se branche d'abord sur les absences/notes). Chaque étape = livrable fonctionnel + critère de validation.

### Phase 0 — Fondations (avant tout code)
- [x] **E1. Setup projet** : **monorepo** avec `apps/web` (Next.js) + `apps/api` (Workers/Hono) — TS + Tailwind + shadcn/ui + ESLint/Prettier + structure de dossiers + vérification des tiers gratuits (Workers, Neon, Upstash) — *fait le 11/08/2026*
- [x] **E2. Schéma Drizzle complet** : 16 entités du PRD §6.2 (users, niveaux, classes, parents, élèves+QR, paiements, factures+lignes, messages WhatsApp, événements, notifications, personnel, absences, notes, dépenses, agents voyage, candidatures) — *fait le 11/08/2026 : 18 tables dans `packages/shared/src/schema.ts` (migrations drizzle-kit à générer à E3 avec la config Neon)*
- [x] **E3. Auth** : Better Auth (compatible Workers), **rôle PROPRIETAIRE actif seul**, middleware de protection — schéma prévoit les 5 rôles, activation progressive (cf. §4) — *fait le 11/08/2026 : better-auth + drizzleAdapter Neon HTTP dans `apps/api/src/lib/auth.ts` (factory `createAuth(env)`) ; `auth.config.ts` dédié au CLI ; schéma auth généré par `better-auth generate` dans `packages/shared/src/auth-schema.ts` (user/session/account/verification, champ `role` + `phone` custom) ; fusionné avec les 17 tables domaine (22 tables en base avec `jwks`) ; script `create-owner` (role À PLAT dans le body signUpEmail) → compte `admin@verger.local` créé avec `role=PROPRIETAIRE` ; test runtime : sign-in curl OK, session + cookie OK ; plugin `dash()` (dashboard Sentinel `dash.better-auth.com`) monté avec `apiKey` passée explicitement (Workers : pas de process.env) ; plugin `jwt()` ajouté (requis par dash : `/api/auth/jwks`) ; **binding BETTER_AUTH_API_KEY câblé dans `index.ts`** (dernier bug : env partiel passé à createAuth → `apiKey: 'missing'` dans le plugin) ; **dashboard Sentinel connecté avec succès le 11/08/2026** (clé projet `ba_wwfg3...`, tunnel cloudflared `--protocol http2` — QUIC/UDP 7844 bloqué par le FAI → HTTP2 obligatoire) ; compte owner dev à remplacer avant prod*
- [x] **E4. Setup visuel + structure** : palette école (vert/jaune/rouge), layout shell avec navigation latérale, saisie des vraies niveaux/classes de l'école par le propriétaire — **pas de seed de données fictives**

### Phase 1 — Prototype cœur (2-3 semaines)
- [x] **E5. Landing page** publique : hero + slogan, présentation Primaire/Collège/Lycée, avantages différenciants, contact — **aucune donnée fictive** : section chiffres clés dynamique (masquée si base vide)
- [x] **E6. Page Tarifs & Offres** (publique, **statique**) : prix des inscriptions + toutes les offres de l'école — contenu figé dans le code/fichier de config, non modifiable par le propriétaire depuis l'app
- [x] **E7. Dashboard** : KPIs élèves d'abord (répartition par niveau), placeholders financiers (revenus, impayés) — complétés en phase Finances
- [x] **E8. Élèves** : CRUD, matricule auto `ELE-AAAA-NNN`, QR code unique, recherche/filtres, fiche modale — *recette en cours : QR des élèves existants à régénérer (plan corrections phase 2)*
- [x] **E9. Infra temps réel** : Durable Object WebSocket + queue Upstash Redis branchées sur le premier événement réel (absence signalée) — plomberie réutilisable pour les paiements ensuite — *recette en cours : auth WS/broadcast à ajouter, Redis abandonné au prototype (D5)*
- [x] **E10. Scan QR** : zone de scan + recherche manuelle par matricule → fiche complète < 2s

### Phase 2 — Pédagogie (1-2 semaines)
- [x] **E11. Absences** : saisie par classe/date, motif/justification, stats (total/justifiées/non), notification WhatsApp absences non justifiées (simulée) + **activation rôle ENSEIGNANT** — *recette en cours : rôle ENSEIGNANT non câblé (plan corrections phase 5)*
- [x] **E12. Notes + bulletins** : saisie par élève/matière/trimestre, coefficients, moyennes pondérées auto, bulletins consultables, filtres classe/trimestre/matière

### Phase 3 — Communication (1-2 semaines)
- [x] **E13. WhatsApp** : envoi individuel, compteur caractères, statuts — simulation 90/10 via queue Redis, puis branchement API réelle — *recette en cours : simulation à centraliser (simulateSend), Redis abandonné au prototype (D5)*
- [x] **E14. Événements + envoi de masse** : CRUD événements (titre, description, date, lieu, type, public cible), variable `{{PARENT}}`, rapport succès/échecs

### Phase 4 — Finances (1-2 semaines)
- [x] **E15. Paiements** : CRUD, statuts EN_ATTENTE/VALIDE/ANNULE, méthodes (Espèces/Mobile Money/Virement), notification temps réel via DO (réutilise E9) + **activation rôles SECRETAIRE + COMPTABLE** — *recette en cours : pagination à ajouter (plan corrections phase 9)*
- [x] **E16. Factures + PDF** : numéro auto `FAC-AAAANNNN`, lignes multiples, total/payé/reste, statuts, marquer payée — **génération de PDF personnalisé** (logo école, identité élève/parent, lignes) **et envoi au parent** (WhatsApp/email) — *recette en cours : impression A4 actée au prototype (D4), stats à réparer (plan corrections phase 10)*
- [x] **E17. Dépenses + budget** : catégorisation, tableau de bord revenus vs dépenses, solde net, répartition visuelle + complétion des KPIs financiers du dashboard (E7)

### Phase 5 — Production (2-3 semaines)
- [x] **E18. Personnel** : fiches (identité, rôle, matière, salaire), absences personnel, stats par rôle
- [x] **E19. Partenariats voyage** : registre agences, candidatures (EN_ATTENTE/EN_COURS/ACCEPTE/REFUSE) + **activation rôle AGENT**
- [ ] **E20. Mode offline complet** : Service Worker, IndexedDB queue, auto-sync via queue Redis, indicateur en ligne/hors-ligne permanent — **NON SATISFAITE : queue IndexedDB non branchée au fetch (stub). Correction prévue : plan corrections phase 14.**
- [ ] **E21. Sécurité** : HTTPS, protection injections/XSS, journalisation actions sensibles, expiration sessions — **NON SATISFAITE : escalation privilèges au signup, CORS en dur, audit_logs jamais écrits. Corrections prévues : plan corrections phases 1 + 15.**
- [x] **E22. Déploiement + recette** : Cloudflare Pages + Workers, formation, passage des critères d'acceptation (§11 du PRD) — *fait le 12/08/2026 : configuration wrangler.prod.jsonc, next.config.ts (standalone), scripts deploy.ps1/deploy.sh, DEPLOY.md, templates .env. URLs de prod à remplir après déploiement effectif.*

**Ordre assumé (décision utilisateur) : pédagogie avant finances.** Le propriétaire attend les paiements ; il verra d'abord la pédagogie. Les KPIs financiers du dashboard restent en placeholder jusqu'à la phase 4.

**PRD §11 amendé (décision utilisateur) :** le critère "données de démonstration" est annulé — aucune donnée fictive en production ni dans la landing page ; les fixtures de test restent confinées en dev.

## 6. Conventions

- **Langue** : code et UI en français (exigence PRD), identifiants techniques en anglais
- **Commits** : messages descriptifs en français, un commit = une étape ou un fix
- **Secrets** : JAMAIS de clé API/token en dur — fichier `.env.local` (racine du monorepo) jamais commité
- **Outils & CLI** : pour CHAQUE outil du projet, utiliser son CLI officiel — jamais l'interface web ni l'API REST à la main :
  - Neon → `neonctl` (auth via API key dans `.env.local`)
  - Cloudflare (Workers, Durable Objects, Pages) → `wrangler`
  - Upstash (Redis) → CLI `upstash` (à confirmer à E9)
- **Données sensibles** : vidéos/données élèves stockées localement, pas de cloud non autorisé
- **Notifications** : à chaque fin de tâche, lancer `& "$env:USERPROFILE\notify.ps1"` (done ou help)
- **Mémoire** : mettre à jour `MEMORY.md` après chaque modification (tâche → erreurs → fix)

## 8. URLs de production (E22)

| Service | URL | Statut |
|---------|-----|--------|
| Frontend (Cloudflare Pages) | `https://le-verger-web.pages.dev` | ⬜ À déployer |
| API (Cloudflare Workers) | `https://verger-api.<TON_COMPTE>.workers.dev` | ⬜ À déployer |
| Neon DB (prod) | `console.neon.tech` | ⬜ À configurer |
| Upstash Redis (prod) | `console.upstash.com` | ⬜ À configurer |

**Note :** Remplacer `<TON_COMPTE>` par le nom du compte Cloudflare réel après le premier déploiement.

## 9. Documents de référence

- `Le_Verger_PRD.docx` — spec produit (source de vérité fonctionnelle, 11 sections) — **amendé par AGENT.md** : ordre des phases (pédagogie avant finances), pas de données fictives (§11), page Tarifs & Offres dédiée, factures en PDF envoyées aux parents
- `CODING_AGENT_GUIDE.md` — guide technique (partiel, s'arrête à l'étape 5, stack partiellement écartée)
- `AGENT.md` — le présent fichier (décisions + plan) — **fait foi en cas de divergence**
