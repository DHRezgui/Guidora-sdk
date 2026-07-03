import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveSDKConfig } from '../core/sdk-state';
import type { FaqSemanticSearchResult, SDKConfig } from '../types';
import { trackFaqFeedback, trackFaqView, readFaqFeedbackChoice } from '../utils/faq-usage-client';

export type FaqFeedbackChoice = 'helpful' | 'not_helpful';

export function useFaqResultUsageTracking(
  config: Partial<SDKConfig> | undefined,
  results: FaqSemanticSearchResult[],
  enabled = true,
): {
  submitFeedback: (faqId: string, helpful: boolean) => void;
  getFeedbackForResult: (faqId: string) => FaqFeedbackChoice | null;
} {
  const lastTrackedKeyRef = useRef<string | null>(null);
  const feedbackByIdRef = useRef<Record<string, FaqFeedbackChoice>>({});
  const [feedbackById, setFeedbackById] = useState<Record<string, FaqFeedbackChoice>>({});

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

  useEffect(() => {
    if (!enabled || results.length === 0) return;

    try {
      const resolvedConfig = resolveSDKConfig(config);
      const hydrated: Record<string, FaqFeedbackChoice> = {};
      for (const result of results) {
        const choice = readFaqFeedbackChoice(resolvedConfig, result.id);
        if (!choice) continue;
        hydrated[result.id] = choice;
        feedbackByIdRef.current[result.id] = choice;
      }
      if (Object.keys(hydrated).length > 0) {
        setFeedbackById((prev) => ({ ...prev, ...hydrated }));
      }
    } catch {
      // ignore when SDK is not configured
    }
  }, [config, enabled, results]);

  const submitFeedback = useCallback(
    (faqId: string, helpful: boolean) => {
      if (!enabled) return;

      try {
        const resolvedConfig = resolveSDKConfig(config);
        const existing = readFaqFeedbackChoice(resolvedConfig, faqId);
        if (existing) {
          feedbackByIdRef.current[faqId] = existing;
          setFeedbackById((prev) => ({ ...prev, [faqId]: existing }));
          return;
        }
      } catch {
        return;
      }

      if (feedbackByIdRef.current[faqId]) return;

      const choice: FaqFeedbackChoice = helpful ? 'helpful' : 'not_helpful';
      feedbackByIdRef.current[faqId] = choice;
      setFeedbackById((prev) => ({ ...prev, [faqId]: choice }));

      try {
        const resolvedConfig = resolveSDKConfig(config);
        void trackFaqFeedback(resolvedConfig, faqId, helpful);
      } catch {
        // ignore when SDK is not configured
      }
    },
    [config, enabled],
  );

  const getFeedbackForResult = useCallback(
    (faqId: string) => feedbackById[faqId] ?? null,
    [feedbackById],
  );

  return { submitFeedback, getFeedbackForResult };
}
