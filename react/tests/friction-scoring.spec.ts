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
  rageClick: 0,
  errorClick: 0,
  formRetry: 0,
  navigationLoop: 0,
  uTurn: 0,
  slowResponse: 0,
  faqNoResult: 0,
  faqReopen: 0,
  failAfterHelp: 0,
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

  it('scores phase-1 rage / error / form-retry signals', () => {
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, rageClick: 1 })).toBe(3);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, errorClick: 1 })).toBe(4);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, formRetry: 1 })).toBe(3);
    expect(
      computeFrictionScore({
        ...EMPTY_COUNTERS,
        rageClick: 5,
        errorClick: 5,
        formRetry: 5,
      }),
    ).toBe(3 * 2 + 4 * 2 + 3 * 2);
  });

  it('scores phase-2 navigation loop / u-turn / slow-response signals', () => {
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, navigationLoop: 1 })).toBe(3);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, uTurn: 1 })).toBe(2);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, slowResponse: 1 })).toBe(3);
    expect(
      computeFrictionScore({
        ...EMPTY_COUNTERS,
        navigationLoop: 5,
        uTurn: 5,
        slowResponse: 5,
      }),
    ).toBe(3 * 2 + 2 * 2 + 3 * 2);
  });

  it('scores phase-3 FAQ loop signals', () => {
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, faqNoResult: 1 })).toBe(3);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, faqReopen: 1 })).toBe(2);
    expect(computeFrictionScore({ ...EMPTY_COUNTERS, failAfterHelp: 1 })).toBe(4);
    expect(
      computeFrictionScore({
        ...EMPTY_COUNTERS,
        faqNoResult: 5,
        faqReopen: 5,
        failAfterHelp: 5,
      }),
    ).toBe(3 * 2 + 2 * 2 + 4 * 2);
  });

  it('normalizes against FRICTION_SCORE_MAX (P4)', () => {
    expect(FRICTION_SCORE_MAX).toBe(79);
    expect(normalizeFrictionScore(FRICTION_SCORE_MAX * 0.2)).toBeCloseTo(0.2);
    expect(normalizeFrictionScore(79)).toBe(1);
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
