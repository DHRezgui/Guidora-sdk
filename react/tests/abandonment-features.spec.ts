/// <reference types="jest" />

import {
  buildAbandonmentFeatureFingerprint,
  buildAbandonmentRawFeatures,
  countAbandonmentSignals,
  hasMinimumAbandonmentSignals,
} from '../src/utils/abandonment-features';

describe('buildAbandonmentRawFeatures', () => {
  it('maps friction counters to backend raw schema units', () => {
    const features = buildAbandonmentRawFeatures(
      {
        clickMiss: 2,
        scrollHesitation: 1,
        timeOnPageExcessive: 1,
        formAbandonment: 0,
        navigationBack: 1,
      },
      {
        elapsedSeconds: 83,
        pageSeconds: 28,
        idleSeconds: 12,
        maxScrollDepth: 41.4,
        pageVisitCount: 2,
        hasError: true,
        helpTriggered: true,
      },
    );

    expect(features).toEqual({
      timeOnPage: 83,
      scrollDepth: 41,
      clickMisses: 2,
      hesitations: 1,
      helpTriggered: 1,
      hasError: 1,
      multiplePages: 1,
      idleSeconds: 12,
      pageTime: 28,
    });
  });

  it('defaults scrollDepth to 0 when user never scrolled', () => {
    const features = buildAbandonmentRawFeatures(
      {
        clickMiss: 0,
        scrollHesitation: 0,
        timeOnPageExcessive: 0,
        formAbandonment: 0,
        navigationBack: 0,
      },
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
});

describe('abandonment signal gating', () => {
  it('counts click misses and hesitations as signals', () => {
    expect(countAbandonmentSignals({ clickMiss: 1, scrollHesitation: 0, timeOnPageExcessive: 0, formAbandonment: 0, navigationBack: 0 })).toBe(1);
    expect(hasMinimumAbandonmentSignals({ clickMiss: 1, scrollHesitation: 1, timeOnPageExcessive: 0, formAbandonment: 0, navigationBack: 0 }, 2)).toBe(true);
  });

  it('opens ML gate on temporal stall only when allowed', () => {
    expect(
      hasMinimumAbandonmentSignals(
        { clickMiss: 0, scrollHesitation: 0, timeOnPageExcessive: 1, formAbandonment: 0, navigationBack: 0 },
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
        { clickMiss: 0, scrollHesitation: 0, timeOnPageExcessive: 1, formAbandonment: 0, navigationBack: 0 },
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
