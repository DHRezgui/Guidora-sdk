import type { FrictionCounters } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';

/** Per-event weights for discrete friction signals. */
const WEIGHT_CLICK_MISS = 2;
const WEIGHT_SCROLL_HESITATION = 2;
const WEIGHT_FORM_ABANDONMENT = 3;
const WEIGHT_NAVIGATION_BACK = 2;

/** P3 — cap counted events so a single signal type cannot dominate the score. */
const CAP_CLICK_MISS_EVENTS = 2;
const CAP_SCROLL_HESITATION_EVENTS = 2;

/**
 * P2 — progressive stall tiers (stored in `counters.timeOnPageExcessive`).
 * Tier advances at each threshold; score sums escalating points per tier reached.
 */
export const TIME_STALL_TIER_THRESHOLDS_SEC = [45, 90, 150, 240] as const;
const TIME_STALL_TIER_POINTS = [2, 3, 3, 4] as const;

/**
 * P1 — temporal ML gate: long dwell on the *current page* with low exploration
 * opens minSignals without click/scroll. Uses `pageSeconds`, not session elapsed.
 */
export const TEMPORAL_ML_GATE_MIN_SECONDS = 45;
export const TEMPORAL_ML_GATE_MAX_SCROLL_DEPTH = 30;

/** P4 — max local score after caps + progressive time (tiers 1–4). */
export const FRICTION_SCORE_MAX =
  CAP_CLICK_MISS_EVENTS * WEIGHT_CLICK_MISS +
  CAP_SCROLL_HESITATION_EVENTS * WEIGHT_SCROLL_HESITATION +
  TIME_STALL_TIER_POINTS.reduce((sum, points) => sum + points, 0) +
  WEIGHT_FORM_ABANDONMENT +
  WEIGHT_NAVIGATION_BACK;

/**
 * Resolve progressive stall tier from dwell seconds.
 * Callers should pass **page** dwell (`pageSeconds`), not session elapsed.
 */
export function resolveTimeStallTier(
  pageSeconds: number,
  firstTierSec: number = TIME_STALL_TIER_THRESHOLDS_SEC[0],
): number {
  const thresholds =
    firstTierSec === TIME_STALL_TIER_THRESHOLDS_SEC[0]
      ? TIME_STALL_TIER_THRESHOLDS_SEC
      : ([firstTierSec, ...TIME_STALL_TIER_THRESHOLDS_SEC.slice(1)] as const);

  let tier = 0;
  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    if (pageSeconds >= thresholds[index]) {
      tier = index + 1;
      break;
    }
  }
  return tier;
}

function computeTimeStallScore(tier: number): number {
  const cappedTier = Math.max(0, Math.min(tier, TIME_STALL_TIER_POINTS.length));
  let score = 0;
  for (let index = 0; index < cappedTier; index += 1) {
    score += TIME_STALL_TIER_POINTS[index];
  }
  return score;
}

export function computeFrictionScore(counters: FrictionCounters): number {
  const clickScore =
    Math.min(Math.max(0, counters.clickMiss), CAP_CLICK_MISS_EVENTS) * WEIGHT_CLICK_MISS;
  const scrollScore =
    Math.min(Math.max(0, counters.scrollHesitation), CAP_SCROLL_HESITATION_EVENTS) *
    WEIGHT_SCROLL_HESITATION;
  const timeScore = computeTimeStallScore(counters.timeOnPageExcessive);
  const formScore = Math.max(0, counters.formAbandonment) * WEIGHT_FORM_ABANDONMENT;
  const navigationScore = Math.max(0, counters.navigationBack) * WEIGHT_NAVIGATION_BACK;

  return clickScore + scrollScore + timeScore + formScore + navigationScore;
}

export function normalizeFrictionScore(score: number): number {
  if (FRICTION_SCORE_MAX <= 0) return 0;
  return Math.min(1, Math.max(0, score / FRICTION_SCORE_MAX));
}

export function resolveFrictionRiskLevel(
  score: number,
): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 10) return 'HIGH';
  if (score >= 6) return 'MEDIUM';
  if (score >= 2) return 'LOW';
  return 'NONE';
}

export function hasTemporalMlGateSignals(signals?: FrictionBehaviorSignals): boolean {
  if (!signals) return false;
  const pageSeconds = signals.pageSeconds ?? signals.elapsedSeconds;
  return (
    pageSeconds >= TEMPORAL_ML_GATE_MIN_SECONDS &&
    signals.maxScrollDepth < TEMPORAL_ML_GATE_MAX_SCROLL_DEPTH
  );
}
