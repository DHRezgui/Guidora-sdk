import { resolveSdkAuthBearerTokenAsync } from '../core/auth-token';
import type { NormalizedSDKConfig } from '../types';
import type {
  AbandonmentPredictionClientResult,
  AbandonmentPredictionOptions,
  AbandonmentPredictionResponse,
  AbandonmentRawFeatures,
} from '../types/ml';
import {
  buildAbandonmentFeatureFingerprint,
  hasMinimumAbandonmentSignals,
} from './abandonment-features';
import { normalizeFrictionScore } from './friction-scoring';
import { computeAbandonmentConfidence } from './abandonment-confidence';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 20_000;
const DEFAULT_THRESHOLD = 0.5;
/** Backend enforces 1 request / 10s / session — mirror that on the client. */
export const ABANDONMENT_SESSION_MIN_INTERVAL_MS = 10_000;

type CacheEntry = {
  expiresAt: number;
  result: AbandonmentPredictionClientResult;
};

const predictionCache = new Map<string, CacheEntry>();
const inFlightPredictions = new Map<string, Promise<AbandonmentPredictionClientResult>>();
const inFlightSessions = new Map<string, Promise<AbandonmentPredictionClientResult>>();
const sessionLastNetworkAt = new Map<string, number>();

export function clearAbandonmentPredictionCache(): void {
  predictionCache.clear();
  inFlightPredictions.clear();
  inFlightSessions.clear();
  sessionLastNetworkAt.clear();
}

function readCache(key: string): AbandonmentPredictionClientResult | null {
  const entry = predictionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    predictionCache.delete(key);
    return null;
  }
  return entry.result;
}

/** Last successful ML result for this session (any feature fingerprint within TTL). */
function readSessionMlCache(
  config: NormalizedSDKConfig,
  sessionId: string | undefined,
): AbandonmentPredictionClientResult | null {
  const tokenSuffix = config.sdkToken?.slice(-8) ?? config.apiKey.slice(-8);
  const prefix = [config.apiUrl, tokenSuffix, sessionId ?? 'anonymous'].join('::');
  const now = Date.now();
  let best: CacheEntry | null = null;

  for (const [key, entry] of predictionCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (now > entry.expiresAt) continue;
    if (entry.result.status !== 'ok' || entry.result.source !== 'ml') continue;
    if (!best || entry.expiresAt > best.expiresAt) {
      best = entry;
    }
  }

  return best?.result ?? null;
}

function writeCache(key: string, result: AbandonmentPredictionClientResult, ttlMs: number): void {
  if (ttlMs <= 0 || result.status !== 'ok') return;
  predictionCache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

function buildCacheKey(
  config: NormalizedSDKConfig,
  sessionId: string | undefined,
  fingerprint: string,
  debug = false,
): string {
  const tokenSuffix = config.sdkToken?.slice(-8) ?? config.apiKey.slice(-8);
  return [config.apiUrl, tokenSuffix, sessionId ?? 'anonymous', fingerprint, debug ? 'explain' : 'base'].join('::');
}

function buildSessionKey(config: NormalizedSDKConfig, sessionId: string | undefined): string {
  const tokenSuffix = config.sdkToken?.slice(-8) ?? config.apiKey.slice(-8);
  return [config.apiUrl, tokenSuffix, sessionId ?? 'anonymous'].join('::');
}

function mapLocalFallback(
  localScore: { score: number },
  threshold: number,
): AbandonmentPredictionClientResult {
  const normalizedRisk = normalizeFrictionScore(localScore.score);
  return {
    status: 'fallback',
    source: 'local',
    error: null,
    prediction: {
      abandonmentRisk: normalizedRisk,
      willAbandon: normalizedRisk >= threshold,
      confidence: computeAbandonmentConfidence(normalizedRisk, threshold),
      threshold,
    },
  };
}

function resolveThrottledResult(
  cacheKey: string,
  config: NormalizedSDKConfig,
  sessionId: string | undefined,
  localScore: { score: number },
  threshold: number,
): AbandonmentPredictionClientResult {
  const cached = readCache(cacheKey) ?? readSessionMlCache(config, sessionId);
  const localRisk = normalizeFrictionScore(localScore.score);

  if (cached?.prediction && cached.source === 'ml' && localRisk > cached.prediction.abandonmentRisk) {
    return {
      status: 'fallback',
      source: 'local',
      error: null,
      prediction: {
        abandonmentRisk: localRisk,
        willAbandon: localRisk >= threshold,
        confidence: computeAbandonmentConfidence(localRisk, threshold),
        threshold,
      },
    };
  }

  return cached ?? mapLocalFallback(localScore, threshold);
}

export async function predictAbandonment(
  config: NormalizedSDKConfig,
  features: AbandonmentRawFeatures,
  options?: AbandonmentPredictionOptions & {
    counters?: import('../types').FrictionCounters;
    localScore?: { score: number };
    signals?: import('../types/ml').FrictionBehaviorSignals;
  },
): Promise<AbandonmentPredictionClientResult> {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const minSignals = Math.max(1, options?.minSignals ?? 2);
  const localScore = options?.localScore ?? { score: 0, riskLevel: 'NONE' as const };

  if (
    options?.counters &&
    !hasMinimumAbandonmentSignals(options.counters, minSignals, options.signals, {
      allowTemporalMlGate: options.allowTemporalMlGate,
    })
  ) {
    return {
      status: 'insufficient_signals',
      source: 'local',
      error: null,
      prediction: mapLocalFallback(localScore, threshold).prediction,
    };
  }

  const fingerprint = buildAbandonmentFeatureFingerprint(features);
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const debug = options?.debug === true;
  const forceRefresh = options?.forceRefresh === true;
  const cacheKey = buildCacheKey(config, options?.sessionId, fingerprint, debug);

  if (!forceRefresh) {
    const cached = readCache(cacheKey);
    if (cached) return cached;

    const inFlight = inFlightPredictions.get(cacheKey);
    if (inFlight) return inFlight;

    const sessionKey = buildSessionKey(config, options?.sessionId);
    const sessionInFlight = inFlightSessions.get(sessionKey);
    if (sessionInFlight) {
      await sessionInFlight;
      const afterSession = readCache(cacheKey);
      if (afterSession) return afterSession;
      // Different fingerprint while another call was in flight — do not steal that result.
      // Fall through only if the client cooldown allows a new network call.
    }

    const lastNetworkAt = sessionLastNetworkAt.get(sessionKey) ?? 0;
    if (Date.now() - lastNetworkAt < ABANDONMENT_SESSION_MIN_INTERVAL_MS) {
      return resolveThrottledResult(
        cacheKey,
        config,
        options?.sessionId,
        localScore,
        threshold,
      );
    }
  } else {
    predictionCache.delete(cacheKey);
  }

  const sessionKey = buildSessionKey(config, options?.sessionId);
  const timeoutMs = Math.max(100, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const predictionPromise = (async (): Promise<AbandonmentPredictionClientResult> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      const token = await resolveSdkAuthBearerTokenAsync(config);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      } else if (config.apiKey) {
        headers['x-api-key'] = config.apiKey;
      }

      const response = await fetch(`${config.apiUrl}/ml/predictions/abandonment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          features,
          threshold,
          sessionId: options?.sessionId,
          ...(debug
            ? {
                explain: true,
                debug: true,
              }
            : {}),
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          return resolveThrottledResult(
            cacheKey,
            config,
            options?.sessionId,
            localScore,
            threshold,
          );
        }
        return mapLocalFallback(localScore, threshold);
      }

      const data = (await response.json()) as AbandonmentPredictionResponse;
      if (!data.success || !data.prediction) {
        return mapLocalFallback(localScore, threshold);
      }

      const result: AbandonmentPredictionClientResult = {
        status: 'ok',
        source: 'ml',
        error: null,
        prediction: data.prediction,
      };
      writeCache(cacheKey, result, cacheTtlMs);
      sessionLastNetworkAt.set(sessionKey, Date.now());
      return result;
    } catch {
      return mapLocalFallback(localScore, threshold);
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  inFlightPredictions.set(cacheKey, predictionPromise);
  inFlightSessions.set(sessionKey, predictionPromise);
  try {
    return await predictionPromise;
  } finally {
    inFlightPredictions.delete(cacheKey);
    if (inFlightSessions.get(sessionKey) === predictionPromise) {
      inFlightSessions.delete(sessionKey);
    }
  }
}
