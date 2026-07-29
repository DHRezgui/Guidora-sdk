import type { FrictionCounters } from '../types';
import type { AbandonmentRawFeatures, FrictionBehaviorSignals } from '../types/ml';
import { hasTemporalMlGateSignals } from './friction-scoring';

export const DEFAULT_ABANDONMENT_MIN_SIGNALS = 2;

/**
 * Maps SDK friction counters + session signals to backend raw features.
 *
 * Phase 1–4 advanced counters are intentionally folded into the legacy LightGBM
 * schema (experimental / lossy — rage→clickMisses, FAQ/slow→hesitations, etc.).
 * Distinct counters are retained in the Decision Engine and outcome snapshots.
 *
 * Alignment notes (`backend/src/ml/constants/dataset-schema.ts`):
 * - `timeOnPage` — session dwell seconds (not reset on SPA navigations; train/serve contract).
 * - `pageTime` — current-URL dwell seconds (resets on navigation; additive, optional for ML).
 * - `scrollDepth` — 0–100 percent; 0 when the user never scrolled (no synthetic default beyond 0).
 * - `clickMisses` / `hesitations` — integer counts from friction heuristics.
 * - `helpTriggered` — 1 when FAQ/help/tour was opened; otherwise 0.
 * - `hasError` — 1 when a window error was captured; otherwise 0.
 * - `multiplePages` — 1 when navigation back occurred or more than one page URL was visited.
 *
 * `abandonmentRisk` and all derived features are intentionally omitted — computed by `PredictionService`.
 */
export function buildAbandonmentRawFeatures(
  counters: FrictionCounters,
  signals: FrictionBehaviorSignals,
): AbandonmentRawFeatures {
  return {
    timeOnPage: Math.max(0, Math.floor(signals.elapsedSeconds)),
    scrollDepth: Math.min(100, Math.max(0, Math.round(signals.maxScrollDepth))),
    // Fold rage clicks into clickMisses for train/serve compatibility (same frustrated-click family).
    clickMisses: Math.max(0, counters.clickMiss) + Math.max(0, counters.rageClick ?? 0),
    // Fold slow-response waits + FAQ dead-ends into hesitations.
    hesitations:
      Math.max(0, counters.scrollHesitation) +
      Math.max(0, counters.slowResponse ?? 0) +
      Math.max(0, counters.faqNoResult ?? 0),
    helpTriggered:
      signals.helpTriggered ||
      (counters.faqReopen ?? 0) > 0 ||
      (counters.failAfterHelp ?? 0) > 0
        ? 1
        : 0,
    hasError: signals.hasError || (counters.errorClick ?? 0) > 0 ? 1 : 0,
    multiplePages:
      counters.navigationBack > 0 ||
      (counters.navigationLoop ?? 0) > 0 ||
      (counters.uTurn ?? 0) > 0 ||
      signals.pageVisitCount > 1
        ? 1
        : 0,
    idleSeconds: Math.max(0, Math.floor(signals.idleSeconds)),
    pageTime: Math.max(0, Math.floor(signals.pageSeconds ?? signals.elapsedSeconds)),
  };
}

export interface AbandonmentSignalGateOptions {
  allowTemporalMlGate?: boolean;
}

export function hasMinimumAbandonmentSignals(
  counters: FrictionCounters,
  minSignals: number = DEFAULT_ABANDONMENT_MIN_SIGNALS,
  signals?: FrictionBehaviorSignals,
  options?: AbandonmentSignalGateOptions,
): boolean {
  if (countAbandonmentSignals(counters) >= Math.max(1, minSignals)) {
    return true;
  }

  if (options?.allowTemporalMlGate === false) {
    return false;
  }

  return hasTemporalMlGateSignals(signals);
}

export function countAbandonmentSignals(counters: FrictionCounters): number {
  // formAbandonment (beforeunload) is excluded — not live help evidence.
  return (
    counters.clickMiss +
    counters.scrollHesitation +
    (counters.rageClick ?? 0) +
    (counters.errorClick ?? 0) +
    (counters.formRetry ?? 0) +
    (counters.navigationLoop ?? 0) +
    (counters.uTurn ?? 0) +
    (counters.slowResponse ?? 0) +
    (counters.faqNoResult ?? 0) +
    (counters.faqReopen ?? 0) +
    (counters.failAfterHelp ?? 0)
  );
}

export function buildAbandonmentFeatureFingerprint(features: AbandonmentRawFeatures): string {
  const timeBucket = Math.floor(Math.max(0, features.timeOnPage) / 10) * 10;
  const pageTimeBucket = Math.floor(Math.max(0, features.pageTime ?? features.timeOnPage) / 10) * 10;
  const scrollBucket = Math.floor(Math.max(0, features.scrollDepth) / 5) * 5;
  return [
    timeBucket,
    pageTimeBucket,
    scrollBucket,
    features.clickMisses,
    features.hesitations,
    features.helpTriggered,
    features.hasError,
    features.multiplePages,
  ].join(':');
}
