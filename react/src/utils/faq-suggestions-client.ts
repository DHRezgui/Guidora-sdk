import { resolveSdkAuthBearerTokenAsync } from '../core/auth-token';
import type { NormalizedSDKConfig } from '../types';
import type { FaqPageContext } from '../types/faq';

export interface FaqSuggestionItem {
  id: string;
  question: string;
}

export interface FaqSuggestionsResponse {
  success: boolean;
  count: number;
  suggestions: FaqSuggestionItem[];
}

export interface FetchFaqSuggestionsOptions {
  context?: string;
  limit?: number;
  timeoutMs?: number;
}

const DEFAULT_LIMIT = 4;
const DEFAULT_TIMEOUT_MS = 15_000;

type CacheEntry = {
  expiresAt: number;
  suggestions: FaqSuggestionItem[];
};

const suggestionsCache = new Map<string, CacheEntry>();

export function clearFaqSuggestionsCache(): void {
  suggestionsCache.clear();
}

function buildCacheKey(
  config: NormalizedSDKConfig,
  context: string,
  limit: number,
): string {
  const tokenSuffix = config.sdkToken?.slice(-8) ?? config.apiKey.slice(-8);
  return [config.apiUrl, tokenSuffix, context.trim().toLowerCase(), limit].join('::');
}

/** Builds a ranking context string from page/tour metadata. */
export function buildFaqSuggestionContext(context: FaqPageContext): string {
  return [
    context.pageTitle,
    context.pathname,
    context.tourName,
    context.tourStepTitle,
    context.projectDomain,
    ...(context.suggestionKeywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export async function fetchFaqSuggestions(
  config: NormalizedSDKConfig,
  options: FetchFaqSuggestionsOptions = {},
): Promise<FaqSuggestionItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 10));
  const context = options.context?.trim() ?? '';
  const cacheKey = buildCacheKey(config, context, limit);
  const cached = suggestionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.suggestions;
  }

  const timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (context) params.set('context', context);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const token = await resolveSdkAuthBearerTokenAsync(config);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }

    const response = await fetch(`${config.apiUrl}/faq/suggestions?${params.toString()}`, {
      method: 'GET',
      headers,
      signal: controller?.signal,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as FaqSuggestionsResponse;
    const suggestions = Array.isArray(data.suggestions)
      ? data.suggestions.filter(
          (item): item is FaqSuggestionItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.id === 'string' &&
            typeof item.question === 'string',
        )
      : [];

    suggestionsCache.set(cacheKey, {
      suggestions,
      expiresAt: Date.now() + 120_000,
    });
    return suggestions;
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
