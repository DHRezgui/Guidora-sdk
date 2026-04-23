import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ContextualGenerationDebugReport,
  PublishContextualDraft,
  PublishContextualDraftStep,
  ContextualScenario,
  PublishContextualDraftsResponse,
  SDKConfig,
  Step,
  SuggestedTourDraft,
  TourDraftGenerationOptions,
} from '../types';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
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
  autoPublish?: boolean;
  autoActivatePublishedDrafts?: boolean;
  publishScenario?: ContextualScenario;
  publishConfig?: Partial<SDKConfig>;
}

export interface UseContextualTourSuggestionsResult {
  drafts: SuggestedTourDraft[];
  isGenerating: boolean;
  isPublishing: boolean;
  error: string | null;
  publishError: string | null;
  lastPublishReport: PublishContextualDraftsResponse['report'] | null;
  refresh: () => SuggestedTourDraft[];
  publishDrafts: (draftsToPublish?: SuggestedTourDraft[]) => Promise<PublishContextualDraftsResponse['report'] | null>;
  getDebugReport: () => ContextualGenerationDebugReport | null;
  getFlowRegistry: () => Array<{ version: string; signature: string; generatedAt: string; targetUrl: string }>;
  recordFeedback: (input: { selector?: string; intent: SuggestedTourDraft['intent']; event: 'shown' | 'clicked' | 'completed' | 'skipped' }) => void;
  resetFeedback: () => void;
}

function toPublishStep(step: Step): PublishContextualDraftStep {
  const rawStep = step as Step & { isPrimary?: boolean; intent?: string };

  return {
    title: step.title,
    content: step.content,
    targetSelector: step.targetSelector,
    stepTargetUrl: step.stepTargetUrl,
    position: step.position,
    action: step.action,
    skipAllowed: step.skipAllowed,
    highlightElement: step.highlightElement,
    stepType: step.stepType,
    isPrimary: typeof rawStep.isPrimary === 'boolean' ? rawStep.isPrimary : undefined,
    intent: typeof rawStep.intent === 'string' ? rawStep.intent : undefined,
  };
}

function toPublishDraft(draft: SuggestedTourDraft): PublishContextualDraft | null {
  const flowVersion = draft.flowVersioning?.flowVersion;
  const flowSignature = draft.flowVersioning?.flowSignature;
  const rawDraft = draft as SuggestedTourDraft & {
    diagnostics?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };

  if (!flowVersion || !flowSignature) {
    return null;
  }

  return {
    name: draft.name,
    description: draft.description,
    targetUrl: draft.targetUrl,
    intent: draft.intent,
    confidence: draft.confidence,
    score: draft.score,
    steps: draft.steps.map(toPublishStep),
    flowVersioning: {
      flowVersion,
      flowSignature,
    },
    explainability: draft.explainability as unknown as Record<string, unknown> | undefined,
    diagnostics: rawDraft.diagnostics,
    metadata: rawDraft.metadata,
  };
}

function toPublishPayloadDrafts(drafts: SuggestedTourDraft[]): PublishContextualDraft[] {
  return drafts
    .map(toPublishDraft)
    .filter((draft): draft is PublishContextualDraft => draft !== null);
}

interface ResolvedFallbackPolicy {
  enabled: boolean;
  maxAttempts: number;
  retryOnRejectedReasons: string[];
  relaxedMinConfidence: number;
  relaxedMinScore: number;
  includeSupportDraft: boolean;
  includeNavigationDraft: boolean;
  includeFormDraft: boolean;
}

function resolveFallbackPolicy(options?: UseContextualTourSuggestionsOptions): ResolvedFallbackPolicy {
  const fallbackPolicy = options?.publishFallbackPolicy;

  return {
    enabled: fallbackPolicy?.enabled ?? false,
    maxAttempts: Math.max(1, fallbackPolicy?.maxAttempts ?? 2),
    retryOnRejectedReasons: fallbackPolicy?.retryOnRejectedReasons ?? ['confidence_below_threshold'],
    relaxedMinConfidence: fallbackPolicy?.relaxedMinConfidence ?? 24,
    relaxedMinScore: fallbackPolicy?.relaxedMinScore ?? 16,
    includeSupportDraft: fallbackPolicy?.includeSupportDraft ?? true,
    includeNavigationDraft: fallbackPolicy?.includeNavigationDraft ?? true,
    includeFormDraft: fallbackPolicy?.includeFormDraft ?? false,
  };
}

function buildFallbackGenerationOptions(
  options: UseContextualTourSuggestionsOptions | undefined,
  policy: ResolvedFallbackPolicy,
): UseContextualTourSuggestionsOptions {
  return {
    ...options,
    minConfidence: policy.relaxedMinConfidence,
    minScore: policy.relaxedMinScore,
    analysisSeverity: 'relaxed',
    includeSupportDraft: policy.includeSupportDraft,
    includeNavigationDraft: policy.includeNavigationDraft,
    includeFormDraft: policy.includeFormDraft,
    publishFallbackPolicy: {
      ...(options?.publishFallbackPolicy ?? {}),
      enabled: false,
    },
  };
}

function reportHasRetryableRejection(
  report: PublishContextualDraftsResponse['report'] | null,
  policy: ResolvedFallbackPolicy,
): boolean {
  if (!report || report.created > 0) {
    return false;
  }

  return report.details.some(
    (detail) => detail.outcome === 'rejected' && detail.reasons.some((reason) => policy.retryOnRejectedReasons.includes(reason)),
  );
}

export function useContextualTourSuggestions(
  options?: UseContextualTourSuggestionsOptions,
): UseContextualTourSuggestionsResult {
  const enabled = options?.enabled ?? true;
  const autoGenerate = options?.autoGenerate ?? true;
  const autoPublish = options?.autoPublish ?? false;
  const [drafts, setDrafts] = useState<SuggestedTourDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lastPublishReport, setLastPublishReport] = useState<PublishContextualDraftsResponse['report'] | null>(null);
  const fallbackPolicy = useMemo(() => resolveFallbackPolicy(options), [
    options?.publishFallbackPolicy?.enabled,
    options?.publishFallbackPolicy?.maxAttempts,
    options?.publishFallbackPolicy?.relaxedMinConfidence,
    options?.publishFallbackPolicy?.relaxedMinScore,
    options?.publishFallbackPolicy?.includeSupportDraft,
    options?.publishFallbackPolicy?.includeNavigationDraft,
    options?.publishFallbackPolicy?.includeFormDraft,
    options?.publishFallbackPolicy?.retryOnRejectedReasons?.join('|'),
  ]);

  const publishDraftsInternal = useCallback(
    async (
      draftsToPublish: SuggestedTourDraft[] | undefined,
      attemptIndex: number,
    ): Promise<PublishContextualDraftsResponse['report'] | null> => {
      const nextDrafts = draftsToPublish ?? drafts;
      if (!enabled || nextDrafts.length === 0) {
        setLastPublishReport(null);
        return null;
      }

      setPublishError(null);
      setLastPublishReport(null);

      try {
        const resolvedConfig = resolveSDKConfig(options?.publishConfig);
        const sanitizedDrafts = toPublishPayloadDrafts(nextDrafts);

        if (sanitizedDrafts.length === 0) {
          const msg = 'No publishable drafts: flowVersioning.flowVersion/flowSignature is missing.';
          console.error('[SDK] Publish error:', msg);
          console.error('[SDK] Raw drafts flowVersioning:', nextDrafts.map(d => ({ name: d.name, fv: d.flowVersioning })));
          setPublishError(msg);
          return null;
        }

        console.info('[SDK] Publishing sanitized drafts:', sanitizedDrafts);
        const defaultAutoActivate = process.env.NODE_ENV === 'production' ? false : true;
        const response = await sdkApiClient.publishContextualDrafts(resolvedConfig, {
          scenario: options?.publishScenario ?? 'medium',
          drafts: sanitizedDrafts,
          autoActivate: options?.autoActivatePublishedDrafts ?? defaultAutoActivate,
        });
        console.info('[SDK] Publish response report:', response.report);
        setLastPublishReport(response.report);

        const canRetry =
          fallbackPolicy.enabled &&
          attemptIndex < fallbackPolicy.maxAttempts &&
          reportHasRetryableRejection(response.report, fallbackPolicy);

        if (canRetry) {
          const fallbackDraftOptions = buildFallbackGenerationOptions(options, fallbackPolicy);
          const fallbackDrafts = generateContextualTourDrafts(fallbackDraftOptions);

          if (fallbackDrafts.length > 0) {
            setDrafts(fallbackDrafts);
            return publishDraftsInternal(fallbackDrafts, attemptIndex + 1);
          }
        }

        return response.report;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to publish contextual drafts.';
        setPublishError(message);
        return null;
      }
    },
    [drafts, enabled, fallbackPolicy, options?.autoActivatePublishedDrafts, options?.publishConfig, options?.publishScenario],
  );

  const publishDrafts = useCallback(
    async (draftsToPublish?: SuggestedTourDraft[]): Promise<PublishContextualDraftsResponse['report'] | null> => {
      setIsPublishing(true);
      try {
        return await publishDraftsInternal(draftsToPublish, 1);
      } finally {
        setIsPublishing(false);
      }
    },
    [publishDraftsInternal],
  );

  const refresh = useCallback((): SuggestedTourDraft[] => {
    if (!enabled || typeof document === 'undefined') {
      setDrafts([]);
      return [];
    }

    setIsGenerating(true);
    setError(null);
    setPublishError(null);
    setLastPublishReport(null);

    try {
      let next = generateContextualTourDrafts(options);

      if (next.length === 0 && fallbackPolicy.enabled && fallbackPolicy.maxAttempts > 1) {
        const fallbackDraftOptions = buildFallbackGenerationOptions(options, fallbackPolicy);
        const fallbackDrafts = generateContextualTourDrafts(fallbackDraftOptions);
        if (fallbackDrafts.length > 0) {
          next = fallbackDrafts;
        }
      }

      setDrafts(next);
      if (autoPublish && next.length > 0) {
        void publishDrafts(next);
      } else {
        setLastPublishReport(null);
      }
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate contextual tour suggestions.';
      setError(message);
      setDrafts([]);
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [autoPublish, enabled, fallbackPolicy, options, publishDrafts]);

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
    isPublishing,
    error,
    publishError,
    lastPublishReport,
    refresh,
    publishDrafts,
    getDebugReport,
    getFlowRegistry,
    recordFeedback,
    resetFeedback,
  };
}
