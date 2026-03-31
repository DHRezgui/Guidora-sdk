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
