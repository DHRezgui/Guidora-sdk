/// <reference types="jest" />

import {
  computeFrictionScore,
  FRICTION_SCORE_MAX,
  hasTemporalMlGateSignals,
  normalizeFrictionScore,
  resolveTimeStallTier,
  TEMPORAL_ML_GATE_MIN_SECONDS,
} from '../src/utils/friction-scoring';

const EMPTY_COUNTERS = {
  clickMiss: 0,
  scrollHesitation: 0,
  timeOnPageExcessive: 0,
  formAbandonment: 0,
  navigationBack: 0,
};

describe('friction-scoring', () => {
  it('caps click-miss and scroll hesitation contributions (P3)', () => {
    const spamScore = computeFrictionScore({
      ...EMPTY_COUNTERS,
      clickMiss: 10,
      scrollHesitation: 10,
    });
    const cappedScore = computeFrictionScore({
      ...EMPTY_COUNTERS,
      clickMiss: 2,
      scrollHesitation: 2,
    });

    expect(spamScore).toBe(cappedScore);
    expect(spamScore).toBe(8);
  });

  it('escalates time stall score by tier (P2)', () => {
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, timeOnPageExcessive: 0 })).toBe(0);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, timeOnPageExcessive: 1 })).toBe(2);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, timeOnPageExcessive: 2 })).toBe(5);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, timeOnPageExcessive: 4 })).toBe(12);
  });

  it('normalizes against FRICTION_SCORE_MAX (P4)', () => {
    expect(FRICTION_SCORE_MAX).toBe(25);
    expect(normalizeFrictionScore(6)).toBeCloseTo(0.24);
    expect(normalizeFrictionScore(25)).toBe(1);
  });

  it('opens temporal ML gate from pageSeconds (P1), not session elapsed alone', () => {
    expect(TEMPORAL_ML_GATE_MIN_SECONDS).toBe(45);

    expect(
      hasTemporalMlGateSignals({
        elapsedSeconds: 120,
        pageSeconds: 44,
        idleSeconds: 0,
        maxScrollDepth: 10,
        pageVisitCount: 2,
        hasError: false,
        helpTriggered: false,
      }),
    ).toBe(false);

    expect(
      hasTemporalMlGateSignals({
        elapsedSeconds: 20,
        pageSeconds: 45,
        idleSeconds: 0,
        maxScrollDepth: 29,
        pageVisitCount: 1,
        hasError: false,
        helpTriggered: false,
      }),
    ).toBe(true);

    expect(
      hasTemporalMlGateSignals({
        elapsedSeconds: 120,
        pageSeconds: 90,
        idleSeconds: 0,
        maxScrollDepth: 80,
        pageVisitCount: 1,
        hasError: false,
        helpTriggered: false,
      }),
    ).toBe(false);
  });

  it('resolves stall tiers from page dwell seconds', () => {
    expect(resolveTimeStallTier(44)).toBe(0);
    expect(resolveTimeStallTier(45)).toBe(1);
    expect(resolveTimeStallTier(90)).toBe(2);
    expect(resolveTimeStallTier(240)).toBe(4);
  });
});
