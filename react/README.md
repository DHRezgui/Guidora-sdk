# @trustdev/onboarding-sdk-react

SDK React/Next.js pour integrer des tours guides et la detection de frictions.

## Objectif de ce package

- Distribuer un SDK NPM reutilisable pour React et Next.js.
- Exposer une API TypeScript typee.
- Produire des builds `cjs`, `esm` et les declarations `d.ts`.

## Structure

- `src/`: source TypeScript du SDK.
- `dist/`: artefacts de build publies.
- `rollup.config.js`: bundling JS/CSS.
- `tsconfig.build.json`: generation des types.

## Scripts

- `npm run dev`: build Rollup en watch.
- `npm run build`: clean + bundle + declarations TypeScript.
- `npm run typecheck`: verification de types sans emit.
- `npm run lint`: lint TypeScript.

## Installation des dependances

```bash
npm install
```

## Build local du package

```bash
npm run build
```

## Test d'integration local avec `npm link`

C'est une bonne approche pendant le sprint SDK.

Pourquoi:

- Tu testes le SDK dans une vraie application consommatrice (dashboard) sans publier sur npm.
- Tu verifies vite les regressions d'integration (import, styles, runtime).
- Tu acceleres la boucle de dev sur les API exposees.

Workflow:

```bash
# 1) Dans sdks/react
npm install
npm run build
npm link

# 2) Dans dashboard
cd ../../dashboard
npm link @trustdev/onboarding-sdk-react
```

Verification rapide:

```ts
import { initSDK } from '@trustdev/onboarding-sdk-react';

initSDK({ apiKey: 'demo-key' });
```

Notes:

- Si le dashboard ne prend pas les changements, relancer `npm run build` dans le SDK.
- En cas de cache Next.js, redemarrer le serveur du dashboard.

## Integration API backend et synchro temps reel

Le SDK integre maintenant:

- Recuperation des tours actifs via `GET /tours/active/url`.
- Tracking unitaire via `POST /tracking/events`.
- Tracking batch via `POST /tracking/events/batch`.
- Flush best-effort a la fermeture de page via `fetch(..., { keepalive: true })`.
- Synchronisation temps reel par polling + focus + reconnexion reseau.

### Options SDK recommandees

```ts
initSDK({
  apiKey: 'your-api-key',
  apiUrl: 'http://localhost:3002/api/v1',
  sdkToken: 'optional-jwt',

  // Dock layout: ON by default (host heuristics + collision avoidance).
  // Pass `dockLayout: false` to restore legacy static positioning.
  dockLayout: {
    hostAvoidSelectors: ['[data-tour-id="cart-panel"]'],
  },

  // FAQ defaults merged into TourViewer `faq` (sidebar presentation by default).
  // Pass `faqDefaults: false` to opt out. FAQ stays hidden until `faq={{ enabled: true }}`.
  faqDefaults: {
    title: 'Aide',
  },

  // Tracking
  trackBatchSize: 20,
  trackFlushIntervalMs: 5000,

  // Realtime sync tours
  syncEnabled: true,
  syncIntervalMs: 15000,
  syncOnFocus: true,
  syncOnReconnect: true,
});
```

### Hook realtime exporte

```ts
import { useRealtimeToursSync } from '@trustdev/onboarding-sdk-react';
```

## Generation assistee de parcours

Le SDK expose aussi une brique de suggestion contextuelle de parcours. Elle analyse le DOM visible de l'application cliente et propose des parcours de base que le developpeur peut ensuite modifier.

### Hook exporte

```ts
import { useContextualTourSuggestions } from '@trustdev/onboarding-sdk-react';

const { drafts, refresh, isGenerating, getDebugReport, getFlowRegistry } = useContextualTourSuggestions({
  enabled: true,
  autoGenerate: true,
  maxDrafts: 3,
  maxCandidates: 250,
  enableIncremental: true,
  feedbackEnabled: true,
  userRole: 'admin',
  persona: 'admin',
  projectDomain: 'crm onboarding',
  businessObjectives: ['convertir un utilisateur', 'publier un parcours', 'reussir la prise en main'],
  semanticHints: ['creation de compte', 'validation', 'resultat'],
  enableSequenceDetection: true,
  useSemanticRanking: true,
  noiseFilteringEnabled: true,
  ignoreTransientUi: true,
  mutationBatchWindowMs: 120,
  maxDirtyNodesPerBatch: 280,
  conflictResolutionEnabled: true,
  conflictResolutionStrategy: 'hybrid',
  explainabilityEnabled: true,
  sessionContext: {
    sessionId: 'sess_001',
    isNewUser: true,
    onboardingProgress: 0.25,
    currentStage: 'activation',
    seenSelectors: ['#welcome-banner'],
    completedSelectors: ['#intro-step'],
    preferredIntents: ['primary-action'],
  },
  flowVersioningEnabled: true,
  flowVersion: 'v3.0.0',
  baselineFlowVersion: 'v2.5.0',
  flowCompatibilityMode: 'lenient',
  minConfidence: 60,
  customKeywords: {
    'primary-action': ['approve', 'validate', 'publier'],
  },
});
```

### Ce que retourne le hook

- `drafts`: parcours suggeres deja prets a etre ajustes.
- `refresh`: relance l'analyse du contexte courant.
- `isGenerating`: indique si la suggestion est en cours de calcul.
- `getDebugReport`: retourne un rapport de debug (scores, filtres, conflits, volumes).
- `getFlowRegistry`: retourne l'historique local des signatures/version des flows generes.

V2 expose egalement:

- `recordFeedback`: enregistre `shown`, `clicked`, `completed`, `skipped` pour affiner le scoring au fil du temps.
- `resetFeedback`: reinitialise le feedback local de suggestion.

### V3: ranking IA leger et flux sequentiels

- `persona`: adapte les suggestions selon le profil utilisateur.
- `projectDomain`, `businessObjectives`, `semanticHints`: enrichissent le contexte sémantique du ranking.
- `useSemanticRanking`: active le calcul de similarite sémantique local.
- `enableSequenceDetection`: active la reconstruction d'un parcours en plusieurs etapes.
- `minConfidence`: filtre les drafts trop incertains.

### Sprint 1: robustesse DOM et performance

- `noiseFilteringEnabled`: active le filtrage anti-bruit (tooltips, loaders, toasts, statuts temporaires, etc.).
- `ignoreTransientUi`: ignore les conteneurs temporaires (modals/overlays non stables) pour reduire les faux positifs.
- `noiseSelectors`: permet d'ajouter des selecteurs custom a ignorer selon le design system du client.
- `mutationBatchWindowMs`: debounce des mutations DOM avant recalcul.
- `maxDirtyNodesPerBatch`: seuil de bascule vers full-rescan si trop de changements.

### Sprint 2: conflict resolution et explainability

- `conflictResolutionEnabled`: active l'arbitrage quand plusieurs drafts proposent les memes cibles.
- `conflictResolutionStrategy`: choisit la politique d'arbitrage (`highest-confidence`, `highest-score`, `intent-priority`, `hybrid`).
- `explainabilityEnabled`: ajoute les signaux explicatifs dans chaque draft et expose un rapport global via `getDebugReport`.

### Sprint 3: session context et versioning des flows

- `sessionContext`: adapte les suggestions au contexte utilisateur courant (new/existing user, progression, etapes deja vues/completees, intents preferes/bloques).
- `flowVersioningEnabled`: annote chaque draft avec une signature de flow et des metadonnees de migration.
- `flowVersion` et `baselineFlowVersion`: permettent de comparer la version courante au baseline pour detecter les changements incompatibles.
- `flowCompatibilityMode`: regle de compatibilite (`strict` ou `lenient`) appliquee aux metadonnees de flow.

### Ameliorations V2 integrees

- Matching semantique multilingue (EN/FR/AR) avec tokenisation et stemming leger.
- Scoring contextuel pondere (zone, taille, position viewport, penalites disabled/hidden).
- Cache incremental base sur `MutationObserver` (re-scan partiel au lieu de full scan systematique).
- Selecteurs plus stables (priorite a `data-tour-id`, `data-testid`, `data-cy`, `data-qa`).
- Deduplication + diversification des drafts pour eviter les suggestions redondantes.
- Feedback loop local (`localStorage`) pour repondrer automatiquement les prochains drafts.

### Idee d'utilisation

- Integrer le hook dans une page ou un dashboard d'administration.
- Recuperer les drafts proposes.
- Les modifier avant de les enregistrer ou de les publier.

## Prédiction d'abandon (LightGBM)

Fonctionnalité **opt-in** (`abandonmentPrediction.enabled: false` par défaut). Le score de friction local (`useFrictionScore`) reste le fallback silencieux si l'API ML est indisponible.

### Prérequis

- Scope PAT `ml:predict` (Paramètres → Tokens SDK)
- Modèle chargé côté backend (`GET /ml/predictions/health` → `modelLoaded: true`)
- Pour l'aide proactive + FAQ : scope `faq:search` et `faq={{ enabled: true }}`

### Configuration minimale (`TourViewer`)

```tsx
<TourViewer
  config={{
    ...sdkConfig,
    abandonmentPrediction: {
      enabled: true,
      threshold: 0.5,
      proactiveHelp: true,
      proactiveOpenFaq: true,
      proactiveCooldownMs: 60_000,
    },
  }}
  faq={{ enabled: true, presentation: 'sidebar' }}
/>
```

### Comportement

1. Le SDK collecte les signaux de friction (`useFrictionDetection`).
2. Après `minSignals` (défaut 2), il appelle `POST /ml/predictions/abandonment` (cache 20s).
3. Si l'API échoue → fallback local sans erreur visible.
4. Si le risque dépasse le seuil → toast Phoenix + ouverture FAQ (cooldown 60s).

### Hooks bas niveau

```tsx
import {
  useAbandonmentPrediction,
  useFrictionDetection,
  useFrictionScore,
  AbandonmentRiskBadge,
  ProactiveHelpToast,
} from '@trustdev/onboarding-sdk-react';
```

### Tests

```bash
# SDK (unitaires)
cd sdks/react && npm test -- --testPathPattern="abandonment|proactive-help"

# Backend (unitaires + e2e scope PAT)
cd backend && npm test -- prediction.service.spec
cd backend && npm run test:e2e:sdk -- ml-sdk.e2e-spec
```

## FAQ in-app (recherche semantique)

Le `TourViewer` peut afficher une aide contextuelle via la prop `faq`. Deux presentations sont disponibles :

- `widget` — bouton flottant en bas de l'ecran (defaut du composant `FaqSearchWidget`).
- `sidebar` — panneau lateral pleine hauteur avec suggestions contextuelles.

### Defaults universels et overrides

Le SDK applique des conventions par defaut pour reduire la configuration dans l'app hote. Ces valeurs sont **surchargeables** : l'integration minimale reste `faq={{ enabled: true }}` et `contextualSuggestions={{ mode: 'auto' }}`. Les specifics metier (selecteurs DOM, mots-cles FAQ, domaine projet) restent dans l'app hote, pas dans le SDK.

| Option | Defaut SDK | Quand le surcharger |
| --- | --- | --- |
| `sidebarLayout` | `push` | Layout simple, POS, ou sans conteneur plein ecran → `overlay` |
| `themeMode` | `host` | Pas de `[data-tour-id]` ou theme fixe → `auto`, `light`, `dark` |
| `modal` | `false` | Bloquer l'interaction hors panneau → `true` |
| `persona` (mode contextual `auto`) | `admin` | Parcours end-user en production → `end-user` via `contextualSuggestions` |
| `pushTargetSelector` | auto-detecte | Layout custom → selecteur explicite sur le conteneur racine |
| `hostThemeReference` | premier `[data-tour-id]` hote | Panneau de reference precis → selecteur explicite |
| `pageContext.suggestionKeywords` | — (app hote) | Mots-cles metier pour le ranking des questions frequentes |

Heuristiques runtime (aucune config requise) :

1. **Push target** : `.h-screen.w-screen` si present (courant Tailwind), sinon `body > div:first-of-type`.
2. **Theme hote** : premier `[data-tour-id]` hors chrome TrustDev.
3. **Init `journeyVerticals`** : infere depuis `--project-domain` ou des mots-cles generiques (`crm`, `checkout`, `dashboard`, …) — pas depuis un projet de demo specifique.

Exemple d'overrides pour une app sans layout Tailwind :

```tsx
<TourViewer
  config={sdkConfig}
  contextualSuggestions={{
    mode: 'auto',
    projectDomain: 'My SaaS product',
    persona: 'end-user',
  }}
  faq={{
    enabled: true,
    sidebarLayout: 'overlay',
    themeMode: 'auto',
    pushTargetSelector: '#app-root',
    pageContext: {
      suggestionKeywords: ['billing', 'subscription', 'invoice'],
    },
  }}
/>
```

### Eviter les collisions avec l'UI hote

Sur des applications type POS ou dashboard, un panneau metier (panier, navigation laterale, resume de commande, etc.) peut occuper les bords de l'ecran. Declarez ces zones via `hostAvoidSelectors` (global `TourViewer`) et/ou `avoidSelectors` sur `faq` / `contextualSuggestions`.

Le SDK mesure l'espace disponible au runtime, coordonne **l'aide FAQ** et le **panneau contextuel**, et choisit le cote avec le plus d'espace libre quand les deux bords sont contraints.

```tsx
<TourViewer
  config={sdkConfig}
  hostAvoidSelectors={[
    '[data-tour-id="cart-panel"]',
    '[data-tour-id="pos-sidebar"]',
    '.order-summary-panel',
  ]}
  faq={{
    enabled: true,
    presentation: 'sidebar',
    side: 'right',
    startCollapsed: true,
  }}
  contextualSuggestions={{
    enabled: true,
    uiMode: 'debug',
    dockSide: 'right',
  }}
/>
```

| Option | Portee | Description | Defaut |
| --- | --- | --- | --- |
| `hostAvoidSelectors` | `TourViewer` | Zones hote pour tout le chrome SDK | — |
| `avoidSelectors` | `faq`, `contextualSuggestions` | Zones supplementaires par surface | — |
| `minDockClearancePx` | `faq`, `contextualSuggestions` | Largeur minimale libre avant bascule | `420` |
| `side` / `dockSide` | `faq` / contextuel | Cote prefere quand l'espace le permet | `right` |

Sans selecteurs d'evitement, le comportement reste identique a avant (pas de bascule automatique).

Algorithme :

1. Mesure la clearance gauche/droite via `getBoundingClientRect()`.
2. Garde le cote prefere s'il a assez d'espace.
3. Sinon bascule sur l'autre cote s'il est libre.
4. Sinon choisit le cote avec **la plus grande clearance** (meme partielle).
5. Evite qu'aide FAQ et panneau contextuel se superposent (passe de coordination mutuelle).

### Theme adaptatif

| Option | Description | Defaut |
| --- | --- | --- |
| `themeMode` | `dark`, `light`, `auto`, ou `host` (caméléon tokens hôte) | `host` (via `faqDefaults`) |
| `hostThemeReference` | Sélecteur d'un panneau hôte à mirroir (`themeMode: 'host'`) | auto-detecte si absent |
| `sidebarLayout` | `push` (decale le contenu) ou `overlay` (panneau par-dessus) | `push` |
| `modal` | Backdrop plein ecran pour le sidebar (desactiver sur POS) | `false` |

En mode `auto`, le SDK détecte le thème hôte dans cet ordre :

1. `data-theme` / `data-color-scheme` sur `<html>` ou `<body>`
2. classes `dark` / `light`
3. propriété CSS `color-scheme`
4. variables CSS (`--background`, `--bg`, `--surface`, …)
5. couleur de fond réellement rendue (`body`, puis `<html>`)
6. `prefers-color-scheme` (dernier recours uniquement)

Mode `host` — mappe les tokens CSS de l'app (`--background`, `--primary`, `--border`, `--radius`, …) vers les variables FAQ du SDK. Optionnel : `hostThemeReference` pour copier le rendu d'un panneau natif.

```tsx
<TourViewer
  faq={{
    presentation: 'sidebar',
    themeMode: 'host',
    hostThemeReference: '[data-tour-id="main-dashboard-panel"]',
    modal: false,
  }}
/>
```

L'app hote peut exposer son theme :

```html
<html data-theme="light">
```

### Composants exportes

```ts
import {
  FaqSearchWidget,
  HelpSidebar,
  useFaqSemanticSearch,
  useFaqThemeMode,
  useHelpDockSide,
  useSdkDockLayout,
  mergeAvoidSelectors,
  resolveSdkDockLayout,
  resolveFaqThemeAppearance,
} from '@trustdev/onboarding-sdk-react';
```

