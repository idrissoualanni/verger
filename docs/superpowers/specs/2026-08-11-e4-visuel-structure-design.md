# E4 — Setup visuel + structure (spec design)

Date : 11/08/2026 — Statut : validé par l'utilisateur (réponses "1a 2b")

## Objectif

App de gestion visible et utilisable par le PROPRIETAIRE : login, shell de navigation,
saisie des vraies niveaux/classes de l'école. Aucune donnée fictive.

## Décisions validées

1. **Données de référence (1a)** : découpage sénégalais standard pré-rempli dans l'UI de saisie
   (modifiable) :
   - Primaire : CP1, CP2, CE1, CE2, CM1, CM2
   - Collège : 6e, 5e, 4e, 3e
   - Lycée : 2nde, 1ère, Tle
2. **Style (2b) — chaleureux** : verts clairs dominants, arrondis marqués, plus de couleurs.
   Jaune = alertes, rouge = erreurs (convention AGENT.md).
3. **shadcn/ui** : composants installés via CLI officiel (style radix-nova, lucide, RSC).

## Composants

- **Login** (`/login`) : page pleine, logo "Le Verger", email + mot de passe, erreurs visibles,
  redirection vers `/dashboard` si session OK, redirection vers `/login` si session absente.
- **Shell** : sidebar (composant shadcn sidebar) : logo + nav (Dashboard, Niveaux & Classes,
  modules futurs grisés) ; header : user (nom, rôle PROPRIETAIRE) + bouton déconnexion.
- **Niveaux & Classes** (`/niveaux`) : liste groupée par niveau, formulaire ajout/édition
  (nom, ordre), suppression, badges. Protégé PROPRIETAIRE.

## Côté API (apps/api)

Routes REST protégées (session + rôle PROPRIETAIRE) :
- `GET /api/niveaux` — liste ordonnée
- `POST /api/niveaux` — créer (nom, ordre)
- `PATCH /api/niveaux/:id` — renommer / réordonner
- `DELETE /api/niveaux/:id` — supprimer (refus si classes liées)

## Tokens visuels (Tailwind v4 @theme)

- `--primary` : vert école (chaleureux, ex. oklch vert moyen)
- `--warning` : jaune (nouveau token)
- `--destructive` : rouge (conservé)
- `--radius` : augmenté (arrondis marqués)
- Fond : blanc cassé chaleureux ; sidebar vert foncé ou crème

## Hors périmètre (E4)

Dashboard KPIs (E7), CRUD élèves (E8), autres modules — uniquement nav grisée.
