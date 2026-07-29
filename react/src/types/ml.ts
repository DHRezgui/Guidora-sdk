/**
 * Raw behavioral features aligned with backend `dataset-schema.ts` (excluding `label`).
 * Derived features (`timePerPage`, `clickMissRate`, `frictionScore`, …) are computed server-side.
 */
export interface AbandonmentRawFeatures {
  /**
   * Session dwell in seconds (since friction tracking started).
   * Historical name — kept for train/serve compatibility; not reset on SPA navigations.
   */
  timeOnPage: number;
  /** Scroll depth percentage 0–100. Defaults to 0 when no scroll events were captured. */
  scrollDepth: number;
  clickMisses: number;
  hesitations: number;
  helpTriggered: 0 | 1;
  hasError: 0 | 1;
  multiplePages: 0 | 1;
  /** Seconds since last pointer/keyboard/scroll interaction (optional for ML v1.3+). */
  idleSeconds?: number;
  /**
   * Seconds on the current URL (resets on SPA navigation).
   * Optional additive feature — absent on older clients; backend defaults to `timeOnPage`.
   */
  pageTime?: number;
}

export interface AbandonmentPredictionRequest {
  features: AbandonmentRawFeatures;
  threshold?: number;
  sessionId?: string;
  explain?: boolean;
  debug?: boolean;
}

export interface AbandonmentFeatureContribution {
  feature: string;
  contribution: number;
  value: number;
}

export interface AbandonmentMlExplanation {
  topFeatures: AbandonmentFeatureContribution[];
  /** SHAP expected value in log-odds (debug only). */
  expectedValue?: number;
  /** Baseline abandonment probability before feature contributions. */
  baseProbability?: number;
}

export interface AbandonmentPredictionResult {
  abandonmentRisk: number;
  willAbandon: boolean;
  confidence: number;
  threshold: number;
  explanation?: AbandonmentMlExplanation;
}

export interface AbandonmentPredictionResponse {
  success: boolean;
  prediction?: AbandonmentPredictionResult;
  error?: string;
  timestamp?: string;
  metadata?: {
    modelVersion: string;
    executionTimeMs: number;
  };
}

export type AbandonmentPredictionStatus = 'ok' | 'fallback' | 'timeout' | 'error' | 'disabled' | 'insufficient_signals';

export interface AbandonmentPredictionClientResult {
  status: AbandonmentPredictionStatus;
  prediction: AbandonmentPredictionResult | null;
  source: 'ml' | 'local';
  error: string | null;
}

export interface AbandonmentPredictionOptions {
  threshold?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  minSignals?: number;
  sessionId?: string;
  /** When true, request SHAP explanations from the backend (debug only). */
  debug?: boolean;
  /** When false, temporal dwell+low-scroll gate does not bypass minSignals. */
  allowTemporalMlGate?: boolean;
  /**
   * Bypass client cache + session cooldown and hit the network.
   * Intended for the debug "Rafraîchir" action.
   */
  forceRefresh?: boolean;
}

/** Opt-in runtime configuration (`enabled` defaults to false). */
export interface SdkAbandonmentPredictionConfig {
  enabled?: boolean;
  threshold?: number;
  pollIntervalMs?: number;
  minSignals?: number;
  cacheTtlMs?: number;
  proactiveHelp?: boolean;
  proactiveCooldownMs?: number;
  /** Toast copy when proactive help triggers (French default in component). */
  proactiveToastMessage?: string;
  /** When false, the toast CTA does not open FAQ/help (default true — open on user click only). */
  proactiveOpenFaq?: boolean;
  /** Minimum ML confidence before proactive help (default 0.4 prod / 0.3 dev). */
  minConfidence?: number;
  /** Optional prefilled FAQ query when help opens. */
  proactiveSuggestedQuery?: string;
  /**
   * When true (default), allow proactive toast on long idle + local friction even if ML stays low.
   */
  proactiveIdleToast?: boolean;
  /** Seconds without pointer/keyboard/scroll activity before idle toast can fire (default 120). */
  proactiveIdleMinSeconds?: number;
  /** Minimum normalized local friction score for idle toast (defaults to `threshold`). */
  proactiveIdleMinLocalRisk?: number;
  /** Minimum click-miss + scroll-hesitation count for idle toast (defaults to `minSignals`). */
  proactiveIdleMinSignals?: number;
  /** Override inferred session intent (onboarding / exploration / returning). */
  sessionIntent?: AbandonmentSessionIntent;
  /** Per-intent toast + ML gate policies (merged with defaults). */
  intentPolicies?: Partial<Record<AbandonmentSessionIntent, Partial<AbandonmentIntentPolicy>>>;
  /**
   * Phase 4 — per-page overrides (matched against URL pathname / logical page key).
   * First matching rule wins; merged on top of the resolved intent policy.
   */
  pagePolicies?: AbandonmentPagePolicy[];
  /** Global minimum session duration before any proactive toast (intent policy may be stricter). */
  proactiveMinSessionSeconds?: number;
  /** Require discrete friction signals before ML proactive toast (default true via intent policies). */
  proactiveRequireFrictionSignals?: boolean;
  /**
   * Phase 4 — require distinct friction families for toast (default true via intent policies).
   * Example: 2× click-miss alone is not enough; click + navigation is.
   */
  proactiveRequireMultiFamily?: boolean;
}

/**
 * Phase 4 — optional page-scoped policy override.
 * `match` is a case-insensitive substring or simple `*` wildcard against
 * pathname, full page URL, or soft-SPA logical key / nav identity.
 */
export interface AbandonmentPagePolicy {
  match: string;
  /** Debug label (shown in abandonment panel). */
  label?: string;
  policy?: Partial<AbandonmentIntentPolicy>;
}

export type AbandonmentSessionIntent = 'onboarding' | 'exploration' | 'returning';

/**
 * Exclusive assistance channel — only one non-`none` state at a time.
 * Owned by `useOnboarding` when abandonment prediction is enabled.
 */
export type AssistanceState = 'none' | 'tour' | 'faq' | 'proactiveToast';

export interface AbandonmentIntentPolicy {
  threshold: number;
  minConfidence: number;
  minSessionSeconds: number;
  minSignals: number;
  requireFrictionSignalsForMlToast: boolean;
  allowTemporalMlGate: boolean;
  proactiveIdleMinSeconds: number;
  proactiveIdleMinLocalRisk: number;
  proactiveIdleMinSignals: number;
  /**
   * Phase 4 — minimum distinct friction families for proactive toast
   * (when multi-family gate is enabled). Default 2.
   */
  minDistinctFamilies: number;
  /**
   * Phase 4 — allow a single strong family (error click, nav loop, fail-after-help…)
   * to satisfy the combination gate without multi-family evidence.
   */
  allowStrongSingleFamily: boolean;
  /** Phase 4 — when false, skip multi-family combination for toast. */
  requireMultiFamilyForToast: boolean;
}

export interface FrictionBehaviorSignals {
  /** Seconds since friction tracking started (session / SPA lifetime). */
  elapsedSeconds: number;
  /** Seconds since the last URL change (true per-page dwell). */
  pageSeconds: number;
  /** Seconds since the last user interaction (pointer, keyboard, scroll). */
  idleSeconds: number;
  /** Maximum scroll depth observed (0–100). */
  maxScrollDepth: number;
  /** Number of distinct page URLs visited in this session window. */
  pageVisitCount: number;
  /** Whether at least one client error was observed. */
  hasError: boolean;
  /** Whether help / FAQ / tour was opened at least once. */
  helpTriggered: boolean;
}
