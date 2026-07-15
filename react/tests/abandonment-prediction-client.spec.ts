/// <reference types="jest" />

import {
  ABANDONMENT_SESSION_MIN_INTERVAL_MS,
  clearAbandonmentPredictionCache,
  predictAbandonment,
} from '../src/utils/abandonment-prediction-client';
import type { NormalizedSDKConfig } from '../src/types';

const baseConfig: NormalizedSDKConfig = {
  apiKey: 'demo-key',
  apiUrl: 'http://localhost:3020/api/v1',
  sdkToken: 'td_sdk_test_ml_scope',
  debug: false,
  trackBatchSize: 20,
  trackFlushIntervalMs: 5000,
  syncEnabled: true,
  syncIntervalMs: 15000,
  syncOnFocus: true,
  syncOnReconnect: true,
  dockLayout: {
    enabled: true,
    useHostHeuristics: true,
    hostAvoidSelectors: [],
    minClearancePx: 12,
  },
  faqDefaults: null,
};

const sampleFeatures = {
  timeOnPage: 83,
  scrollDepth: 41,
  clickMisses: 2,
  hesitations: 1,
  helpTriggered: 0,
  hasError: 0,
  multiplePages: 1,
} as const;

const openGateCounters = {
  clickMiss: 2,
  scrollHesitation: 1,
  timeOnPageExcessive: 0,
  formAbandonment: 0,
  navigationBack: 0,
} as const;

describe('predictAbandonment', () => {
  beforeEach(() => {
    clearAbandonmentPredictionCache();
    jest.restoreAllMocks();
  });

  it('returns insufficient_signals before minSignals threshold', async () => {
    const result = await predictAbandonment(baseConfig, sampleFeatures, {
      counters: {
        clickMiss: 0,
        scrollHesitation: 0,
        timeOnPageExcessive: 0,
        formAbandonment: 0,
        navigationBack: 0,
      },
      localScore: { score: 0 },
      minSignals: 2,
    });

    expect(result.status).toBe('insufficient_signals');
    expect(result.source).toBe('local');
  });

  it('returns ML prediction on HTTP 200', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          abandonmentRisk: 0.42,
          willAbandon: false,
          confidence: 0.91,
          threshold: 0.5,
        },
      }),
    } as Response);

    const result = await predictAbandonment(baseConfig, sampleFeatures, {
      counters: openGateCounters,
      localScore: { score: 4 },
      minSignals: 2,
    });

    expect(result.status).toBe('ok');
    expect(result.source).toBe('ml');
    expect(result.prediction?.abandonmentRisk).toBe(0.42);
  });

  it('falls back locally when API fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    } as Response);

    const result = await predictAbandonment(baseConfig, sampleFeatures, {
      counters: openGateCounters,
      localScore: { score: 8 },
      minSignals: 2,
    });

    expect(result.status).toBe('fallback');
    expect(result.source).toBe('local');
    expect(result.prediction?.abandonmentRisk).toBeGreaterThan(0);
  });

  it('displays raw ML risk instead of masking it with the local ramp', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          abandonmentRisk: 0.2365,
          willAbandon: false,
          confidence: 0.8865,
          threshold: 0.35,
        },
      }),
    } as Response);

    const result = await predictAbandonment(
      baseConfig,
      { ...sampleFeatures, clickMisses: 2, hesitations: 0, scrollDepth: 5 },
      {
        counters: {
          clickMiss: 2,
          scrollHesitation: 0,
          timeOnPageExcessive: 0,
          formAbandonment: 0,
          navigationBack: 0,
        },
        localScore: { score: 4 },
        minSignals: 2,
        threshold: 0.35,
      },
    );

    expect(result.source).toBe('ml');
    expect(result.prediction?.abandonmentRisk).toBeCloseTo(0.2365, 4);
  });

  it('throttles network calls within the backend session window', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          abandonmentRisk: 0.2365,
          willAbandon: false,
          confidence: 0.88,
          threshold: 0.35,
        },
      }),
    } as Response);

    const first = await predictAbandonment(
      baseConfig,
      { ...sampleFeatures, clickMisses: 2, hesitations: 0, timeOnPage: 20 },
      {
        counters: {
          clickMiss: 2,
          scrollHesitation: 0,
          timeOnPageExcessive: 0,
          formAbandonment: 0,
          navigationBack: 0,
        },
        localScore: { score: 4 },
        minSignals: 2,
        sessionId: 'throttle-session',
        threshold: 0.35,
      },
    );

    const second = await predictAbandonment(
      baseConfig,
      { ...sampleFeatures, clickMisses: 2, hesitations: 1, timeOnPage: 35 },
      {
        counters: {
          clickMiss: 2,
          scrollHesitation: 1,
          timeOnPageExcessive: 1,
          formAbandonment: 0,
          navigationBack: 0,
        },
        localScore: { score: 6 },
        minSignals: 2,
        sessionId: 'throttle-session',
        threshold: 0.35,
      },
    );

    expect(first.source).toBe('ml');
    expect(second.source).toBe('ml');
    expect(second.prediction?.abandonmentRisk).toBeCloseTo(0.2365, 4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ABANDONMENT_SESSION_MIN_INTERVAL_MS).toBe(10_000);
  });

  it('does not reuse an in-flight result for a different fingerprint without a new call when allowed', async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;

    jest.spyOn(global, 'fetch').mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return firstResponse;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          prediction: {
            abandonmentRisk: 0.46,
            willAbandon: true,
            confidence: 0.7,
            threshold: 0.35,
          },
        }),
      } as Response);
    });

    const firstCall = predictAbandonment(
      baseConfig,
      { ...sampleFeatures, clickMisses: 2, hesitations: 0, timeOnPage: 10 },
      {
        counters: {
          clickMiss: 2,
          scrollHesitation: 0,
          timeOnPageExcessive: 0,
          formAbandonment: 0,
          navigationBack: 0,
        },
        localScore: { score: 4 },
        minSignals: 2,
        sessionId: 'race-session',
        threshold: 0.35,
      },
    );

    const secondCall = predictAbandonment(
      baseConfig,
      { ...sampleFeatures, clickMisses: 2, hesitations: 1, timeOnPage: 50 },
      {
        counters: {
          clickMiss: 2,
          scrollHesitation: 1,
          timeOnPageExcessive: 1,
          formAbandonment: 0,
          navigationBack: 0,
        },
        localScore: { score: 6 },
        minSignals: 2,
        sessionId: 'race-session',
        threshold: 0.35,
      },
    );

    resolveFirst({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        prediction: {
          abandonmentRisk: 0.2365,
          willAbandon: false,
          confidence: 0.88,
          threshold: 0.35,
        },
      }),
    } as Response);

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);

    expect(firstResult.source).toBe('ml');
    expect(firstResult.prediction?.abandonmentRisk).toBeCloseTo(0.2365, 4);
    // Second call is throttled within 10s → reuses session ML, does not fire a 429 race.
    expect(secondResult.source).toBe('ml');
    expect(secondResult.prediction?.abandonmentRisk).toBeCloseTo(0.2365, 4);
    expect(callCount).toBe(1);
  });
});
