# Plan de correction complet — Le Verger

> **Pour les agents d'exécution :** sous-skill requis : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Chaque étape utilise la syntaxe `- [ ]`.

**Goal :** Corriger l'intégralité des erreurs identifiées par l'audit du 14/08/2026, de l'authentification jusqu'aux dernières fonctionnalités, **une fonctionnalité à la fois**, puis déployer en production.

**Architecture :** monorepo pnpm — `apps/web` (Next.js App Router, shadcn/ui, proxy `/api/*` vers le worker), `apps/api` (Cloudflare Workers + Hono + Better Auth + Drizzle/Neon), `packages/shared` (schéma + types). L'audit a confirmé que le code est très en avance sur AGENT.md (E4–E21 non cochées mais implémentées) mais avec des trous réels listés phase par phase.

**Tech Stack :** Next.js 16, Hono, Better Auth 1.6.26, Drizzle ORM, Neon PostgreSQL, Durable Objects (WebSockets), Tailwind 4 + shadcn/ui, TypeScript.

**Méthode de ce plan maître :** chaque phase définit un objectif testable + les corrections précises (fichiers/lignes issus de l'audit). Au moment d'exécuter une phase, on la détaille en tâches TDD bite-sized (code complet, test d'abord) dans la session d'exécution, avant de passer à la suivante. **Une phase ne commence pas tant que la précédente n'est pas validée.**

---

## Décisions par défaut (réversibles à la phase concernée)

| # | Sujet | Décision par défaut | Reversibilité |
|---|---|---|---|
| D1 | Inscription publique | **Fermée.** Les comptes sont créés par le PROPRIETAIRE (page Utilisateurs). Le `/register` public est supprimé ou verrouillé (hors premier admin). | Phase 1 |
| D2 | Activation des rôles | **Progressive, module par module** : ENSEIGNANT (absences/notes/bulletins), SECRETAIRE (élèves/scan/absences), COMPTABLE (factures/budget/paiements lecture), AGENT (voyage — déjà actif). Conforme au tableau RBAC de AGENT.md §4. | Chaque phase |
| D3 | Offline (E20) | **Vrai offline complet** : queue IndexedDB branchée au fetch, rejeu au retour en ligne, indicateur permanent. | Phase 14 |
| D4 | Factures PDF (E16) | **Impression A4 navigateur actée pour le prototype.** PDF serveur = évolution post-déploiement. | Phase 10 |
| D5 | Redis/Upstash | **Abandonné au prototype.** Queue WhatsApp simulée en mémoire. Retirer Redis du schéma d'architecture AGENT.md. | Phase 7 |
| D6 | Git | **`git init` + commit initial en Phase 0.** Aucun travail n'est sauvegardé aujourd'hui (dossier non-git). | Phase 0 |
| D7 | notify.ps1 | **Script absent alors qu'exigé par CLAUDE.md.** Créer `C:\Users\hp\notify.ps1` (done/help) en Phase 0. | Phase 0 |

---

## Registre des bugs de l'audit (source : 3 audits lecture seule, 14/08/2026)

- **CRITIQUE — Escalade de privilèges** : le body de `/sign-up/email` accepte `role` à plat, injecté tel quel → n'importe qui devient PROPRIETAIRE. Prouvé par `scripts/create-owner.ts`.
- **CRITIQUE — CORS/trustedOrigins en dur** : `origin: ["http://localhost:3000"]` dans `index.ts` et `trustedOrigins` dans `auth.ts` → bloquant en prod.
- **401 trompeur** : les middlewares (`requireOwner` etc.) renvoient **401** aussi bien sans session qu'avec session mais mauvais rôle. Un compte SECRETAIRE (défaut d'inscription) reçoit "Non autorisé" sur tout.
- **QR codes absents des élèves existants** : `qrCodeUrl` généré à la création ; les élèves créés avant la colonne ont `NULL` → pas d'image. Pas d'accès QR dans la liste des élèves.
- **Sidebar** : liens Scan QR et Paiements désactivés ("bientôt") alors que les pages sont fonctionnelles.
- **Temps réel non protégé** : `/api/broadcast` et `/api/ws/notifications` sans authentification ; type d'événement non validé ; buffer DO non persistant ; **provider de polling cassé** (`/notifications/recent` inexistant) monté dans le layout racine, échec silencieux, en concurrence avec le hook WS.
- **Offline** : `offline-queue.ts` est un stub non branché au fetch.
- **Audit logging mort** : table `audit_logs` + lib `src/lib/audit.ts` jamais importées/écrites. E21 non satisfaite.
- **Rate limiting** : fenêtre fixe in-memory (Map), fuite mémoire (entrées jamais purgées), clé `"unknown"` partagée, GET non limités, non distribué.
- **Injection SQL potentielle** : préfixe matricule/numéro facture (`year`, `prefix`) interpolé dans du SQL brut non paramétré (`students.ts`, `invoices.ts`).
- **`GET /api/invoices/stats` en 500** : `sql\`sum(totalAmount - paidAmount, 0)\`` — syntaxe SQL invalide.
- **Code mort / parasite** : `db.insert(invoices as any).values({}).catch(()=>{})` dans `POST /invoices/:id/send` (L261) ; seed auto matières ; constantes magiques `0.9` dupliquées 3× (whatsapp.ts a pourtant `simulateSend()`).
- **`DELETE /api/classes/:id` garde-fou factice** : compte `classes` au lieu de `students` (TODO E8, L162).
- **Secrets incohérents** : secret de session différent entre `.dev.vars` (`dev-secret-…`) et `.env.local` racine (`2c62f38a…`) ; fallback `secret: "dev-secret-not-for-prod"` dans `auth.config.ts`.
- **Headers** : pas de CSP, pas de HSTS, pas de Referrer-Policy (seulement nosniff/X-Frame/X-XSS).
- **Deux systèmes de notification** ; **`GET /api/payments` sans pagination** ; **E11/E15 rôles ENSEIGNANT/SECRETAIRE/COMPTABLE non activés** ; **E16 PDF serveur absent** ; **E20 offline stub** ; **`notify.ps1` absent**.

---

## PHASE 0 — Fondations (git + notifications + AGENT.md)

**Objectif :** sécuriser le chantier (sauvegarde) et rétablir l'outillage obligatoire.

- [ ] **0.1 — `git init`** à la racine `C:\Users\hp\Desktop\verger` ; vérifier `.gitignore` (exclut `node_modules`, `.next`, `.wrangler`, `*.env`, `.dev.vars`, `drizzle/` si voulu — **jamais** `.env.example`).
- [ ] **0.2 — Premier commit** : `git add -A && git commit -m "chore: état de référence avant corrections (audit 14/08/2026)"`.
- [ ] **0.3 — Créer `C:\Users\hp\notify.ps1`** : script PowerShell acceptant `-Title`, `-Message`, `-Type` (`done`/`help`), envoyant une notification toast Windows (fonction `New-BurntToastNotification` si disponible, sinon notification Windows classique via `System.Windows.Forms.NotifyIcon`). Critère : `& "$env:USERPROFILE\notify.ps1" -Title "Test" -Message "OK" -Type "done"` affiche une notification.
- [ ] **0.4 — Mettre à jour AGENT.md** : cocher E4–E19 et E22 **"fait (recette en cours)"** — E20/E21 restent non cochées (vraies corrections en Phase 14/15). Ajouter l'état "en correction" en tête du plan. Commit : `docs: état réel après audit`.

**Validation phase 0 :** `git log` montre le commit de référence ; notification test OK.

---

## PHASE 1 — Authentification & rôles (CRITIQUE)

**Objectif :** fermer l'escalade de privilèges, rendre la config d'auth déployable, corriger le 401 trompeur, créer la gestion des comptes par le propriétaire.

- [ ] **1.1 — Bloquer l'escalade de privilèges (CRITIQUE)**
  - Fichier : `apps/api/src/lib/auth.ts`
  - Forcer le rôle côté serveur : ajouter `databaseHooks: { user: { create: { before: async (user) => { user.role = "SECRETAIRE"; return user; } } } }` (vérifier la signature exacte sur la doc Better Auth 1.6 via context7 avant implémentation).
  - Supprimer le passage de `role` dans le body de `scripts/create-owner.ts` (le rôle sera posé après création via une mise à jour directe en base, ou via le plugin admin).
  - **Option A (recommandée)** : installer le **plugin admin** de Better Auth (`better-auth/plugins`, `admin()`) — gestion native des rôles : `auth.api.listUsers`, `createUser`, `setRole`. Remplacer `requireOwner`/`requireRole` par la vérification de session + rôle via l'API admin si l'adaptation est propre ; sinon garder les helpers actuels (ils lisent `user.role` de la session, c'est compatible).
  - **Test** : `POST /api/auth/sign-up/email` avec `role: "PROPRIETAIRE"` dans le body → le compte créé a `role = SECRETAIRE` (ou refus). Vérifié en base.
- [ ] **1.2 — Configuration par environnement (CRITIQUE)**
  - `apps/api/src/index.ts` : remplacer `origin: ["http://localhost:3000"]` par `origin: env.CORS_ORIGINS?.split(",").filter(Boolean) ?? ["http://localhost:3000"]` (binding `CORS_ORIGINS` ajouté dans `wrangler.jsonc` + `.dev.vars` + `wrangler.prod.jsonc`).
  - `apps/api/src/lib/auth.ts` : `trustedOrigins` → `env.TRUSTED_ORIGINS?.split(",") ?? ["http://localhost:3000"]`.
- [ ] **1.3 — Secret unique & cohérent**
  - Générer un secret fort (`openssl rand -base64 32`), le mettre dans `.dev.vars` (`BETTER_AUTH_SECRET`), remplacer les valeurs divergentes (`.env.local` racine, `auth.config.ts`). Retirer le fallback `"dev-secret-not-for-prod"` de `auth.config.ts` (échec si absent).
- [ ] **1.4 — 401 vs 403 (corriger le message "Non autorisé")**
  - `apps/api/src/lib/auth.ts` (helpers) : **401** si pas de session (non connecté) ; **403** si session mais rôle insuffisant. Repérer tous les `c.json({ error: "Non autorisé" }, 401)` des routeurs (`students.ts`, `levels.ts`, `grades.ts`, `absences.ts`, `events.ts`, `invoices.ts`, `expenses.ts`, `staff.ts`, `whatsapp.ts`) et les faire passer par les helpers.
  - `apps/web/src/lib/api.ts` : gérer `403` avec un message clair ("Accès refusé pour votre rôle").
- [ ] **1.5 — Gestion des utilisateurs par le propriétaire**
  - Route API : `GET/POST /api/users`, `PATCH /api/users/:id/role`, `DELETE /api/users/:id` (PROPRIETAIRE uniquement) — via plugin admin si retenu en 1.1.
  - Page web : `/utilisateurs` (liste, création avec rôle, changement de rôle, désactivation). Lien dans la sidebar (section Administration).
  - `/register` : verrouillé (redirection vers /login + message) ou supprimé du middleware public. Le premier compte est créé via script ou via la page après un premier admin créé en base.
- [ ] **1.6 — Tests de bout en bout**
  - `curl` : sign-in admin → cookie ; `GET /api/levels` avec session owner → 200 ; avec session SECRETAIRE → 403 ; sans session → 401.
  - Navigateur : login admin → navigation complète OK.

**Sécurité phase 1 :** plus aucun chemin ne permet d'auto-attribuer un rôle ; CORS/trustedOrigins configurables ; secret unique ; messages d'erreur honnêtes.

**Validation phase 1 :** le script de test 1.6 passe intégralement. Un compte créé via signup public (si maintenu) est toujours SECRETAIRE en base.

---

## PHASE 2 — Élèves + QR codes

**Objectif :** QR codes présents pour tous les élèves, accessibles et exploitables.

- [ ] **2.1 — Régénérer les QR des élèves existants** : script one-shot (route admin ou script local) qui met à jour `qrCodeUrl` pour chaque élève avec `qrCodeUrl IS NULL` (URL `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=<matricule>`). **Ne jamais réécrire les QR existants.**
- [ ] **2.2 — Accès QR dans la liste** : colonne ou bouton "QR" par élève dans `/eleves` → ouvre la fiche modale (existant) ; ajouter boutons **Télécharger** (lien direct `qrCodeUrl`) et **Imprimer la carte** (petite carte d'identité élève A6 : photo absente → logo + nom + matricule + QR, `@media print`).
- [ ] **2.3 — Robustesse** : si `qrCodeUrl` manque (élève sans QR), afficher un placeholder + bouton "Générer le QR" qui PATCH l'élève (route API `PATCH /api/students/:id` gère `qrCodeUrl`).
- [ ] **2.4 — Sécurité** : vérifier que la route QR (`GET /api/students/:id`) reste protégée ; le QR n'encode que le matricule (aucune donnée sensible) — documenter ce choix.

**Validation phase 2 :** 100 % des élèves actifs ont un QR ; depuis la liste, 2 clics → carte imprimable ; scan d'une carte générée → fiche complète.

---

## PHASE 3 — Temps réel & notifications (sécurité + fusion)

**Objectif :** un seul système de notifications, authentifié et validé.

- [ ] **3.1 — Authentifier le WebSocket et le broadcast**
  - `apps/api/src/do.ts` (NotificationHub) : exiger une session valide pour `GET /ws` (vérifier le cookie/session avant upgrade — impossible de passer par les middlewares Hono dans le DO : vérifier le cookie via le handler Better Auth dans `index.ts` avant l'upgrade).
  - `POST /api/broadcast` : middleware `requireAuth` (ou `requireOwner` pour les broadcasts de masse) + validation du type contre `APP_EVENT_TYPES` (packages/shared).
- [ ] **3.2 — Fusion des deux systèmes** : supprimer le provider polling `providers/notifications-provider.tsx` du layout racine (route inexistante `/notifications/recent`) ; garder le hook WebSocket `hooks/use-notifications.ts` comme unique source ; vérifier la reconnexion WS (reconnect automatique).
- [ ] **3.3 — Buffer persistant** : optionnel au prototype — documenter la limite (100 événements en mémoire, perdu au restart) ou passer à un stockage Durable Object persisté (`ctx.storage`). Décision : rester en mémoire, documenté.
- [ ] **3.4 — Événements réels** : brancher le broadcast sur les absences signalées (aujourd'hui seul `POST /payments` l'utilise) — conformité E9 ("premier événement réel = absence").

**Validation phase 3 :** un WS non authentifié est refusé ; un broadcast d'événement de type inconnu est rejeté ; la page Notifications n'affiche plus d'erreur console ; une absence signalée apparaît en temps réel sur le dashboard propriétaire.

---

## PHASE 4 — Scan QR

**Objectif :** page accessible et robuste.

- [ ] **4.1 — Activer le lien Scan QR dans la sidebar** (retirer le marquage "bientôt").
- [ ] **4.2 — Gestion d'erreurs caméra** : message clair si permission refusée / navigateur non supporté (fallback saisie manuelle — existant) ; test sur Chrome desktop + Android (BarcodeDetector).

**Validation phase 4 :** accès au scan depuis la sidebar ; scan d'un QR élève → fiche < 2 s ; saisie manuelle fonctionne.

---

## PHASE 5 — Absences + rôle ENSEIGNANT

**Objectif :** conformité E11 : rôles câblés, simulation propre, stats.

- [ ] **5.1 — RBAC** : middleware `requireEnseignant` (ou `requireRoles(["PROPRIETAIRE","ENSEIGNANT"])`) sur les routes absences ; restriction "classes assignées uniquement" : ajouter `teacherId`/assignation classe→enseignant (table `staff` ou nouvelle relation) — **vérifier le PRD §4 avant** : si l'assignation n'existe pas dans le schéma, la documenter comme limite assumée (l'enseignant accède à toutes les classes au prototype).
- [ ] **5.2 — Nettoyage simulation** : utiliser `simulateSend()` (whatsapp.ts) au lieu de `Math.random() < 0.9` dupliqué ; marquer `notified=true` seulement si succès (déjà le cas).
- [ ] **5.3 — Page** : vérifier saisie par classe/date, motif, justification, stats (total/justifiées/non), notification WhatsApp des absences non justifiées.

**Validation phase 5 :** un compte ENSEIGNANT peut saisir/justifier des absences mais pas toucher aux autres modules ; les stats sont exactes après saisie test.

---

## PHASE 6 — Notes & bulletins + ENSEIGNANT

**Objectif :** conformité E12, rôles, exactitude des moyennes.

- [ ] **6.1 — RBAC** : `requireRoles(["PROPRIETAIRE","ENSEIGNANT"])` sur grades/subjects/bulletins (mêmes règles d'assignation que 5.1).
- [ ] **6.2 — Vérifier les calculs** : moyennes pondérées par coefficient, rang, moyenne de classe, appréciations — tests unitaires sur `GET /api/grades/averages` et `/bulletin` avec un jeu de notes connu (3 élèves, 2 matières, coefficients différents) → résultats attendus écrits dans le test.
- [ ] **6.3 — `POST /api/subjects`** : ne pas accepter l'`id` client (générer côté serveur) ; gérer l'unicité du nom.

**Validation phase 6 :** les tests de calcul passent ; un ENSEIGNANT saisit des notes et voit le bulletin recalculé.

---

## PHASE 7 — WhatsApp (nettoyage + décision Redis)

**Objectif :** une seule simulation, zéro code mort, historique fiable.

- [ ] **7.1 — Centraliser** : `simulateSend()` est la seule source de la simulation 90/10 ; l'utiliser dans whatsapp.ts, absences.ts, events.ts, invoices.ts.
- [ ] **7.2 — Supprimer le code mort** : ligne parasite `db.insert(invoices as any).values({})` (invoices.ts L261) ; le `send` de factures doit insérer dans `whatsapp_messages` comme les autres.
- [ ] **7.3 — Redis** : appliquer D5 — retirer Upstash Redis de AGENT.md §2/§3 (architecture et stack) ; documenter que la queue WhatsApp est simulée en mémoire jusqu'à la vraie API Meta.
- [ ] **7.4 — Compteur de caractères + statuts** : vérifier la page (existant), tests sur l'historique et les stats.

**Validation phase 7 :** grep `0.9` ne retourne plus de constantes magiques hors `simulateSend()` ; un envoi de facture apparaît dans l'historique WhatsApp.

---

## PHASE 8 — Événements

**Objectif :** conformité E14, nettoyage.

- [ ] **8.1 — Réutiliser `simulateSend()`** dans `POST /api/events/:id/notify` (déduplication par téléphone — existant).
- [ ] **8.2 — Vérifier** la variable `{{PARENT}}` (remplacée par le nom du parent), le rapport succès/échecs, le calendrier CSS (types, couleurs), le filtrage par mois/type/audience.

**Validation phase 8 :** envoi de masse → rapport `{sent, failed}` cohérent avec l'historique.

---

## PHASE 9 — Paiements + SECRETAIRE/COMPTABLE

**Objectif :** conformité E15 : RBAC complet, stats, temps réel.

- [ ] **9.1 — RBAC complet** : vérifier chaque route payments :
  - `GET /api/payments` : PROPRIETAIRE + SECRETAIRE + COMPTABLE (lecture).
  - `POST/PATCH` : PROPRIETAIRE + SECRETAIRE (COMPTABLE 403 — déjà câblé).
  - `GET /api/payments/stats` : PROPRIETAIRE (+ SECRETAIRE ? décision : **PROPRIETAIRE seul** pour les stats financières, conforme "SECRETAIRE pas de vue financière globale" du tableau RBAC — vérifier ce que le tableau impose : SECRETAIRE "Pas de vue financière globale" → stats = vue financière globale → PROPRIETAIRE seul, OK).
  - `GET /api/payments/unpaid` : PROPRIETAIRE + SECRETAIRE.
- [ ] **9.2 — Pagination** : ajouter limit/offset + `total` COUNT à `GET /api/payments` (aujourd'hui toutes les lignes en mémoire).
- [ ] **9.3 — Temps réel** : vérifier que le broadcast PAIEMENT (self-fetch) passe par la nouvelle auth de la Phase 3 (l'événement est déjà authentifié, le broadcast interne doit utiliser une clé interne ou un header interne — à concevoir proprement, ne pas exposer le broadcast public).

**Validation phase 9 :** SECRETAIRE crée un paiement → visible en temps réel chez le propriétaire ; COMPTABLE voit la liste mais pas les stats ; la liste est paginée.

---

## PHASE 10 — Factures (fix 500 + code mort + décision PDF)

**Objectif :** conformité E16 sans bug.

- [ ] **10.1 — Fix `GET /api/invoices/stats`** : remplacer `sum(totalAmount - paidAmount, 0)` par deux `sum` séparés puis soustraction en JS (ou `sql\`sum(totalAmount) - sum(paidAmount)\`` — vérifier la syntaxe). Tester : la route répond 200 avec des données réelles.
- [ ] **10.2 — Supprimer le code mort** (ligne parasite L261) ; le `send` insère dans `whatsapp_messages` (cf. 7.2).
- [ ] **10.3 — Décision PDF (D4)** : acter l'impression A4 (`/factures/[id]/print`, `window.print()`) comme livrable E16 du prototype. Vérifier la mise en page A4 (logo, identité élève/parent, lignes, total/payé/reste).
- [ ] **10.4 — Numéro auto** : paramétrer le préfixe dans le SQL (fix injection, cf. registre) — `FAC-AAAANNNN`.

**Validation phase 10 :** stats 200 ; impression A4 correcte ; numéro séquentiel ; aucun code mort dans invoices.ts.

---

## PHASE 11 — Budget & dépenses + KPIs dashboard

**Objectif :** conformité E17 + compléter les placeholders financiers du dashboard (E7).

- [ ] **11.1 — RBAC** : PROPRIETAIRE + COMPTABLE sur expenses/budget (COMPTABLE modifie, PROPRIETAIRE tout) ; SECRETAIRE exclu (vue financière globale).
- [ ] **11.2 — Dashboard** : remplacer les placeholders financiers par les vraies données (`GET /api/budget`, `GET /api/expenses/monthly`) ; le dashboard reste PROPRIETAIRE (ou PROPRIETAIRE+COMPTABLE pour la vue financière).

**Validation phase 11 :** le dashboard propriétaire montre revenus/dépenses/solde réels ; COMPTABLE voit le budget, SECRETAIRE non.

---

## PHASE 12 — Personnel

**Objectif :** conformité E18, nettoyage.

- [ ] **12.1 — RBAC** : PROPRIETAIRE seul (fiches = données RH sensibles) — vérifier le PRD.
- [ ] **12.2 — Vérifier** : fiches (identité, rôle, matière, salaire), absences personnel (le PRD mentionne "absences personnel" — **vérifier si implémenté**, sinon le signaler comme écart assumé), stats par rôle, masse salariale.

**Validation phase 12 :** CRUD + stats exacts ; écart "absences personnel" documenté (fait ou assumé).

---

## PHASE 13 — Voyage + AGENT

**Objectif :** conformité E19 (déjà largement fait).

- [ ] **13.1 — Restriction "dossiers assignés uniquement"** : l'AGENT voit toutes les candidatures (middleware `requireProprietaireOrAgent` sans filtre d'assignation) — documenter la limite ou implémenter l'assignation si le schéma le permet (relation application→agent).
- [ ] **13.2 — Ajouter `DELETE`** agences/candidatures si jugé nécessaire (audit : absent).

**Validation phase 13 :** un AGENT gère les candidatures sans accès aux autres modules.

---

## PHASE 14 — Offline complet (E20)

**Objectif :** l'exigence critique du projet — les requêtes échouent → file IndexedDB → rejeu auto.

- [ ] **14.1 — Implémenter `offline-queue.ts`** (stub actuel) : API IndexedDB (`Dexie.js` — déjà dans la stack AGENT.md, vérifier s'il est installé, sinon `pnpm add dexie`) : `enqueue(method, path, body)`, `dequeueAll()`.
- [ ] **14.2 — Brancher au fetch** : dans `apps/web/src/lib/api.ts`, si `!navigator.onLine` (ou `fetch` échoue avec NetworkError), mettre la requête en file et retourner un résultat local (statut "en attente de sync") ; sinon tenter la requête, en cas d'échec réseau → file.
- [ ] **14.3 — Rejeu automatique** : sur l'événement `online` (et au lancement), vider la file dans l'ordre (FIFO), marquer les éléments rejoués, notifier l'utilisateur ("3 actions synchronisées").
- [ ] **14.4 — Service Worker** : `public/sw.js` (existant) — vérifier la stratégie de cache (app shell + API GET en stale-while-revalidate) ; **corriger le bug "cache les 401"** signalé par l'audit : ne jamais mettre en cache une réponse d'erreur.
- [ ] **14.5 — Indicateur permanent** : `connection-status.tsx` (existant) — afficher hors-ligne/online + nombre d'actions en attente ; placer dans le shell (sidebar) et/ou un badge global.
- [ ] **14.6 — Conflits** : documenter la politique (dernier écrit gagne, rejeu FIFO) ; les opérations dépendantes (créer élève puis le payer) sont rejouées dans l'ordre d'entrée.

**Validation phase 14 :** couper le réseau → une action (créer un paiement) est mise en file, badge "1 action en attente" ; rétablir le réseau → rejeu auto + confirmation visuelle ; `GET` en cache hors-ligne ; aucune erreur 401 mise en cache.

---

## PHASE 15 — Sécurité globale (E21)

**Objectif :** conformité E21 : journalisation, rate limiting, headers.

- [ ] **15.1 — Câbler `audit_logs`** : `src/lib/audit.ts` → écrit dans la table Drizzle (remplacer le stockage in-memory) ; appeler `logAudit()` sur toutes les actions sensibles : création/suppression élève, paiement, facture, changement de rôle, événement, envoi WhatsApp, suppression classe. `GET /api/audit` (PROPRIETAIRE) + page `/journal` (existant — l'activer : le code API existe déjà dans `src/lib/audit.ts`, il faut le brancher à la route).
- [ ] **15.2 — Rate limiting** : purger les entrées expirées de la Map (éviter la fuite mémoire) ; clé de repli par hachage de l'IP ; appliquer aussi aux GET sensibles (ou assumer GET non limités — documenter) ; non distribué = limite documentée (prototype).
- [ ] **15.3 — Headers** : ajouter `Content-Security-Policy` (de base : `default-src 'self'; img-src 'self' data: https://api.qrserver.com https://images.unsplash.com; connect-src 'self' ws: wss:`) et `Referrer-Policy: same-origin` ; HSTS **uniquement en prod** (via wrangler.prod.jsonc).
- [ ] **15.4 — Injection SQL** : paramétrer toutes les requêtes avec valeurs client (matricule/numéro — vérifier chaque `sql\`...\`` avec interpolation).
- [ ] **15.5 — Audit de surface** : relancer le grep secrets (`sk-`, `ba_`, `api_key`) sur le monorepo (hors .env* et node_modules) → zéro résultat.

**Validation phase 15 :** chaque action sensible crée une ligne `audit_logs` visible dans `/journal` ; le rate limit ne fuit plus en mémoire ; headers présents dans la réponse ; aucun `sql` non paramétré.

---

## PHASE 16 — Recette complète

**Objectif :** vérifier l'ensemble contre les critères d'acceptation (PRD §11 + AGENT.md).

- [ ] **16.1 — Tour fonctionnel** : chaque module, avec un compte par rôle (PROPRIETAIRE, SECRETAIRE, COMPTABLE, ENSEIGNANT, AGENT) → vérifier accès/restrictions conformes au tableau RBAC AGENT.md §4.
- [ ] **16.2 — Mettre à jour AGENT.md** : cocher E4–E21 à l'état réel ; appliquer D5 (retirer Redis) ; mettre à jour les URLs §8 ; état final.
- [ ] **16.3 — Mettre à jour `MEMORY.md`** : checklist complète du chantier.
- [ ] **16.4 — Tests de bout en bout** : script de smoke-test (login chaque rôle, tour des routes autorisées → 200, refusées → 403).

**Validation phase 16 :** le smoke-test passe intégralement ; AGENT.md reflète la réalité.

---

## PHASE 17 — Déploiement

**Objectif :** mise en production Cloudflare (Pages + Workers) + Neon prod.

- [ ] **17.1 — Pré-requis** : comptes Cloudflare (Workers + Pages) ; projet Neon prod ; secrets de prod générés (`BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `DATABASE_URL` prod).
- [ ] **17.2 — API** : migrations Drizzle push sur la DB prod ; `wrangler deploy --config wrangler.prod.jsonc` ; vérifier `/health` + `/api/auth/get-session` via l'URL publique ; CORS/trustedOrigins configurés avec le domaine Pages.
- [ ] **17.3 — Web** : build `next build` (standalone) ; déployer sur Cloudflare Pages (ou adapter : `output: "standalone"` implique un adaptateur — vérifier si Pages supporte Next standalone, sinon passer sur `@cloudflare/next-on-pages` ou Workers static assets — **à trancher en phase 17**, l'audit n'a pas validé ce point) ; renseigner `API_URL` et `NEXT_PUBLIC_APP_URL` prod.
- [ ] **17.4 — DNS/domaine** (optionnel) : associer un domaine personnalisé aux deux services.
- [ ] **17.5 — Recette prod** : premier login admin, création d'un élève + QR, scan, paiement + notification temps réel, facture imprimée, WhatsApp simulé — sur l'infra prod, pas en local.
- [ ] **17.6 — Mettre à jour AGENT.md §8** : URLs réelles.

**Validation phase 17 :** la recette prod 17.5 passe intégralement ; les URLs AGENT.md sont réelles.

---

## Critères de sortie globaux

1. Aucune vulnérabilité critique (escalade fermée, CORS configurable, broadcast/WS authentifiés, sql paramétrés).
2. Chaque rôle accède exactement à ce que dit le tableau RBAC.
3. Offline complet fonctionnel (file + rejeu + indicateur).
4. Actions sensibles journalisées dans `/journal`.
5. QR codes de tous les élèves générés et imprimables.
6. Aucun 500 connu (invoices/stats corrigé), aucun code mort parasite.
7. AGENT.md conforme à la réalité ; recette prod validée.
