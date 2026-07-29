import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveSDKConfig } from '../core/sdk-state';
import type { FaqSearchOptions, FaqSemanticSearchResult, SDKConfig } from '../types';
import { searchFaq } from '../utils/faq-search-client';
import { emitFaqFriction, isWeakFaqSearch } from '../utils/friction-advanced-signals';
import { recordSupportFaqSearch } from '../utils/support-ticket-runtime-signals';

export interface UseFaqSemanticSearchOptions extends FaqSearchOptions {
  config?: Partial<SDKConfig>;
  enabled?: boolean;
  debounceMs?: number;
}

export interface UseFaqSemanticSearchResult {
  search: (question: string) => Promise<FaqSemanticSearchResult[]>;
  searchDebounced: (question: string) => void;
  results: FaqSemanticSearchResult[];
  isLoading: boolean;
  error: string | null;
  lastStrategyStep: string | null;
  lastQuery: string | null;
  clear: () => void;
}

export function useFaqSemanticSearch(
  options?: UseFaqSemanticSearchOptions,
): UseFaqSemanticSearchResult {
  const enabled = options?.enabled ?? false;
  const debounceMs = Math.max(0, options?.debounceMs ?? 400);

  const [results, setResults] = useState<FaqSemanticSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStrategyStep, setLastStrategyStep] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const resolvedConfig = useMemo(() => {
    try {
      return resolveSDKConfig(options?.config);
    } catch {
      return null;
    }
  }, [options?.config]);

  const searchOptions = useMemo<FaqSearchOptions>(
    () => ({
      topK: options?.topK,
      minSimilarity: options?.minSimilarity,
      timeoutMs: options?.timeoutMs,
      minQueryLength: options?.minQueryLength,
      cacheTtlMs: options?.cacheTtlMs,
      projectKey: options?.projectKey,
    }),
    [
      options?.topK,
      options?.minSimilarity,
      options?.timeoutMs,
      options?.minQueryLength,
      options?.cacheTtlMs,
      options?.projectKey,
    ],
  );

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setResults([]);
    setError(null);
    setIsLoading(false);
    setLastStrategyStep(null);
    setLastQuery(null);
  }, []);

  const search = useCallback(
    async (question: string): Promise<FaqSemanticSearchResult[]> => {
      if (!enabled) return [];
      if (!resolvedConfig) {
        setError('[TrustDev SDK] FAQ search requires initSDK(...) or hook config with apiKey.');
        return [];
      }

      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const response = await searchFaq(resolvedConfig, question, searchOptions);
        if (requestId !== requestIdRef.current) return response.results;

        if (response.status === 'ok') {
          setResults(response.results);
          setLastStrategyStep(response.strategyStep);
          setLastQuery(response.query);
          recordSupportFaqSearch(response.query);
          const queryText = (response.query ?? question).trim();
          const topScore = response.results[0]?.score ?? null;
          emitFaqFriction({
            type: 'search',
            query: queryText,
            resultCount: response.results.length,
            strategyStep: response.strategyStep,
            topScore,
          });
          if (
            isWeakFaqSearch({
              resultCount: response.results.length,
              strategyStep: response.strategyStep,
              topScore,
            })
          ) {
            emitFaqFriction({
              type: 'noResult',
              query: queryText,
              resultCount: response.results.length,
              strategyStep: response.strategyStep,
              topScore,
            });
          }
          setError(null);
          return response.results;
        }

        setResults([]);
        setLastStrategyStep(response.strategyStep);
        setLastQuery(response.query);
        recordSupportFaqSearch(response.query);
        setError(response.error);
        return [];
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [enabled, resolvedConfig, searchOptions],
  );

  const searchDebounced = useCallback(
    (question: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void search(question);
      }, debounceMs);
    },
    [debounceMs, search],
  );

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  return {
    search,
    searchDebounced,
    results,
    isLoading,
    error,
    lastStrategyStep,
    lastQuery,
    clear,
  };
}
