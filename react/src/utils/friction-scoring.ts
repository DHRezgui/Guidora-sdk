import type { FrictionCounters } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';

/** Per-event weights for discrete friction signals. */
const WEIGHT_CLICK_MISS = 2;
const WEIGHT_SCROLL_HESITATION = 2;
const WEIGHT_FORM_ABANDONMENT = 3;
const WEIGHT_NAVIGATION_BACK = 2;
/** Phase-1: stronger frustration signals. */
const WEIGHT_RAGE_CLICK = 3;
const WEIGHT_ERROR_CLICK = 4;
const WEIGHT_FORM_RETRY = 3;
/** Phase-2: navigation stagnation + lag after action. */
const WEIGHT_NAVIGATION_LOOP = 3;
const WEIGHT_U_TURN = 2;
const WEIGHT_SLOW_RESPONSE = 3;
/** Phase-3: FAQ / help loop signals (Guidora differentiator). */
const WEIGHT_FAQ_NO_RESULT = 3;
const WEIGHT_FAQ_REOPEN = 2;
const WEIGHT_FAIL_AFTER_HELP = 4;

/** P3 — cap counted events so a single signal type cannot dominate the score. */
const CAP_CLICK_MISS_EVENTS = 2;
const CAP_SCROLL_HESITATION_EVENTS = 2;
const CAP_RAGE_CLICK_EVENTS = 2;
const CAP_ERROR_CLICK_EVENTS = 2;
const CAP_FORM_RETRY_EVENTS = 2;
const CAP_NAVIGATION_LOOP_EVENTS = 2;
const CAP_U_TURN_EVENTS = 2;
const CAP_SLOW_RESPONSE_EVENTS = 2;
const CAP_FAQ_NO_RESULT_EVENTS = 2;
const CAP_FAQ_REOPEN_EVENTS = 2;
const CAP_FAIL_AFTER_HELP_EVENTS = 2;

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

/** P4 — max local score after caps + progressive time + phase-1/2/3 signals. */
export const FRICTION_SCORE_MAX =
  CAP_CLICK_MISS_EVENTS * WEIGHT_CLICK_MISS +
  CAP_SCROLL_HESITATION_EVENTS * WEIGHT_SCROLL_HESITATION +
  TIME_STALL_TIER_POINTS.reduce((sum, points) => sum + points, 0) +
  WEIGHT_FORM_ABANDONMENT +
  WEIGHT_NAVIGATION_BACK +
  CAP_RAGE_CLICK_EVENTS * WEIGHT_RAGE_CLICK +
  CAP_ERROR_CLICK_EVENTS * WEIGHT_ERROR_CLICK +
  CAP_FORM_RETRY_EVENTS * WEIGHT_FORM_RETRY +
  CAP_NAVIGATION_LOOP_EVENTS * WEIGHT_NAVIGATION_LOOP +
  CAP_U_TURN_EVENTS * WEIGHT_U_TURN +
  CAP_SLOW_RESPONSE_EVENTS * WEIGHT_SLOW_RESPONSE +
  CAP_FAQ_NO_RESULT_EVENTS * WEIGHT_FAQ_NO_RESULT +
  CAP_FAQ_REOPEN_EVENTS * WEIGHT_FAQ_REOPEN +
  CAP_FAIL_AFTER_HELP_EVENTS * WEIGHT_FAIL_AFTER_HELP;

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

function counterOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function computeFrictionScore(counters: FrictionCounters): number {
  const clickScore =
    Math.min(counterOrZero(counters.clickMiss), CAP_CLICK_MISS_EVENTS) * WEIGHT_CLICK_MISS;
  const scrollScore =
    Math.min(counterOrZero(counters.scrollHesitation), CAP_SCROLL_HESITATION_EVENTS) *
    WEIGHT_SCROLL_HESITATION;
  const timeScore = computeTimeStallScore(counterOrZero(counters.timeOnPageExcessive));
  const formScore = counterOrZero(counters.formAbandonment) * WEIGHT_FORM_ABANDONMENT;
  const navigationScore = counterOrZero(counters.navigationBack) * WEIGHT_NAVIGATION_BACK;
  const rageScore =
    Math.min(counterOrZero(counters.rageClick), CAP_RAGE_CLICK_EVENTS) * WEIGHT_RAGE_CLICK;
  const errorClickScore =
    Math.min(counterOrZero(counters.errorClick), CAP_ERROR_CLICK_EVENTS) * WEIGHT_ERROR_CLICK;
  const formRetryScore =
    Math.min(counterOrZero(counters.formRetry), CAP_FORM_RETRY_EVENTS) * WEIGHT_FORM_RETRY;
  const navigationLoopScore =
    Math.min(counterOrZero(counters.navigationLoop), CAP_NAVIGATION_LOOP_EVENTS) *
    WEIGHT_NAVIGATION_LOOP;
  const uTurnScore =
    Math.min(counterOrZero(counters.uTurn), CAP_U_TURN_EVENTS) * WEIGHT_U_TURN;
  const slowResponseScore =
    Math.min(counterOrZero(counters.slowResponse), CAP_SLOW_RESPONSE_EVENTS) *
    WEIGHT_SLOW_RESPONSE;
  const faqNoResultScore =
    Math.min(counterOrZero(counters.faqNoResult), CAP_FAQ_NO_RESULT_EVENTS) *
    WEIGHT_FAQ_NO_RESULT;
  const faqReopenScore =
    Math.min(counterOrZero(counters.faqReopen), CAP_FAQ_REOPEN_EVENTS) * WEIGHT_FAQ_REOPEN;
  const failAfterHelpScore =
    Math.min(counterOrZero(counters.failAfterHelp), CAP_FAIL_AFTER_HELP_EVENTS) *
    WEIGHT_FAIL_AFTER_HELP;

  return (
    clickScore +
    scrollScore +
    timeScore +
    formScore +
    navigationScore +
    rageScore +
    errorClickScore +
    formRetryScore +
    navigationLoopScore +
    uTurnScore +
    slowResponseScore +
    faqNoResultScore +
    faqReopenScore +
    failAfterHelpScore
  );
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
