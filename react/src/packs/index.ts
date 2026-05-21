/**
 * Public opt-in entry point: `@trustdev/onboarding-sdk-react/packs`.
 *
 * This file is the ONLY public API surface for the opt-in blueprint packs.
 * The packs are loaded only when a host explicitly imports them, so their
 * combined weight (~80 kB) never lands in the default bundle.
 *
 * ## Usage from a host application
 *
 * ```tsx
 * import { TourViewer } from '@trustdev/onboarding-sdk-react';
 * import { fintechBlueprints, healthtechBlueprints } from '@trustdev/onboarding-sdk-react/packs';
 *
 * <TourViewer
 *   contextualSuggestions={{
 *     preset: 'saas-default',
 *     // Custom blueprints are merged with the preset's built-in catalog.
 *     // See `selectActiveBlueprints` in journey-blueprints.ts.
 *     journeyBlueprints: [...fintechBlueprints, ...healthtechBlueprints],
 *   }}
 * />
 * ```
 *
 * ## Production-readiness levels
 *
 *  - **Stable** (P1/P2): `techBlueprints`, `hrBlueprints`, `socialBlueprints`,
 *    `elearningBlueprints`. Vocabulary is well-standardized across the
 *    industry, low risk of false positives.
 *  - **Mature** (P3): `realestateBlueprints`. Slightly more locale-specific
 *    but vocabulary is consistent. Validated against common UX conventions.
 *  - **Stable** (PM): `productivityBlueprints` — project/task dashboards (Tasko-style).
 *  - **Preview** (P3/P4): `fintechBlueprints`, `healthtechBlueprints`. These
 *    cover the funnels we believe to be universal, BUT the regulated nature
 *    of these industries (PCI-DSS, HIPAA, locale-specific vocabulary like RIB
 *    vs SSN) means we recommend gating publication behind manual review
 *    until validated on a real host. Use the dashboard's
 *    `saved_pending_review_policy_guard` already enabled by default.
 */

export { techBlueprints } from '../utils/blueprints/packs/tech';
export { hrBlueprints } from '../utils/blueprints/packs/hr';
export { socialBlueprints } from '../utils/blueprints/packs/social';
export { elearningBlueprints } from '../utils/blueprints/packs/elearning';
export { realestateBlueprints } from '../utils/blueprints/packs/realestate';
export { fintechBlueprints } from '../utils/blueprints/packs/fintech';
export { healthtechBlueprints } from '../utils/blueprints/packs/healthtech';
export { productivityBlueprints } from '../utils/blueprints/packs/productivity';

/**
 * Aggregate of every opt-in pack, in order of recommended priority. Use this
 * when you want to activate the whole catalogue without picking individual
 * verticals (e.g. on a marketplace app that spans many domains).
 *
 * The order matters: the resolver iterates blueprints sequentially and
 * stops at the first match per role, so we promote the stable packs first
 * and keep the preview packs at the end.
 */
import { techBlueprints } from '../utils/blueprints/packs/tech';
import { hrBlueprints } from '../utils/blueprints/packs/hr';
import { socialBlueprints } from '../utils/blueprints/packs/social';
import { elearningBlueprints } from '../utils/blueprints/packs/elearning';
import { realestateBlueprints } from '../utils/blueprints/packs/realestate';
import { fintechBlueprints } from '../utils/blueprints/packs/fintech';
import { healthtechBlueprints } from '../utils/blueprints/packs/healthtech';
import { productivityBlueprints } from '../utils/blueprints/packs/productivity';

export const allBlueprintPacks = [
  ...techBlueprints,
  ...hrBlueprints,
  ...socialBlueprints,
  ...elearningBlueprints,
  ...realestateBlueprints,
  ...fintechBlueprints,
  ...healthtechBlueprints,
  ...productivityBlueprints,
];
