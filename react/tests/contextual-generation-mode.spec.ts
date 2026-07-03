import {
  applyProjectScopedBlueprintRankingBoost,
  blueprintDraftResolutionRatio,
  filterAutoQualifyingBlueprintDrafts,
  isActiveProjectScopedBlueprintDraft,
  planContextualGenerationMode,
  rankBlueprintDraftsForAuto,
  resolveEffectiveContextualMode,
  selectBlueprintDraftsForAutoHybrid,
} from '../src/utils/contextual-generation-mode';
import {
  inferJourneyVerticalsFromText,
  resolveAutoBlueprintVerticalScope,
} from '../src/utils/infer-journey-verticals';
import type { SuggestedTourDraft, TourDraftGenerationOptions } from '../src/types';
import type { BlueprintResolutionOutcome } from '../src/utils/journey-resolver';

function blueprintDraft(resolved: number, declared: number): SuggestedTourDraft {
  return {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    name: 'mock',
    description: 'mock',
    targetUrl: '/',
    isActive: false,
    priority: 1,
    steps: [],
    intent: 'primary-action',
    score: 80,
    confidence: 80,
    reasons: [],
    detectedSelectors: [],
    origin: {
      kind: 'blueprint',
      blueprintId: 'mock',
      vertical: 'fintech',
      resolvedSteps: resolved,
      declaredSteps: declared,
    },
  };
}

function namedBlueprintDraft(partial: {
  name: string;
  blueprintId: string;
  score: number;
  confidence: number;
  priority: number;
  resolved: number;
  declared: number;
  catalogSource?: 'builtin' | 'pack' | 'remote-project';
  projectKey?: string;
}): SuggestedTourDraft {
  return {
    ...blueprintDraft(partial.resolved, partial.declared),
    name: partial.name,
    score: partial.score,
    confidence: partial.confidence,
    priority: partial.priority,
    origin: {
      kind: 'blueprint',
      blueprintId: partial.blueprintId,
      vertical: 'productivity',
      resolvedSteps: partial.resolved,
      declaredSteps: partial.declared,
      catalogSource: partial.catalogSource,
      projectKey: partial.projectKey,
    },
  };
}

describe('contextual-generation-mode', () => {
  it('defaults to auto when mode is omitted', () => {
    expect(resolveEffectiveContextualMode({})).toBe('auto');
  });

  it('maps blueprintsExclusive to blueprint when mode omitted', () => {
    expect(resolveEffectiveContextualMode({ blueprintsExclusive: true })).toBe('blueprint');
  });

  it('short-circuits auto to heuristic for singlePageTour', () => {
    const plan = planContextualGenerationMode(
      { mode: 'auto', singlePageTour: true } as TourDraftGenerationOptions,
      [],
    );
    expect(plan.autoDecision?.decision).toBe('heuristic');
    expect(plan.autoDecision?.shortCircuit).toBe('singlePageTour');
    expect(plan.prefetchedBlueprintOutcome.drafts).toHaveLength(0);
  });

  it('auto-detects singlePageTour on tabbed shallow UI when no domain vertical (test-10)', () => {
    const tabCandidates = [
      {
        element: document.createElement('button'),
        selector: 'button[role="tab"]',
        selectorCandidates: [],
        label: 'Dashboard',
        score: 80,
        rankingBoost: 0,
        confidence: 80,
        intent: 'support-navigation' as const,
        reasons: [],
        tokenHits: 1,
        zone: 'header' as const,
        semanticScore: 0,
        personaScore: 0,
        sequenceScore: 0,
        selectorStabilityScore: 70,
        selectorStabilityBonus: 0,
        selectorFragilityPenalty: 0,
        actionabilityPenalty: 0,
      },
      {
        element: document.createElement('button'),
        selector: 'button[role="tab"]',
        selectorCandidates: [],
        label: 'Deals',
        score: 75,
        rankingBoost: 0,
        confidence: 75,
        intent: 'support-navigation' as const,
        reasons: [],
        tokenHits: 1,
        zone: 'header' as const,
        semanticScore: 0,
        personaScore: 0,
        sequenceScore: 0,
        selectorStabilityScore: 70,
        selectorStabilityBonus: 0,
        selectorFragilityPenalty: 0,
        actionabilityPenalty: 0,
      },
      {
        element: document.createElement('button'),
        selector: 'button.btn-primary',
        selectorCandidates: [],
        label: 'Add New Deal',
        score: 90,
        rankingBoost: 0,
        confidence: 90,
        intent: 'primary-action' as const,
        reasons: [],
        tokenHits: 2,
        zone: 'main' as const,
        semanticScore: 0,
        personaScore: 0,
        sequenceScore: 0,
        selectorStabilityScore: 80,
        selectorStabilityBonus: 0,
        selectorFragilityPenalty: 0,
        actionabilityPenalty: 0,
      },
    ] as import('../src/utils/tour-suggestion-generator').DetectedElement[];

    document.body.innerHTML =
      '<div role="tablist"><button role="tab">Dashboard</button><button role="tab">Deals</button></div>';

    const plan = planContextualGenerationMode(
      {
        mode: 'auto',
        projectDomain: 'test-10 web application',
        journeyBlueprints: [{ id: 'x', vertical: 'productivity' } as never],
      },
      tabCandidates,
    );
    expect(plan.autoDecision?.decision).toBe('heuristic');
    expect(plan.autoDecision?.shortCircuit).toBe('auto-single-page-detected');
    expect(plan.applySinglePageTourForGeneration).toBe(true);
  });

  it('infers saas from sales crm projectDomain', () => {
    expect(inferJourneyVerticalsFromText('Sales CRM pipeline deals')).toContain('saas');
    expect(resolveAutoBlueprintVerticalScope({ projectDomain: 'Sales CRM' }).verticals).toContain(
      'saas',
    );
  });

  it('activates verticals from published remote blueprints when domain is unknown', () => {
    const scope = resolveAutoBlueprintVerticalScope(
      { projectDomain: 'test-9 web application' },
      [{ vertical: 'ecommerce' } as never],
    );
    expect(scope.source).toBe('published-remote');
    expect(scope.verticals).toEqual(['ecommerce']);
  });

  it('infers ecommerce from pos/chili projectDomain', () => {
    expect(inferJourneyVerticalsFromText('CHILI POS restaurant checkout')).toContain('ecommerce');
  });

  it('short-circuits auto to heuristic when journeyVerticals is empty', () => {
    const plan = planContextualGenerationMode({ mode: 'auto', journeyVerticals: [] }, []);
    expect(plan.autoDecision?.decision).toBe('heuristic');
    expect(plan.autoDecision?.shortCircuit).toBe('no-blueprints');
  });

  it('rejects partial blueprint coverage for auto path (pet-shop false positives)', () => {
    const outcome: BlueprintResolutionOutcome = {
      drafts: [blueprintDraft(2, 5), blueprintDraft(3, 5)],
      reports: [
        { blueprintId: 'a', vertical: 'fintech', declaredSteps: 5, produced: true } as never,
        { blueprintId: 'b', vertical: 'productivity', declaredSteps: 5, produced: true } as never,
      ],
    };
    expect(filterAutoQualifyingBlueprintDrafts(outcome, { mode: 'auto' })).toHaveLength(0);
    expect(blueprintDraftResolutionRatio(blueprintDraft(5, 5))).toBe(1);
  });

  it('accepts strong blueprint coverage for auto path', () => {
    const outcome: BlueprintResolutionOutcome = {
      drafts: [blueprintDraft(5, 5)],
      reports: [{ blueprintId: 'health', vertical: 'healthtech', declaredSteps: 5, produced: true } as never],
    };
    expect(filterAutoQualifyingBlueprintDrafts(outcome, { mode: 'auto' })).toHaveLength(1);
  });

  it('skips blueprint resolution in explicit heuristic mode', () => {
    const plan = planContextualGenerationMode(
      { mode: 'heuristic', journeyBlueprints: [{ id: 'x' } as never] },
      [],
    );
    expect(plan.effectiveMode).toBe('heuristic');
    expect(plan.autoDecision).toBeNull();
    expect(plan.prefetchedBlueprintOutcome.reports).toHaveLength(0);
  });

  it('caps auto hybrid to one blueprint draft when maxDrafts is 2', () => {
    const drafts = [
      namedBlueprintDraft({
        name: 'Workspace onboarding',
        blueprintId: 'productivity.workspace-onboarding',
        score: 86,
        confidence: 100,
        priority: 10,
        resolved: 4,
        declared: 4,
      }),
      namedBlueprintDraft({
        name: 'Task management',
        blueprintId: 'productivity.task-management',
        score: 80,
        confidence: 100,
        priority: 8,
        resolved: 3,
        declared: 3,
      }),
    ];

    const selected = selectBlueprintDraftsForAutoHybrid(drafts, { mode: 'auto', maxDrafts: 2 });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.origin?.kind === 'blueprint' && selected[0].origin.blueprintId).toBe(
      'productivity.workspace-onboarding',
    );
  });

  it('prefers fuller workspace-style blueprints when scores tie in auto ranking', () => {
    const ranked = rankBlueprintDraftsForAuto([
      namedBlueprintDraft({
        name: 'Task management',
        blueprintId: 'productivity.task-management',
        score: 100,
        confidence: 100,
        priority: 8,
        resolved: 3,
        declared: 3,
      }),
      namedBlueprintDraft({
        name: 'Workspace onboarding',
        blueprintId: 'productivity.workspace-onboarding',
        score: 100,
        confidence: 100,
        priority: 10,
        resolved: 4,
        declared: 4,
      }),
    ]);

    expect(
      ranked[0]?.origin?.kind === 'blueprint' ? ranked[0].origin.blueprintId : null,
    ).toBe('productivity.workspace-onboarding');
  });

  it('prefers project-scoped remote blueprints over built-ins at equal score', () => {
    const builtin = namedBlueprintDraft({
      name: 'Creation premiere ressource',
      blueprintId: 'saas.first-resource-creation',
      score: 100,
      confidence: 100,
      priority: 10,
      resolved: 3,
      declared: 3,
      catalogSource: 'builtin',
    });
    const projectRemote = namedBlueprintDraft({
      name: 'Portfolio Pulse',
      blueprintId: 'custom.test13.portfolio-pulse',
      score: 100,
      confidence: 100,
      priority: 8,
      resolved: 3,
      declared: 3,
      catalogSource: 'remote-project',
      projectKey: 'test-13-v1',
    });

    const ranked = rankBlueprintDraftsForAuto([builtin, projectRemote], {
      flowVersion: 'test-13-v1',
    });

    expect(
      ranked[0]?.origin?.kind === 'blueprint' ? ranked[0].origin.blueprintId : null,
    ).toBe('custom.test13.portfolio-pulse');
    expect(isActiveProjectScopedBlueprintDraft(projectRemote, { flowVersion: 'test-13-v1' })).toBe(
      true,
    );
    expect(isActiveProjectScopedBlueprintDraft(builtin, { flowVersion: 'test-13-v1' })).toBe(false);
  });

  it('selects project remote blueprint in auto hybrid cap over built-in', () => {
    const selected = selectBlueprintDraftsForAutoHybrid(
      [
        namedBlueprintDraft({
          name: 'Built-in',
          blueprintId: 'saas.first-resource-creation',
          score: 100,
          confidence: 100,
          priority: 10,
          resolved: 3,
          declared: 3,
          catalogSource: 'builtin',
        }),
        namedBlueprintDraft({
          name: 'Portfolio Pulse',
          blueprintId: 'custom.test13.portfolio-pulse',
          score: 98,
          confidence: 100,
          priority: 8,
          resolved: 3,
          declared: 3,
          catalogSource: 'remote-project',
          projectKey: 'test-13-v1',
        }),
      ],
      { mode: 'auto', maxDrafts: 2, flowVersion: 'test-13-v1' },
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]?.origin?.kind === 'blueprint' && selected[0].origin.blueprintId).toBe(
      'custom.test13.portfolio-pulse',
    );
  });

  it('applies score boost to project remote drafts below the cap', () => {
    const draft = namedBlueprintDraft({
      name: 'Portfolio Pulse',
      blueprintId: 'custom.test13.portfolio-pulse',
      score: 90,
      confidence: 100,
      priority: 8,
      resolved: 3,
      declared: 3,
      catalogSource: 'remote-project',
      projectKey: 'test-13-v1',
    });

    applyProjectScopedBlueprintRankingBoost(draft, { flowVersion: 'test-13-v1' });
    expect(draft.score).toBe(100);
    expect(draft.reasons.some((reason) => reason.includes('project-scoped blueprint ranking boost'))).toBe(
      true,
    );
  });
});
