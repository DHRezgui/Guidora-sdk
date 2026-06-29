import { resolveSdkAuthBearerTokenAsync } from '../core/auth-token';
import type { NormalizedSDKConfig } from '../types';
import type {
  FaqSearchClientResult,
  FaqSearchOptions,
  FaqSemanticSearchRequest,
  FaqSemanticSearchResponse,
  FaqSemanticSearchResult,
} from '../types/faq';

/** First FAQ call may load Sentence Transformers in Python (30–120 s); align with backend FAQ_PYTHON_TIMEOUT_MS. */
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MIN_QUERY_LENGTH = 3;
const DEFAULT_TOP_K = 5;
const MAX_QUESTION_LENGTH = 500;

type CacheEntry = {
  expiresAt: number;
  result: FaqSearchClientResult;
};

const searchCache = new Map<string, CacheEntry>();

export function normalizeFaqQuery(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function clearFaqSearchCache(): void {
  searchCache.clear();
}

function buildCacheKey(config: NormalizedSDKConfig, request: FaqSemanticSearchRequest): string {
  const tokenSuffix = config.sdkToken?.slice(-8) ?? config.apiKey.slice(-8);
  return [
    config.apiUrl,
    tokenSuffix,
    normalizeFaqQuery(request.question),
    request.topK ?? DEFAULT_TOP_K,
    request.minSimilarity ?? '',
  ].join('::');
}

function readCache(key: string): FaqSearchClientResult | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: FaqSearchClientResult, ttlMs: number): void {
  if (ttlMs <= 0 || result.status !== 'ok') return;
  searchCache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

function sanitiseResults(raw: unknown): FaqSemanticSearchResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is FaqSemanticSearchResult =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as FaqSemanticSearchResult).id === 'string' &&
      typeof (item as FaqSemanticSearchResult).question === 'string' &&
      typeof (item as FaqSemanticSearchResult).answer === 'string' &&
      typeof (item as FaqSemanticSearchResult).score === 'number',
  );
}

export async function searchFaq(
  config: NormalizedSDKConfig,
  question: string,
  options?: FaqSearchOptions,
): Promise<FaqSearchClientResult> {
  const trimmed = question.trim();
  const minQueryLength = Math.max(1, options?.minQueryLength ?? DEFAULT_MIN_QUERY_LENGTH);

  if (trimmed.length < minQueryLength) {
    return {
      status: 'invalid',
      results: [],
      query: null,
      strategyStep: null,
      error: `Question must be at least ${minQueryLength} characters.`,
    };
  }

  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      status: 'invalid',
      results: [],
      query: null,
      strategyStep: null,
      error: `Question must be at most ${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  const request: FaqSemanticSearchRequest = {
    question: trimmed,
    topK: options?.topK ?? DEFAULT_TOP_K,
    ...(options?.minSimilarity !== undefined ? { minSimilarity: options.minSimilarity } : {}),
  };

  const cacheTtlMs = options?.cacheTtlMs ?? 60_000;
  const cacheKey = buildCacheKey(config, request);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const timeoutMs = Math.max(100, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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

    const response = await fetch(`${config.apiUrl}/faq/semantic-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const result: FaqSearchClientResult = {
        status: 'error',
        results: [],
        query: null,
        strategyStep: null,
        error: text || `FAQ search failed with HTTP ${response.status}`,
      };
      return result;
    }

    const data = (await response.json()) as FaqSemanticSearchResponse;
    const results = sanitiseResults(data.results);
    const result: FaqSearchClientResult = {
      status: 'ok',
      results,
      query: typeof data.query === 'string' ? data.query : normalizeFaqQuery(trimmed),
      strategyStep: typeof data.strategyStep === 'string' ? data.strategyStep : null,
      error: null,
    };
    writeCache(cacheKey, result, cacheTtlMs);
    return result;
  } catch (error) {
    const isAbort =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';

    return {
      status: isAbort ? 'timeout' : 'error',
      results: [],
      query: null,
      strategyStep: null,
      error: isAbort
        ? `FAQ search timed out after ${Math.round(timeoutMs / 1000)}s. The first query can be slow while the ML model loads — retry or increase timeoutMs.`
        : error instanceof Error
          ? error.message
          : 'FAQ search failed',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
