import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveSDKConfig } from '../core/sdk-state';
import type { FrictionCounters, SDKConfig } from '../types';
import type {
  AbandonmentIntentPolicy,
  AbandonmentPredictionClientResult,
  FrictionBehaviorSignals,
  SdkAbandonmentPredictionConfig,
} from '../types/ml';
import {
  buildAbandonmentRawFeatures,
  countAbandonmentSignals,
  hasMinimumAbandonmentSignals,
} from '../utils/abandonment-features';
import { hasTemporalMlGateSignals } from '../utils/friction-scoring';
import {
  ABANDONMENT_SESSION_MIN_INTERVAL_MS,
  predictAbandonment,
} from '../utils/abandonment-prediction-client';
import type { FrictionScoreResult } from './useFrictionScore';

export interface UseAbandonmentPredictionOptions extends SdkAbandonmentPredictionConfig {
  config?: Partial<SDKConfig>;
  counters: FrictionCounters;
  getSignals: () => FrictionBehaviorSignals;
  localScore: FrictionScoreResult;
  sessionId?: string;
  intentPolicy?: AbandonmentIntentPolicy;
  onHighRisk?: (result: AbandonmentPredictionClientResult) => void;
  /** SDK debug mode — enables SHAP explanations from the backend. */
  debug?: boolean;
  /**
   * When true, stop polling / refresh but keep the last known result
   * (assistance orchestrator pause — tour / FAQ / toast active).
   */
  paused?: boolean;
}

export interface UseAbandonmentPredictionResult {
  result: AbandonmentPredictionClientResult | null;
  isLoading: boolean;
  refresh: (options?: {
    force?: boolean;
  }) => Promise<AbandonmentPredictionClientResult | null>;
}

/** Coalesce burst triggers (double click-miss, stall tier, temporal gate). */
const REFRESH_DEBOUNCE_MS = 800;

function resultsAreEquivalent(
  previous: AbandonmentPredictionClientResult | null,
  next: AbandonmentPredictionClientResult,
): boolean {
  if (!previous) return false;
  if (previous.status !== next.status || previous.source !== next.source) return false;
  const prevRisk = previous.prediction?.abandonmentRisk;
  const nextRisk = next.prediction?.abandonmentRisk;
  if (prevRisk == null && nextRisk == null) return true;
  if (prevRisk == null || nextRisk == null) return false;
  return Math.abs(prevRisk - nextRisk) < 0.0001;
}

function buildConfigKey(config?: Partial<SDKConfig>): string {
  if (!config) return '';
  return [
    config.apiKey ?? '',
    config.apiUrl ?? '',
    config.sdkToken ?? '',
    config.organizationId ?? '',
    Boolean(config.getSdkToken),
  ].join('|');
}

export function useAbandonmentPrediction(
  options: UseAbandonmentPredictionOptions,
): UseAbandonmentPredictionResult {
  const enabled = options.enabled ?? false;
  const paused = options.paused === true;
  const threshold = options.threshold ?? 0.5;
  const pollIntervalMs = Math.max(
    ABANDONMENT_SESSION_MIN_INTERVAL_MS,
    options.pollIntervalMs ?? 15_000,
  );
  const minSignals = Math.max(1, options.minSignals ?? 2);
  const cacheTtlMs = options.cacheTtlMs ?? 20_000;
  const signalCount = countAbandonmentSignals(options.counters);
  const configKey = buildConfigKey(options.config);
  /** Feature on and not assistance-paused. */
  const active = enabled && !paused;

  const [result, setResult] = useState<AbandonmentPredictionClientResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const temporalGateRefreshRef = useRef(false);
  const resultRef = useRef<AbandonmentPredictionClientResult | null>(null);
  const prevSignalCountRef = useRef(signalCount);
  const prevStallTierRef = useRef(options.counters.timeOnPageExcessive);
  const debounceTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const countersRef = useRef(options.counters);
  const getSignalsRef = useRef(options.getSignals);
  const localScoreRef = useRef(options.localScore);
  const onHighRiskRef = useRef(options.onHighRisk);
  const sessionIdRef = useRef(options.sessionId);
  const enabledRef = useRef(enabled);
  const pausedRef = useRef(paused);
  const activeRef = useRef(active);
  const thresholdRef = useRef(threshold);
  const minSignalsRef = useRef(minSignals);
  const cacheTtlMsRef = useRef(cacheTtlMs);
  const debugRef = useRef(options.debug ?? false);
  const intentPolicyRef = useRef(options.intentPolicy);

  countersRef.current = options.counters;
  getSignalsRef.current = options.getSignals;
  localScoreRef.current = options.localScore;
  onHighRiskRef.current = options.onHighRisk;
  sessionIdRef.current = options.sessionId;
  enabledRef.current = enabled;
  pausedRef.current = paused;
  activeRef.current = active;
  thresholdRef.current = threshold;
  minSignalsRef.current = minSignals;
  cacheTtlMsRef.current = cacheTtlMs;
  debugRef.current = options.debug ?? false;
  intentPolicyRef.current = options.intentPolicy;
  resultRef.current = result;

  const configRef = useRef(options.config);
  configRef.current = options.config;

  const resolvedConfig = useMemo(() => {
    const cfg = configRef.current;
    if (!configKey || !cfg?.apiKey) return null;
    try {
      return resolveSDKConfig(cfg as SDKConfig);
    } catch {
      return null;
    }
  }, [configKey]);

  const resolvedConfigRef = useRef(resolvedConfig);
  resolvedConfigRef.current = resolvedConfig;

  const refresh = useCallback(async (options?: {
    force?: boolean;
  }): Promise<AbandonmentPredictionClientResult | null> => {
    if (!enabledRef.current || pausedRef.current || !resolvedConfigRef.current) {
      return resultRef.current;
    }

    if (inFlightRef.current) {
      return resultRef.current;
    }

    const force = options?.force === true;
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    const showLoading = force || resultRef.current === null;
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const features = buildAbandonmentRawFeatures(
        countersRef.current,
        getSignalsRef.current(),
      );
      const next = await predictAbandonment(resolvedConfigRef.current, features, {
        threshold: thresholdRef.current,
        minSignals: minSignalsRef.current,
        cacheTtlMs: cacheTtlMsRef.current,
        sessionId: sessionIdRef.current,
        counters: countersRef.current,
        localScore: localScoreRef.current,
        signals: getSignalsRef.current(),
        debug: debugRef.current,
        allowTemporalMlGate: intentPolicyRef.current?.allowTemporalMlGate,
        forceRefresh: force,
      });

      if (requestId !== requestIdRef.current) {
        return null;
      }

      // Forced refresh always updates UI (SHAP / timestamps), even if risk is unchanged.
      if (force || !resultsAreEquivalent(resultRef.current, next)) {
        setResult(next);
      }

      if (next.prediction) {
        // Notify whenever the model says "will abandon".
        // The actual proactive toast is further guarded by `minConfidence` and
        // cooldown in `useOnboarding`.
        if (next.prediction.willAbandon) {
          onHighRiskRef.current?.(next);
        }
      }

      return next;
    } finally {
      inFlightRef.current = false;
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (!activeRef.current) return;
    clearDebounceTimer();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void refreshRef.current();
    }, REFRESH_DEBOUNCE_MS);
  }, [clearDebounceTimer]);

  const scheduleRefreshRef = useRef(scheduleRefresh);
  scheduleRefreshRef.current = scheduleRefresh;

  useEffect(() => {
    if (!enabled) {
      clearDebounceTimer();
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setResult(null);
      setIsLoading(false);
      temporalGateRefreshRef.current = false;
      prevSignalCountRef.current = signalCount;
      prevStallTierRef.current = options.counters.timeOnPageExcessive;
      return;
    }

    // Assistance pause: keep last ML result, stop scheduling.
    if (paused) {
      clearDebounceTimer();
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      requestIdRef.current += 1;
      inFlightRef.current = false;
      setIsLoading(false);
      return;
    }

    scheduleRefreshRef.current();
    pollTimerRef.current = window.setInterval(() => {
      scheduleRefreshRef.current();
    }, pollIntervalMs);

    return () => {
      clearDebounceTimer();
      if (pollTimerRef.current != null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      requestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [enabled, paused, pollIntervalMs, clearDebounceTimer]);

  const timeStallTier = options.counters.timeOnPageExcessive;

  useEffect(() => {
    if (!active) return;
    if (prevSignalCountRef.current === signalCount) return;
    prevSignalCountRef.current = signalCount;
    scheduleRefreshRef.current();
  }, [active, signalCount]);

  useEffect(() => {
    if (!active) return;
    if (prevStallTierRef.current === timeStallTier) return;
    prevStallTierRef.current = timeStallTier;
    scheduleRefreshRef.current();
  }, [active, timeStallTier]);

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(() => {
      if (temporalGateRefreshRef.current) return;
      const signals = getSignalsRef.current();
      if (
        hasTemporalMlGateSignals(signals) &&
        !hasMinimumAbandonmentSignals(
          countersRef.current,
          minSignalsRef.current,
          signals,
          { allowTemporalMlGate: intentPolicyRef.current?.allowTemporalMlGate },
        )
      ) {
        temporalGateRefreshRef.current = true;
        scheduleRefreshRef.current();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    temporalGateRefreshRef.current = false;
  }, [options.sessionId]);

  return {
    result,
    isLoading,
    refresh,
  };
}
