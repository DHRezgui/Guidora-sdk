/// <reference types="jest" />

import type { SuggestedTourDraft, TourDraftGenerationOptions } from '../src/types/sdk';
import { __resolveDraftConflictsForTests } from '../src/utils/tour-suggestion-generator';

function makeDraft(partial: Partial<SuggestedTourDraft> & { name: string }): SuggestedTourDraft {
  return {
    intent: 'primary-action',
    targetUrl: '/',
    score: 50,
    confidence: 60,
    reasons: [],
    detectedSelectors: [],
    steps: [],
    ...partial,
  };
}

describe('blueprint step reservation (resolveDraftConflicts)', () => {
  const sharedSelector = '[data-tour-id="balance-card"]';

  const blueprintDraft = makeDraft({
    name: 'Blueprint banking',
    origin: {
      kind: 'blueprint',
      blueprintId: 'fintech.banking-overview',
      vertical: 'fintech',
      resolvedSteps: 2,
      declaredSteps: 2,
    },
    score: 70,
    confidence: 75,
    steps: [
      {
        title: 'Balance',
        content: 'See balance',
        targetSelector: sharedSelector,
        orderIndex: 1,
        stabilityScore: 90,
      },
      {
        title: 'Transfer',
        content: 'New transfer',
        targetSelector: '[data-tour-id="new-transfer"]',
        orderIndex: 2,
        stabilityScore: 90,
      },
    ],
  });

  const heuristicDraft = makeDraft({
    name: 'Heuristic extra',
    origin: { kind: 'heuristic' },
    score: 85,
    confidence: 90,
    steps: [
      {
        title: 'Stolen balance',
        content: 'Heuristic on same target',
        targetSelector: sharedSelector,
        orderIndex: 1,
        semanticRoleConfidence: 0.99,
        stabilityScore: 95,
      },
      {
        title: 'Portfolio',
        content: 'Other target',
        targetSelector: '[data-tour-id="portfolio"]',
        orderIndex: 2,
        stabilityScore: 80,
      },
    ],
  });

  it('reserves blueprint targets in hybrid mode (default auto)', () => {
    const { drafts, conflicts } = __resolveDraftConflictsForTests([blueprintDraft, heuristicDraft]);

    const bp = drafts.find((d) => d.name === 'Blueprint banking');
    const heu = drafts.find((d) => d.name === 'Heuristic extra');

    expect(bp?.steps).toHaveLength(2);
    expect(bp?.steps?.some((s) => s.targetSelector === sharedSelector)).toBe(true);
    expect(heu?.steps?.some((s) => s.targetSelector === sharedSelector)).toBe(false);
    expect(heu?.steps?.some((s) => s.targetSelector === '[data-tour-id="portfolio"]')).toBe(true);

    expect(conflicts.some((c) => c.reason.includes('blueprint-reserved'))).toBe(true);
  });

  it('allows heuristic to win same target when reservation is disabled', () => {
    const options: TourDraftGenerationOptions = { blueprintStepReservation: false };
    const { drafts } = __resolveDraftConflictsForTests([blueprintDraft, heuristicDraft], options);

    const bp = drafts.find((d) => d.name === 'Blueprint banking');
    const heu = drafts.find((d) => d.name === 'Heuristic extra');

    expect(heu?.steps?.some((s) => s.targetSelector === sharedSelector)).toBe(true);
    expect(bp?.steps?.some((s) => s.targetSelector === sharedSelector)).toBe(false);
  });

  it('does not apply reservation when only blueprint drafts exist', () => {
    const { drafts } = __resolveDraftConflictsForTests([blueprintDraft]);
    expect(drafts[0].steps).toHaveLength(2);
  });

  it('preserves authored step order after cross-draft conflict resolution', () => {
    const workspaceBlueprint = makeDraft({
      name: 'Workspace onboarding',
      origin: {
        kind: 'blueprint',
        blueprintId: 'productivity.workspace-onboarding',
        vertical: 'productivity',
        resolvedSteps: 4,
        declaredSteps: 4,
      },
      score: 86,
      confidence: 100,
      steps: [
        {
          title: 'Dashboard overview',
          content: 'Overview',
          targetSelector: '[data-tour-id="dashboard-stats"]',
          orderIndex: 0,
          stabilityScore: 90,
        },
        {
          title: 'Search workspace',
          content: 'Search',
          targetSelector: '[data-tour-id="search-task"]',
          orderIndex: 1,
          stabilityScore: 90,
        },
        {
          title: 'Create project',
          content: 'Create',
          targetSelector: '[data-tour-id="add-project"]',
          orderIndex: 2,
          stabilityScore: 90,
        },
        {
          title: 'Import data',
          content: 'Import',
          targetSelector: '[data-tour-id="import-data"]',
          orderIndex: 3,
          stabilityScore: 90,
        },
      ],
    });

    const heuristicDraft = makeDraft({
      name: 'Heuristic add project',
      origin: { kind: 'heuristic' },
      score: 100,
      confidence: 79,
      steps: [
        {
          title: 'Heuristic CTA',
          content: 'Competing primary action',
          targetSelector: '[data-tour-id="add-project"]',
          orderIndex: 0,
          semanticRoleConfidence: 0.99,
          stabilityScore: 22,
        },
      ],
    });

    const { drafts } = __resolveDraftConflictsForTests([heuristicDraft, workspaceBlueprint]);
    const workspace = drafts.find((draft) => draft.name === 'Workspace onboarding');

    expect(workspace?.steps.map((step) => step.title)).toEqual([
      'Dashboard overview',
      'Search workspace',
      'Create project',
      'Import data',
    ]);
    expect(workspace?.steps.map((step) => step.orderIndex)).toEqual([0, 1, 2, 3]);
  });
});
