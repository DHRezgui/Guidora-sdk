import { useEffect, useRef } from 'react';
import { resolveSDKConfig } from '../core/sdk-state';
import type { FaqSemanticSearchResult, SDKConfig } from '../types';
import { trackFaqFeedback, trackFaqView } from '../utils/faq-usage-client';

export function useFaqResultUsageTracking(
  config: Partial<SDKConfig> | undefined,
  results: FaqSemanticSearchResult[],
  enabled = true,
): {
  submitFeedback: (faqId: string, helpful: boolean) => void;
} {
  const lastTrackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || results.length === 0) return;

    const trackKey = results.map((result) => result.id).join('|');
    if (lastTrackedKeyRef.current === trackKey) return;
    lastTrackedKeyRef.current = trackKey;

    try {
      const resolvedConfig = resolveSDKConfig(config);
      for (const result of results) {
        void trackFaqView(resolvedConfig, result.id);
      }
    } catch {
      lastTrackedKeyRef.current = null;
    }
  }, [config, enabled, results]);

  const submitFeedback = (faqId: string, helpful: boolean) => {
    if (!enabled) return;
    try {
      const resolvedConfig = resolveSDKConfig(config);
      void trackFaqFeedback(resolvedConfig, faqId, helpful);
    } catch {
      // ignore when SDK is not configured
    }
  };

  return { submitFeedback };
}
