import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  clearRemoteContextualFeedback,
  getContextualFlowRegistry,
  generateContextualTourDrafts,
  generateContextualTourDraftsAsync,
  getLastContextualGenerationDebugReport,
  getLocalFeedbackForSelector,
  recordTourSuggestionFeedback,
  resetTourSuggestionFeedback,
  setRemoteContextualFeedback,
} from '../utils/tour-suggestion-generator';
import {
  setContextualFeedbackConfig,
  flushFeedbackQueue,
  enqueueContextualFeedback,
} from '../utils/contextual-feedback-flusher';
import {
  computeDraftDedupeSignature,
  readAutoPublishedSignatures,
  recordAutoPublishedSignaturesFromReport,
} from '../utils/auto-publish-session-dedupe';

export interface UseContextualTourSuggestionsOptions extends TourDraftGenerationOptions {
  enabled?: boolean;
  autoGenerate?: boolean;
  autoPublish?: boolean;
  /**
   * Whether published drafts should be activated automatically on the dashboard.
   * Defaults to false: tours are created as inactive, the developer decides
   * which ones to activate via the dashboard.
   */
  autoActivatePublishedDrafts?: boolean;
  /**
   * Max number of tours auto-published per browser session (per origin).
   * Prevents flooding the dashboard with duplicate or near-duplicate tours.
   * Defaults to 3.
   */
  maxAutoPublishedTours?: number;
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
  /** Runs synchronously for local-only mode; returns a Promise in hybrid/backend semantic mode. */
  refresh: () => SuggestedTourDraft[] | Promise<SuggestedTourDraft[]>;
  /** Bumps after each generation completes so consumers can re-read `getDebugReport()`. */
  debugReportTick: number;
  publishDrafts: (draftsToPublish?: SuggestedTourDraft[]) => Promise<PublishContextualDraftsResponse['report'] | null>;
  getDebugReport: () => ContextualGenerationDebugReport | null;
  getFlowRegistry: () => Array<{ version: string; signature: string; generatedAt: string; targetUrl: string }>;
  recordFeedback: (input: { selector?: string; intent: SuggestedTourDraft['intent']; event: 'shown' | 'clicked' | 'completed' | 'skipped'; blueprintId?: string }) => void;
  resetFeedback: () => void;
  /**
   * Returns the local (per-browser) feedback counters for a given selector.
   * Useful for debug UI that wants to display live counters per draft.
   * Bumps on every recordFeedback / resetFeedback call via `feedbackVersion`.
   */
  getLocalFeedback: (
    selector: string | undefined,
  ) => { shown: number; clicked: number; completed: number; skipped: number } | null;
  /**
   * Monotonically increasing counter that bumps whenever local feedback is
   * recorded or reset. Consumers can include it in dependency arrays / re-read
   * counters to force a re-render after each click.
   */
  feedbackVersion: number;
}

function toPublishStep(step: Step): PublishContextualDraftStep {
  const rawStep = step as Step & { isPrimary?: boolean; intent?: string };

  return {
    title: step.title,
    content: step.content,
    targetSelector: step.targetSelector,
    selectorAlternatives: Array.isArray(step.selectorAlternatives) ? step.selectorAlternatives : undefined,
    targetFingerprint: step.targetFingerprint,
    stabilityScore: typeof step.stabilityScore === 'number' ? step.stabilityScore : undefined,
    selfHealCount: typeof step.selfHealCount === 'number' ? step.selfHealCount : undefined,
    semanticRoleConfidence:
      typeof step.semanticRoleConfidence === 'number' ? step.semanticRoleConfidence : undefined,
    stepTargetUrl: step.stepTargetUrl,
    position: step.position,
    action: step.action,
    skipAllowed: step.skipAllowed,
    highlightElement: true,
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
  const maxAutoPublishedTours = Math.max(0, options?.maxAutoPublishedTours ?? 3);
  const [drafts, setDrafts] = useState<SuggestedTourDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lastPublishReport, setLastPublishReport] = useState<PublishContextualDraftsResponse['report'] | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const autoPublishInFlightRef = useRef(false);
  const autoGenerateHasRunRef = useRef(false);

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

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const publishDraftsInternal = useCallback(
    async (
      draftsToPublish: SuggestedTourDraft[] | undefined,
      attemptIndex: number,
    ): Promise<PublishContextualDraftsResponse['report'] | null> => {
      const currentOptions = optionsRef.current;
      const nextDrafts = draftsToPublish ?? draftsRef.current;
      if (!enabled || nextDrafts.length === 0) {
        setLastPublishReport(null);
        return null;
      }

      setPublishError(null);
      setLastPublishReport(null);

      try {
        const resolvedConfig = resolveSDKConfig(currentOptions?.publishConfig);
        const sanitizedDrafts = toPublishPayloadDrafts(nextDrafts);

        if (sanitizedDrafts.length === 0) {
          const msg = 'No publishable drafts: flowVersioning.flowVersion/flowSignature is missing.';
          console.error('[SDK] Publish error:', msg);
          console.error('[SDK] Raw drafts flowVersioning:', nextDrafts.map(d => ({ name: d.name, fv: d.flowVersioning })));
          setPublishError(msg);
          return null;
        }

        console.info('[SDK] Publishing sanitized drafts:', sanitizedDrafts);
        // Default to false so newly-generated tours are inactive on the dashboard.
        // The developer decides which ones to activate from the dashboard UI.
        const response = await sdkApiClient.publishContextualDrafts(resolvedConfig, {
          scenario: currentOptions?.publishScenario ?? 'medium',
          drafts: sanitizedDrafts,
          autoActivate: currentOptions?.autoActivatePublishedDrafts ?? false,
        });
        console.info('[SDK] Publish response report:', response.report);
        setLastPublishReport(response.report);

        const canRetry =
          fallbackPolicy.enabled &&
          attemptIndex < fallbackPolicy.maxAttempts &&
          reportHasRetryableRejection(response.report, fallbackPolicy);

        if (canRetry) {
          const fallbackDraftOptions = buildFallbackGenerationOptions(currentOptions, fallbackPolicy);
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
    [enabled, fallbackPolicy],
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

  const selectAutoPublishCandidates = useCallback(
    (allDrafts: SuggestedTourDraft[]): SuggestedTourDraft[] => {
      if (allDrafts.length === 0) return [];
      const alreadyPublished = readAutoPublishedSignatures();
      const remainingCapacity = Math.max(0, maxAutoPublishedTours - alreadyPublished.size);
      if (remainingCapacity === 0) return [];

      const seenInBatch = new Set<string>();
      const candidates: SuggestedTourDraft[] = [];

      for (const draft of allDrafts) {
        const signature = computeDraftDedupeSignature(draft);
        if (alreadyPublished.has(signature) || seenInBatch.has(signature)) continue;
        seenInBatch.add(signature);
        candidates.push(draft);
        if (candidates.length >= remainingCapacity) break;
      }

      return candidates;
    },
    [maxAutoPublishedTours],
  );

  const runAutoPublish = useCallback(
    async (allDrafts: SuggestedTourDraft[]): Promise<void> => {
      if (autoPublishInFlightRef.current) return;
      const candidates = selectAutoPublishCandidates(allDrafts);
      if (candidates.length === 0) {
        console.info(
          '[SDK] Auto-publish skipped: nothing new to publish (deduped or session cap reached).',
        );
        setLastPublishReport({
          processed: 0,
          created: 0,
          activated: 0,
          rejected: 0,
          skipped: allDrafts.length,
          details: allDrafts.map((draft) => ({
            draftName: draft.name,
            outcome: 'skipped' as const,
            reasons: ['auto_publish_session_dedup_or_cap'],
          })),
        });
        return;
      }

      autoPublishInFlightRef.current = true;
      try {
        const report = await publishDrafts(candidates);
        if (report && report.created > 0) {
          recordAutoPublishedSignaturesFromReport(report, candidates);
        }
      } finally {
        autoPublishInFlightRef.current = false;
      }
    },
    [publishDrafts, selectAutoPublishCandidates],
  );

  const [debugReportTick, setDebugReportTick] = useState(0);
  const bumpDebugReport = useCallback(() => {
    setDebugReportTick((tick) => tick + 1);
  }, []);

  const refresh = useCallback(async (): Promise<SuggestedTourDraft[]> => {
    const currentOptions = optionsRef.current;
    if (!enabled || typeof document === 'undefined') {
      setDrafts([]);
      bumpDebugReport();
      return [];
    }

    setIsGenerating(true);
    setError(null);
    setPublishError(null);
    setLastPublishReport(null);

    try {
      const semanticMode = currentOptions?.semanticEngineMode ?? 'hybrid';
      const useHybridAsync =
        currentOptions?.semanticEnhancementEnabled === true &&
        (semanticMode === 'hybrid' || semanticMode === 'backend') &&
        Boolean(currentOptions?.semanticBackendUrl);

      // Hybrid/backend: one async pass (DOM settle wait + backend hints + generation).
      // Avoid sync-first, which left the lab on a debug report without semanticEnhancement
      // until a second "Analyser" click.
      let next = useHybridAsync
        ? await generateContextualTourDraftsAsync(currentOptions)
        : generateContextualTourDrafts(currentOptions);

      if (next.length === 0 && fallbackPolicy.enabled && fallbackPolicy.maxAttempts > 1) {
        const fallbackDraftOptions = buildFallbackGenerationOptions(currentOptions, fallbackPolicy);
        const fallbackDrafts = useHybridAsync
          ? await generateContextualTourDraftsAsync(fallbackDraftOptions)
          : generateContextualTourDrafts(fallbackDraftOptions);
        if (fallbackDrafts.length > 0) {
          next = fallbackDrafts;
        }
      }

      setDrafts(next);
      bumpDebugReport();
      if (autoPublish && next.length > 0) {
        void runAutoPublish(next);
      } else {
        setLastPublishReport(null);
      }
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate contextual tour suggestions.';
      setError(message);
      setDrafts([]);
      bumpDebugReport();
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [autoPublish, bumpDebugReport, enabled, fallbackPolicy, runAutoPublish]);

  const [feedbackVersion, setFeedbackVersion] = useState(0);

  const recordFeedback = useCallback(
    (input: { selector?: string; intent: SuggestedTourDraft['intent']; event: 'shown' | 'clicked' | 'completed' | 'skipped'; blueprintId?: string }) => {
      // Local store: always update (this powers the inline live counters and
      // feeds the per-blueprint aggregate when `blueprintId` is provided).
      recordTourSuggestionFeedback(input);
      // Backend queue: only enqueue when feedback was explicitly opted-in by
      // the host, to keep manual debug-panel clicks aligned with the runtime
      // double-write done by TourViewer. Skipped silently otherwise.
      if (optionsRef.current?.feedbackEnabled === true) {
        enqueueContextualFeedback({
          selector: input.selector,
          intent: input.intent,
          event: input.event,
        });
      }
      setFeedbackVersion((v) => v + 1);
    },
    [],
  );

  const resetFeedback = useCallback(() => {
    resetTourSuggestionFeedback();
    clearRemoteContextualFeedback();
    setFeedbackVersion((v) => v + 1);
  }, []);

  const getLocalFeedback = useCallback(
    (selector: string | undefined) => {
      // Read `feedbackVersion` here so React re-evaluates after each bump,
      // even though we don't otherwise use it in the body.
      void feedbackVersion;
      return getLocalFeedbackForSelector(selector);
    },
    [feedbackVersion],
  );

  const getDebugReport = useCallback((): ContextualGenerationDebugReport | null => {
    return getLastContextualGenerationDebugReport();
  }, [debugReportTick]);

  const getFlowRegistry = useCallback((): Array<{ version: string; signature: string; generatedAt: string; targetUrl: string }> => {
    return getContextualFlowRegistry();
  }, []);

  // Stability fix D: tracks whether the remote feedback aggregates bootstrap
  // has settled (success OR failure). The first auto-generation waits for
  // this to avoid the "cold start" race where scan #1 uses 100% local
  // feedback and scan #2 uses 70% remote / 30% local, producing different
  // drafts on identical DOMs. Resets to false whenever `feedbackEnabled`
  // flips back off.
  const [remoteFeedbackReady, setRemoteFeedbackReady] = useState(false);

  useEffect(() => {
    if (!autoGenerate) return;
    if (autoGenerateHasRunRef.current) return;
    // Stability fix D: when feedback is opted-in, gate the very first scan
    // on remoteFeedbackReady. Subsequent calls go through `refresh()`
    // directly, untouched by this gate.
    if (options?.feedbackEnabled === true && !remoteFeedbackReady) return;
    autoGenerateHasRunRef.current = true;
    void refresh();
  }, [autoGenerate, refresh, options?.feedbackEnabled, remoteFeedbackReady]);

  // Backend feedback sync (Phase 2): only when feedback explicitly opted-in.
  // Effect re-runs ONLY when the boolean opt-in flag toggles. publishConfig is
  // read via optionsRef on each invocation to avoid the "object reference
  // changes every render" feedback loop that would otherwise spam
  // `GET /aggregates` on every parent re-render.
  const remoteFeedbackBootstrappedRef = useRef(false);
  useEffect(() => {
    if (options?.feedbackEnabled !== true) {
      setContextualFeedbackConfig(null);
      clearRemoteContextualFeedback();
      remoteFeedbackBootstrappedRef.current = false;
      setRemoteFeedbackReady(false);
      return;
    }

    if (remoteFeedbackBootstrappedRef.current) return;
    remoteFeedbackBootstrappedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const resolvedConfig = resolveSDKConfig(optionsRef.current?.publishConfig);
        setContextualFeedbackConfig(resolvedConfig);
        const response = await sdkApiClient.getContextualFeedbackAggregates(resolvedConfig);
        if (cancelled) return;
        setRemoteContextualFeedback(response.aggregates ?? []);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[TrustDev SDK] Failed to fetch contextual feedback aggregates', err);
        }
      } finally {
        // Stability fix D: mark ready *whether the fetch succeeded or not*.
        // A backend outage shouldn't permanently block draft generation; we
        // just fall back to local-only feedback (or zero feedback) in a
        // deterministic way.
        if (!cancelled) setRemoteFeedbackReady(true);
      }
    })();

    const flushInterval = setInterval(() => {
      void flushFeedbackQueue();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(flushInterval);
      void flushFeedbackQueue();
    };
  }, [options?.feedbackEnabled]);

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
    debugReportTick,
    getFlowRegistry,
    recordFeedback,
    resetFeedback,
    getLocalFeedback,
    feedbackVersion,
  };
}
