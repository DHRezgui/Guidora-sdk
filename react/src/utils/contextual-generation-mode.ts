import type {
  AutoDecisionReport,
  AutoDecisionShortCircuit,
  ContextualGenerationMode,
  ContextualGenerationPath,
  JourneyVertical,
  SuggestedTourDraft,
  TourDraftGenerationOptions,
} from '../types';
import { resolveAutoBlueprintVerticalScope } from './infer-journey-verticals';
import { shouldAutoApplySinglePageTour } from './infer-single-page-tour';
import { selectActiveBlueprints } from './journey-blueprints';
import { getCachedRemoteJourneyBlueprints } from './journey-blueprints-remote-client';
import {
  BlueprintResolutionOutcome,
  resolveBlueprintsToDrafts,
} from './journey-resolver';
import type { DetectedElement } from './tour-suggestion-generator';

const EMPTY_BLUEPRINT_OUTCOME: BlueprintResolutionOutcome = { drafts: [], reports: [] };

/** Auto mode: avoid blueprint path on weak partial matches (e.g. 2/5 on a pet shop). */
const DEFAULT_AUTO_BLUEPRINT_MIN_RESOLUTION_RATIO = 0.8;

export interface ContextualGenerationModePlan {
  effectiveMode: ContextualGenerationMode;
  autoDecision: AutoDecisionReport | null;
  prefetchedBlueprintOutcome: BlueprintResolutionOutcome;
  /** When true, this scan runs with `singlePageTour` profile (auto-detected). */
  applySinglePageTourForGeneration?: boolean;
}

/** Label for debug panel: what actually ran (not redundant `auto → auto`). */
export function resolveGenerationPathFromPlan(
  plan: ContextualGenerationModePlan,
  options?: TourDraftGenerationOptions,
): ContextualGenerationPath {
  const configMode = resolveEffectiveContextualMode(options);

  if (configMode === 'blueprint') {
    return 'blueprint';
  }

  if (configMode === 'heuristic') {
    return options?.singlePageTour === true ? 'single-page' : 'heuristic';
  }

  if (plan.applySinglePageTourForGeneration === true || options?.singlePageTour === true) {
    return 'single-page';
  }
  if (plan.autoDecision?.decision === 'blueprint') {
    return 'blueprint';
  }
  return 'heuristic';
}

export function resolveEffectiveContextualMode(
  options?: TourDraftGenerationOptions,
): ContextualGenerationMode {
  const explicit = options?.mode;
  if (explicit === 'blueprint' || explicit === 'heuristic' || explicit === 'auto') {
    return explicit;
  }
  if (options?.blueprintsExclusive === true) {
    return 'blueprint';
  }
  return 'auto';
}

export function resolveAutoBlueprintMinResolutionRatio(
  options?: TourDraftGenerationOptions,
): number {
  const raw = options?.autoBlueprintMinResolutionRatio;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= 1) {
    return raw;
  }
  return DEFAULT_AUTO_BLUEPRINT_MIN_RESOLUTION_RATIO;
}

export function blueprintDraftResolutionRatio(draft: SuggestedTourDraft): number | null {
  if (draft.origin?.kind !== 'blueprint') return null;
  const declared = draft.origin.declaredSteps;
  if (!declared || declared <= 0) return null;
  return draft.origin.resolvedSteps / declared;
}

export function filterAutoQualifyingBlueprintDrafts(
  outcome: BlueprintResolutionOutcome,
  options?: TourDraftGenerationOptions,
  allowedVerticals?: JourneyVertical[],
): SuggestedTourDraft[] {
  const minRatio = resolveAutoBlueprintMinResolutionRatio(options);
  const verticalAllowlist =
    allowedVerticals && allowedVerticals.length > 0 ? new Set(allowedVerticals) : null;

  return outcome.drafts.filter((draft) => {
    if (draft.origin?.kind !== 'blueprint') return false;
    if (verticalAllowlist && !verticalAllowlist.has(draft.origin.vertical)) return false;
    const ratio = blueprintDraftResolutionRatio(draft);
    return ratio !== null && ratio >= minRatio;
  });
}

function buildAutoDecisionReport(params: {
  decision: 'blueprint' | 'heuristic';
  reason: string;
  shortCircuit: AutoDecisionShortCircuit;
  outcome?: BlueprintResolutionOutcome;
  resolvedStepsPerDraft?: number[];
}): AutoDecisionReport {
  const outcome = params.outcome ?? EMPTY_BLUEPRINT_OUTCOME;
  const resolvedStepsPerDraft =
    params.resolvedStepsPerDraft ??
    outcome.drafts.map((draft) =>
      draft.origin?.kind === 'blueprint' ? draft.origin.resolvedSteps : 0,
    );
  const producedReports = outcome.reports.filter((report) => report.produced);
  return {
    decision: params.decision,
    reason: params.reason,
    shortCircuit: params.shortCircuit,
    blueprintDraftsCount: producedReports.length,
    resolvedStepsPerDraft,
  };
}

function buildAutoHeuristicFallbackPlan(
  effectiveMode: ContextualGenerationMode,
  params: {
    shortCircuit: AutoDecisionShortCircuit;
    reason: string;
    outcome?: BlueprintResolutionOutcome;
    options?: TourDraftGenerationOptions;
    candidates: DetectedElement[];
  },
): ContextualGenerationModePlan {
  if (shouldAutoApplySinglePageTour(params.options, params.candidates)) {
    return {
      effectiveMode,
      applySinglePageTourForGeneration: true,
      autoDecision: buildAutoDecisionReport({
        decision: 'heuristic',
        shortCircuit: 'auto-single-page-detected',
        reason:
          'Auto: no strong blueprint match — tabbed single-page UI detected → singlePageTour 7-slot chain (same as mode=heuristic --single-page-tour)',
        outcome: params.outcome,
      }),
      prefetchedBlueprintOutcome: params.outcome
        ? { drafts: [], reports: params.outcome.reports }
        : EMPTY_BLUEPRINT_OUTCOME,
    };
  }

  return {
    effectiveMode,
    autoDecision: buildAutoDecisionReport({
      decision: 'heuristic',
      shortCircuit: params.shortCircuit,
      reason: params.reason,
      outcome: params.outcome,
      resolvedStepsPerDraft: params.outcome?.drafts.map((draft) =>
        draft.origin?.kind === 'blueprint' ? draft.origin.resolvedSteps : 0,
      ),
    }),
    prefetchedBlueprintOutcome: params.outcome
      ? { drafts: [], reports: params.outcome.reports }
      : EMPTY_BLUEPRINT_OUTCOME,
  };
}

function formatResolvedSummary(drafts: SuggestedTourDraft[]): string {
  return drafts
    .filter((draft): draft is typeof draft & { origin: { kind: 'blueprint' } } =>
      draft.origin?.kind === 'blueprint',
    )
    .map((draft) => `${draft.origin.resolvedSteps}/${draft.origin.declaredSteps}`)
    .join(', ');
}

function selectBlueprintsForMode(
  effectiveMode: ContextualGenerationMode,
  options: TourDraftGenerationOptions | undefined,
): { activeBlueprints: ReturnType<typeof selectActiveBlueprints>; verticalScope: ReturnType<typeof resolveAutoBlueprintVerticalScope> | null } {
  if (options?.singlePageTour === true) {
    return { activeBlueprints: [], verticalScope: null };
  }

  if (effectiveMode === 'auto') {
    const verticalScope = resolveAutoBlueprintVerticalScope(
      options,
      getCachedRemoteJourneyBlueprints(),
    );
    if (verticalScope.verticals.length === 0) {
      return { activeBlueprints: [], verticalScope };
    }
    return {
      activeBlueprints: selectActiveBlueprints(verticalScope.verticals, options?.journeyBlueprints),
      verticalScope,
    };
  }

  return {
    activeBlueprints: selectActiveBlueprints(options?.journeyVerticals, options?.journeyBlueprints),
    verticalScope: null,
  };
}

/**
 * Resolution-first auto mode: decide blueprint vs heuristic path after candidates
 * are collected. Reuses `resolveBlueprintsToDrafts` (no extra DOM scan).
 */
export function planContextualGenerationMode(
  options: TourDraftGenerationOptions | undefined,
  candidates: DetectedElement[],
): ContextualGenerationModePlan {
  const effectiveMode = resolveEffectiveContextualMode(options);

  if (effectiveMode === 'heuristic') {
    return {
      effectiveMode,
      autoDecision: null,
      prefetchedBlueprintOutcome: EMPTY_BLUEPRINT_OUTCOME,
    };
  }

  const { activeBlueprints, verticalScope } = selectBlueprintsForMode(effectiveMode, options);

  if (effectiveMode === 'blueprint') {
    const outcome =
      activeBlueprints.length > 0
        ? resolveBlueprintsToDrafts(activeBlueprints, candidates, options)
        : EMPTY_BLUEPRINT_OUTCOME;
    return {
      effectiveMode,
      autoDecision: null,
      prefetchedBlueprintOutcome: outcome,
    };
  }

  // mode === 'auto'
  if (options?.singlePageTour === true) {
    return {
      effectiveMode,
      autoDecision: buildAutoDecisionReport({
        decision: 'heuristic',
        shortCircuit: 'singlePageTour',
        reason: 'singlePageTour active → blueprints ignored, generic 7-slot chain',
      }),
      prefetchedBlueprintOutcome: EMPTY_BLUEPRINT_OUTCOME,
    };
  }

  if (verticalScope?.source === 'explicit-empty') {
    return {
      effectiveMode,
      autoDecision: buildAutoDecisionReport({
        decision: 'heuristic',
        shortCircuit: 'no-blueprints',
        reason: 'journeyVerticals: [] disables blueprint generation → heuristic generic chain',
      }),
      prefetchedBlueprintOutcome: EMPTY_BLUEPRINT_OUTCOME,
    };
  }

  if (verticalScope?.source === 'none') {
    return buildAutoHeuristicFallbackPlan(effectiveMode, {
      shortCircuit: 'no-domain-vertical',
      reason:
        'Auto: no journeyVerticals and projectDomain did not infer a vertical — pack catalog skipped',
      options,
      candidates,
    });
  }

  if (activeBlueprints.length === 0) {
    const verticalLabel = verticalScope?.verticals.join(', ') ?? '';
    return buildAutoHeuristicFallbackPlan(effectiveMode, {
      shortCircuit: 'no-blueprints',
      reason: `No blueprints for vertical scope (${verticalLabel})`,
      options,
      candidates,
    });
  }

  const outcome = resolveBlueprintsToDrafts(activeBlueprints, candidates, options);
  const minRatio = resolveAutoBlueprintMinResolutionRatio(options);
  const allowedVerticals = verticalScope?.verticals;
  const qualifyingDrafts = filterAutoQualifyingBlueprintDrafts(outcome, options, allowedVerticals);
  const producedReportCount = outcome.reports.filter((report) => report.produced).length;

  if (qualifyingDrafts.length >= 1) {
    const resolvedSummary = formatResolvedSummary(qualifyingDrafts);
    const scopeNote =
      verticalScope?.source === 'inferred'
        ? `inferred verticals: ${verticalScope.verticals.join(', ')}`
        : `verticals: ${verticalScope?.verticals.join(', ') ?? ''}`;
    return {
      effectiveMode,
      autoDecision: buildAutoDecisionReport({
        decision: 'blueprint',
        shortCircuit: 'resolution-success',
        reason: `${qualifyingDrafts.length} blueprint draft(s) met auto coverage ≥${Math.round(minRatio * 100)}% (${resolvedSummary}; ${scopeNote}) → blueprint + hybrid`,
        outcome: { drafts: qualifyingDrafts, reports: outcome.reports },
        resolvedStepsPerDraft: qualifyingDrafts.map((draft) =>
          draft.origin?.kind === 'blueprint' ? draft.origin.resolvedSteps : 0,
        ),
      }),
      prefetchedBlueprintOutcome: { drafts: qualifyingDrafts, reports: outcome.reports },
    };
  }

  if (producedReportCount > 0) {
    const weakSummary = formatResolvedSummary(outcome.drafts);
    return buildAutoHeuristicFallbackPlan(effectiveMode, {
      shortCircuit: 'resolution-partial',
      reason: `${producedReportCount} in-scope blueprint(s) partially resolved (${weakSummary}) but none met auto minimum ${Math.round(minRatio * 100)}% step coverage`,
      outcome,
      options,
      candidates,
    });
  }

  return buildAutoHeuristicFallbackPlan(effectiveMode, {
    shortCircuit: 'resolution-failed',
    reason: 'In-scope blueprint resolution produced 0 qualifying drafts',
    outcome,
    options,
    candidates,
  });
}
