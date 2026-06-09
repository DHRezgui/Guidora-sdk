import {
  blueprintDraftResolutionRatio,
  filterAutoQualifyingBlueprintDrafts,
  planContextualGenerationMode,
  resolveEffectiveContextualMode,
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
});
