/// <reference types="jest" />

import {
  buildAbandonmentFeatureFingerprint,
  buildAbandonmentRawFeatures,
  countAbandonmentSignals,
  hasMinimumAbandonmentSignals,
} from '../src/utils/abandonment-features';

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

describe('buildAbandonmentRawFeatures', () => {
  it('maps friction counters to backend raw schema units', () => {
    const features = buildAbandonmentRawFeatures(
      {
        ...EMPTY_COUNTERS,
        clickMiss: 2,
        scrollHesitation: 1,
        timeOnPageExcessive: 1,
        navigationBack: 1,
        rageClick: 1,
        errorClick: 1,
        slowResponse: 2,
        faqNoResult: 1,
      },
      {
        elapsedSeconds: 83,
        pageSeconds: 28,
        idleSeconds: 12,
        maxScrollDepth: 41.4,
        pageVisitCount: 2,
        hasError: false,
        helpTriggered: true,
      },
    );

    expect(features).toEqual({
      timeOnPage: 83,
      scrollDepth: 41,
      clickMisses: 3,
      hesitations: 4,
      helpTriggered: 1,
      hasError: 1,
      multiplePages: 1,
      idleSeconds: 12,
      pageTime: 28,
    });
  });

  it('defaults scrollDepth to 0 when user never scrolled', () => {
    const features = buildAbandonmentRawFeatures(
      { ...EMPTY_COUNTERS },
      {
        elapsedSeconds: 5,
        pageSeconds: 5,
        idleSeconds: 5,
        maxScrollDepth: 0,
        pageVisitCount: 1,
        hasError: false,
        helpTriggered: false,
      },
    );

    expect(features.scrollDepth).toBe(0);
    expect(features.multiplePages).toBe(0);
    expect(features.pageTime).toBe(5);
  });

  it('folds phase-2 nav stagnation into multiplePages', () => {
    const features = buildAbandonmentRawFeatures(
      { ...EMPTY_COUNTERS, navigationLoop: 1 },
      {
        elapsedSeconds: 20,
        pageSeconds: 5,
        idleSeconds: 0,
        maxScrollDepth: 0,
        pageVisitCount: 1,
        hasError: false,
        helpTriggered: false,
      },
    );
    expect(features.multiplePages).toBe(1);
  });
});

describe('abandonment signal gating', () => {
  it('counts click misses, hesitations and phase-1/2 signals', () => {
    expect(countAbandonmentSignals({ ...EMPTY_COUNTERS, clickMiss: 1 })).toBe(1);
    expect(
      hasMinimumAbandonmentSignals({ ...EMPTY_COUNTERS, clickMiss: 1, scrollHesitation: 1 }, 2),
    ).toBe(true);
    expect(countAbandonmentSignals({ ...EMPTY_COUNTERS, rageClick: 1, errorClick: 1 })).toBe(2);
    expect(
      countAbandonmentSignals({
        ...EMPTY_COUNTERS,
        navigationLoop: 1,
        uTurn: 1,
        slowResponse: 1,
      }),
    ).toBe(3);
    expect(
      countAbandonmentSignals({
        ...EMPTY_COUNTERS,
        faqNoResult: 1,
        faqReopen: 1,
        failAfterHelp: 1,
      }),
    ).toBe(3);
  });

  it('opens ML gate on temporal stall only when allowed', () => {
    expect(
      hasMinimumAbandonmentSignals(
        { ...EMPTY_COUNTERS, timeOnPageExcessive: 1 },
        2,
        {
          elapsedSeconds: 20,
          pageSeconds: 50,
          idleSeconds: 0,
          maxScrollDepth: 12,
          pageVisitCount: 1,
          hasError: false,
          helpTriggered: false,
        },
        { allowTemporalMlGate: true },
      ),
    ).toBe(true);

    expect(
      hasMinimumAbandonmentSignals(
        { ...EMPTY_COUNTERS, timeOnPageExcessive: 1 },
        2,
        {
          elapsedSeconds: 75,
          pageSeconds: 50,
          idleSeconds: 0,
          maxScrollDepth: 12,
          pageVisitCount: 1,
          hasError: false,
          helpTriggered: false,
        },
        { allowTemporalMlGate: false },
      ),
    ).toBe(false);
  });

  it('builds stable feature fingerprints with time/scroll buckets', () => {
    const fingerprint = buildAbandonmentFeatureFingerprint({
      timeOnPage: 17,
      pageTime: 17,
      scrollDepth: 23,
      clickMisses: 1,
      hesitations: 0,
      helpTriggered: 0,
      hasError: 0,
      multiplePages: 0,
    });
    expect(fingerprint).toBe('10:10:20:1:0:0:0:0');

    const sameBucket = buildAbandonmentFeatureFingerprint({
      timeOnPage: 19,
      pageTime: 19,
      scrollDepth: 24,
      clickMisses: 1,
      hesitations: 0,
      helpTriggered: 0,
      hasError: 0,
      multiplePages: 0,
    });
    expect(sameBucket).toBe(fingerprint);
  });
});
