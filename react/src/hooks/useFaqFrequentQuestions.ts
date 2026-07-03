import { useEffect, useMemo, useState } from 'react';
import { resolveSDKConfig } from '../core/sdk-state';
import type { SDKConfig } from '../types';
import type { FaqFrequentQuestionsMode, FaqPageContext } from '../types/faq';
import {
  buildFaqSuggestionContext,
  fetchFaqSuggestions,
} from '../utils/faq-suggestions-client';
import { resolveFaqProjectKey } from '../utils/faq-project-key';

export interface UseFaqFrequentQuestionsOptions {
  config?: Partial<SDKConfig>;
  enabled?: boolean;
  context: FaqPageContext;
  mode?: FaqFrequentQuestionsMode;
  manualQuestions?: string[];
  limit?: number;
  projectKey?: string;
}

export function useFaqFrequentQuestions(
  options: UseFaqFrequentQuestionsOptions,
): { questions: string[]; isLoading: boolean } {
  const enabled = options.enabled ?? false;
  const mode = options.mode ?? 'auto';
  const limit = options.limit ?? 4;
  const manualQuestions = options.manualQuestions ?? [];
  const suggestionContext = useMemo(
    () => buildFaqSuggestionContext(options.context),
    [options.context],
  );
  const resolvedProjectKey = useMemo(
    () => resolveFaqProjectKey({ projectKey: options.projectKey, pageContext: options.context }),
    [options.context, options.projectKey],
  );

  const [questions, setQuestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || mode === 'off') {
      setQuestions([]);
      setIsLoading(false);
      return undefined;
    }

    if (mode === 'manual') {
      setQuestions(manualQuestions.filter(Boolean));
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const resolvedConfig = resolveSDKConfig(options.config);
        const suggestions = await fetchFaqSuggestions(resolvedConfig, {
          context: suggestionContext,
          limit,
          projectKey: resolvedProjectKey,
        });
        if (cancelled) return;
        setQuestions(suggestions.map((item) => item.question));
      } catch {
        if (!cancelled) setQuestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, limit, manualQuestions, mode, options.config, resolvedProjectKey, suggestionContext]);

  return { questions, isLoading };
}
