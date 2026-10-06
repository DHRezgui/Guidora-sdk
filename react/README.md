# Guidora React SDK

`@trustdev/onboarding-sdk-react` is a React and Next.js SDK for embedding
Guidora guided tours, contextual help, FAQ search, friction detection, and
proactive assistance into a host application.

Repository: [DHRezgui/Guidora-sdk](https://github.com/DHRezgui/Guidora-sdk)

## Requirements

- React 18 or React 19
- React DOM 18 or React DOM 19
- Node.js 20 or newer for local development
- A Guidora backend with an SDK token and the required scopes

The package currently builds from this repository. The package can be published
to a registry after the release process and package metadata have been verified.

## Install from the repository

```bash
npm install
npm run build
```

The build creates CommonJS, ESM, TypeScript declaration, and CSS artifacts in
`dist/`. Run the local checks with:

```bash
npm run typecheck
npm run lint
npm test
npm run test:smoke
```

## Local integration with the dashboard

From the parent workspace, build and link the SDK before starting the dashboard:

```bash
cd sdks/react
npm install
npm run build
npm link

cd ../../dashboard
npm install
npm link @trustdev/onboarding-sdk-react
npm run dev
```

After changing the SDK, run `npm run build` again. Restart the dashboard when
Next.js retains a stale module or `.next` cache.

## Minimal integration

```tsx
import { TourViewer, initSDK } from '@trustdev/onboarding-sdk-react';
import '@trustdev/onboarding-sdk-react/styles.css';

const sdkConfig = {
  apiKey: 'your-sdk-api-key',
  apiUrl: 'http://localhost:3020/api/v1',
};

initSDK(sdkConfig);

export function Onboarding() {
  return <TourViewer config={sdkConfig} />;
}
```

Use a server-side or environment-based configuration for real credentials. Do
not hard-code production API keys in a public client bundle.

## Core configuration

```tsx
const sdkConfig = initSDK({
  apiKey: process.env.NEXT_PUBLIC_GUIDORA_API_KEY!,
  apiUrl: process.env.NEXT_PUBLIC_GUIDORA_API_URL,
  sdkToken: 'optional-jwt-token',
  trackBatchSize: 20,
  trackFlushIntervalMs: 5000,
  syncEnabled: true,
  syncIntervalMs: 15000,
  syncOnFocus: true,
  syncOnReconnect: true,
});
```

The SDK uses the backend API for active tours, event tracking, FAQ search,
contextual suggestions, and optional abandonment prediction.

## Public API reference

### `initSDK(config)`

Creates the SDK configuration used by `TourViewer` and related hooks.

Important options:

- `apiKey`: SDK API key used by the host application.
- `apiUrl`: backend base URL, including `/api/v1`.
- `sdkToken`: optional JWT for authenticated SDK requests.
- `trackBatchSize`: number of events accumulated before a flush.
- `trackFlushIntervalMs`: maximum delay before a pending event flush.
- `syncEnabled`: enables active-tour synchronization.
- `syncIntervalMs`: polling interval for tour synchronization.
- `syncOnFocus` and `syncOnReconnect`: refresh tours after browser focus or
  network reconnection.

### `<TourViewer />`

Renders the guided-tour experience and accepts the SDK configuration.

```tsx
<TourViewer
  config={sdkConfig}
  faq={{ enabled: true, presentation: 'sidebar' }}
  contextualSuggestions={{ mode: 'auto' }}
/>
```

### `useRealtimeToursSync(options)`

Synchronizes active tours when polling, browser focus, or network reconnection
is enabled. Use it when the host application needs synchronization outside the
main `TourViewer` lifecycle.

### `useContextualTourSuggestions(options)`

Analyzes visible host UI and returns editable tour drafts:

```tsx
const {
  drafts,
  refresh,
  isGenerating,
  getDebugReport,
  getFlowRegistry,
} = useContextualTourSuggestions({
  enabled: true,
  autoGenerate: true,
  maxDrafts: 3,
  maxCandidates: 250,
  projectDomain: 'SaaS onboarding',
  persona: 'end-user',
  businessObjectives: ['complete setup'],
  semanticHints: ['create account', 'validate'],
  useSemanticRanking: true,
  enableSequenceDetection: true,
  minConfidence: 60,
});
```

The returned drafts are suggestions for review. The SDK does not publish them
without an explicit host-application action.

### FAQ configuration

Enable contextual FAQ help through `TourViewer`:

```tsx
<TourViewer
  config={sdkConfig}
  faq={{
    enabled: true,
    presentation: 'sidebar',
    sidebarLayout: 'push',
    themeMode: 'host',
    pageContext: {
      suggestionKeywords: ['billing', 'subscription'],
    },
  }}
/>
```

Supported presentation modes are `widget` and `sidebar`. Use
`hostAvoidSelectors` or `avoidSelectors` when the host application has fixed
navigation, cart, or action panels near the viewport edges.

### Abandonment prediction

Prediction is opt-in and disabled by default. The SDK calls the backend ML API
only when enabled and falls back to local friction scoring if the API is
unavailable.

```tsx
<TourViewer
  config={{
    ...sdkConfig,
    abandonmentPrediction: {
      enabled: true,
      threshold: 0.5,
      proactiveHelp: true,
      proactiveOpenFaq: true,
      proactiveCooldownMs: 60000,
    },
  }}
  faq={{ enabled: true, presentation: 'sidebar' }}
/>
```

The feature uses these hooks and components:

```tsx
import {
  useAbandonmentPrediction,
  useFrictionDetection,
  useFrictionScore,
  AbandonmentRiskBadge,
  ProactiveHelpToast,
} from '@trustdev/onboarding-sdk-react';
```

The backend must expose `POST /api/v1/ml/predictions/abandonment` and the SDK
API key must have the required ML prediction scope. The client caches results
and applies the configured cooldown to avoid repeated proactive prompts.

## Backend contract

The SDK integrates with these backend capabilities:

- `GET /api/v1/tours/active/url` for active tours.
- `POST /api/v1/tracking/events` for individual events.
- `POST /api/v1/tracking/events/batch` for batched events.
- `POST /api/v1/ml/predictions/abandonment` for optional risk prediction.
- FAQ search and contextual blueprint endpoints used by the FAQ and suggestion
  features.

Confirm token scopes and authorization rules in the backend repository before
using these features in production.

## Development scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Rollup watch build |
| `npm run build` | Clean, bundle, and generate declarations |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm run lint` | ESLint checks for `src/` |
| `npm test` | Jest test suite |
| `npm run test:smoke` | Semantic smoke test |
| `npm run format` | Format TypeScript source files |

## Package exports

The package exposes:

- `@trustdev/onboarding-sdk-react` for the main React API.
- `@trustdev/onboarding-sdk-react/packs` for optional packs.
- `@trustdev/onboarding-sdk-react/styles.css` for the SDK styles.

## Security and privacy

Treat API keys and SDK tokens as credentials. Use environment variables or a
server-side token exchange where possible. Review collected interaction data
and ensure that host applications do not send personal or sensitive content as
DOM context without appropriate consent and data controls.

## License

The package metadata declares the MIT license. Confirm the intended license and
include a `LICENSE` file before a formal public release.
