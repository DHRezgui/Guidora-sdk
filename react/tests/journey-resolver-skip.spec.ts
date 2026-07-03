import type { JourneyBlueprint } from '../src/types';
import {
  __assembleBlueprintDraftForTests,
  blueprintStepSkipAllowed,
} from '../src/utils/journey-resolver';

describe('blueprint required → tour skipAllowed', () => {
  it('maps required to skipAllowed false', () => {
    expect(blueprintStepSkipAllowed({ required: true })).toBe(false);
    expect(blueprintStepSkipAllowed({ required: false })).toBe(true);
    expect(blueprintStepSkipAllowed({})).toBe(true);
  });

  it('propagates skipAllowed when assembling a blueprint draft', () => {
    const blueprint: JourneyBlueprint = {
      id: 'custom.test.required-skip',
      name: 'Required skip mapping',
      description: 'Ensures required steps hide Passer',
      vertical: 'saas',
      intent: 'discovery',
      steps: [
        {
          semanticRole: 'saas.dashboard-overview',
          title: 'Mandatory',
          description: 'Cannot skip',
          required: true,
          targetHints: { selectorHints: ['[data-tour-id="a"]'] },
        },
        {
          semanticRole: 'dashboard.chart-explore',
          title: 'Optional',
          description: 'Can skip',
          required: false,
          targetHints: { selectorHints: ['[data-tour-id="b"]'] },
        },
      ],
    };

    const draft = __assembleBlueprintDraftForTests(blueprint, [
      {
        step: blueprint.steps[0],
        origin: 'current-page',
        selector: '[data-tour-id="a"]',
        matchReason: 'test',
      },
      {
        step: blueprint.steps[1],
        origin: 'current-page',
        selector: '[data-tour-id="b"]',
        matchReason: 'test',
      },
    ], '/');

    expect(draft.steps[0].skipAllowed).toBe(false);
    expect(draft.steps[1].skipAllowed).toBe(true);
  });
});
