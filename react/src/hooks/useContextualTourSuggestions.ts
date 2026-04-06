import { useCallback, useEffect, useState } from 'react';
import { ContextualGenerationDebugReport, SuggestedTourDraft, TourDraftGenerationOptions } from '../types';
import {
  getContextualFlowRegistry,
  generateContextualTourDrafts,
  getLastContextualGenerationDebugReport,
  recordTourSuggestionFeedback,
  resetTourSuggestionFeedback,
} from '../utils/tour-suggestion-generator';

export interface UseContextualTourSuggestionsOptions extends TourDraftGenerationOptions {
  enabled?: boolean;
  autoGenerate?: boolean;
}

export interface UseContextualTourSuggestionsResult {
  drafts: SuggestedTourDraft[];
  isGenerating: boolean;
  error: string | null;
  refresh: () => SuggestedTourDraft[];
  getDebugReport: () => ContextualGenerationDebugReport | null;
  getFlowRegistry: () => Array<{ version: string; signature: string; generatedAt: string; targetUrl: string }>;
  recordFeedback: (input: { selector?: string; intent: SuggestedTourDraft['intent']; event: 'shown' | 'clicked' | 'completed' | 'skipped' }) => void;
  resetFeedback: () => void;
}

export function useContextualTourSuggestions(
  options?: UseContextualTourSuggestionsOptions,
): UseContextualTourSuggestionsResult {
  const enabled = options?.enabled ?? true;
  const autoGenerate = options?.autoGenerate ?? true;
  const [drafts, setDrafts] = useState<SuggestedTourDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): SuggestedTourDraft[] => {
    if (!enabled || typeof document === 'undefined') {
      setDrafts([]);
      return [];
    }

    setIsGenerating(true);
    setError(null);

    try {
      const next = generateContextualTourDrafts(options);
      setDrafts(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate contextual tour suggestions.';
      setError(message);
      setDrafts([]);
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [enabled, options]);

  const recordFeedback = useCallback(
    (input: { selector?: string; intent: SuggestedTourDraft['intent']; event: 'shown' | 'clicked' | 'completed' | 'skipped' }) => {
      recordTourSuggestionFeedback(input);
    },
    [],
  );

  const resetFeedback = useCallback(() => {
    resetTourSuggestionFeedback();
  }, []);

  const getDebugReport = useCallback((): ContextualGenerationDebugReport | null => {
    return getLastContextualGenerationDebugReport();
  }, []);

  const getFlowRegistry = useCallback((): Array<{ version: string; signature: string; generatedAt: string; targetUrl: string }> => {
    return getContextualFlowRegistry();
  }, []);

  useEffect(() => {
    if (!autoGenerate) return;
    refresh();
  }, [autoGenerate, refresh]);

  return {
    drafts,
    isGenerating,
    error,
    refresh,
    getDebugReport,
    getFlowRegistry,
    recordFeedback,
    resetFeedback,
  };
}
