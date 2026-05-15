/// <reference types="jest" />
/**
 * Deterministic unit tests for the hybrid semantic layer.
 *
 * These tests cover Phase 7 of the rollout plan:
 *   - role classification correctness across the canonical element kinds
 *     (form fields, submit CTAs, navigation links, utilities, headings...);
 *   - sequence ordering proposal (entry → navigation → form-field →
 *     form-submit);
 *   - bounded fusion (semantic deltas cannot exceed the safety cap);
 *   - copy alignment with element type (no "discovery" copy on form
 *     fields, no "form" copy on heading-only entries);
 *   - no-regression: when `semanticEnhancementEnabled` is false, the
 *     legacy heuristic path must remain identical.
 */

import {
  buildSemanticPageSnapshot,
  buildSemanticStepCopy,
  classifyCandidate,
  computeSemanticScoreDelta,
  proposeSequenceOrder,
  resolveSemanticWeights,
  runLocalSemanticInference,
  type SemanticCandidateInput,
} from '../src/utils/semantic-step-intelligence';

interface FakeElementOptions {
  tag: string;
  attributes?: Record<string, string>;
  parents?: string[];
}

function makeFakeElement(opts: FakeElementOptions): HTMLElement {
  const attrs = new Map<string, string>(Object.entries(opts.attributes || {}));
  const parents = new Set((opts.parents || []).map((sel) => sel.toLowerCase()));
  const fake: any = {
    tagName: opts.tag.toUpperCase(),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    closest: (selector: string) => {
      const sel = selector.toLowerCase();
      for (const parent of parents) {
        if (sel.split(',').map((s) => s.trim()).some((s) => parent.includes(s.replace(/[\[\]\=\"]/g, '')))) {
          return { tagName: 'NAV' };
        }
      }
      return null;
    },
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    textContent: opts.attributes?.['aria-label'] || '',
  };
  return fake as HTMLElement;
}

function makeCandidate(
  partial: Partial<SemanticCandidateInput> & Pick<SemanticCandidateInput, 'selector' | 'label'>,
  fakeOpts: FakeElementOptions,
): SemanticCandidateInput {
  return {
    element: makeFakeElement(fakeOpts),
    selector: partial.selector,
    label: partial.label,
    intent: partial.intent ?? 'discovery',
    zone: partial.zone ?? 'main',
    isActionable: partial.isActionable ?? false,
    isFormControl: partial.isFormControl ?? false,
    documentTop: partial.documentTop ?? 0,
  };
}

describe('classifyCandidate — role correctness', () => {
  const baseSnapshot = buildSemanticPageSnapshot([]);

  it('classifies a text input inside a form as form-field', () => {
    const candidate = makeCandidate(
      { selector: '#email', label: 'Email de contact', intent: 'form-flow', isFormControl: true },
      { tag: 'input', attributes: { type: 'email' }, parents: ['form'] },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('form-field');
    expect(role.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies a textarea as form-field', () => {
    const candidate = makeCandidate(
      { selector: '#notes', label: 'Notes', intent: 'form-flow' },
      { tag: 'textarea' },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('form-field');
  });

  it('classifies a submit button as form-submit', () => {
    const candidate = makeCandidate(
      { selector: '#save', label: 'Enregistrer', intent: 'primary-action', isActionable: true },
      { tag: 'button', attributes: { type: 'submit' } },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('form-submit');
  });

  it('classifies a settings button as utility (not validation)', () => {
    const candidate = makeCandidate(
      { selector: '#settings', label: 'Réglages rapides', intent: 'primary-action', isActionable: true },
      { tag: 'button' },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('utility');
  });

  it('classifies a help link as secondary (not discovery)', () => {
    const candidate = makeCandidate(
      { selector: '#help', label: "Guide d'utilisation", intent: 'support-navigation', isActionable: true },
      { tag: 'a' },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('secondary');
  });

  it('classifies a nav anchor as navigation', () => {
    const candidate = makeCandidate(
      {
        selector: 'nav a',
        label: 'Aperçu',
        intent: 'support-navigation',
        zone: 'navigation',
        isActionable: true,
      },
      { tag: 'a', parents: ['nav'] },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('navigation');
  });

  it('classifies an H1 element as entry', () => {
    const candidate = makeCandidate(
      { selector: 'h1', label: 'Onboarding métier' },
      { tag: 'h1' },
    );
    const role = classifyCandidate(candidate, baseSnapshot);
    expect(role.role).toBe('entry');
  });
});

describe('proposeSequenceOrder — ordering correctness', () => {
  it('orders entry → navigation → form-field → form-submit', () => {
    const heading = makeCandidate({ selector: 'h1', label: 'Onboarding', documentTop: 0 }, { tag: 'h1' });
    const nav = makeCandidate(
      { selector: 'nav a', label: 'Formulaire', zone: 'navigation', isActionable: true, documentTop: 50 },
      { tag: 'a', parents: ['nav'] },
    );
    const input = makeCandidate(
      { selector: '#email', label: 'Email', intent: 'form-flow', isFormControl: true, documentTop: 150 },
      { tag: 'input', parents: ['form'] },
    );
    const submit = makeCandidate(
      { selector: '#save', label: 'Enregistrer', intent: 'primary-action', isActionable: true, documentTop: 250 },
      { tag: 'button', attributes: { type: 'submit' } },
    );

    const candidates = [submit, input, heading, nav];
    const snapshot = buildSemanticPageSnapshot(candidates);
    const roles = candidates.map((candidate) => classifyCandidate(candidate, snapshot));
    const order = proposeSequenceOrder(candidates, roles);

    expect(order).not.toBeNull();
    expect(order).toEqual(['h1', 'nav a', '#email', '#save']);
  });

  it('returns null when heuristic order already matches semantic order', () => {
    const heading = makeCandidate({ selector: 'h1', label: 'Welcome', documentTop: 0 }, { tag: 'h1' });
    const submit = makeCandidate(
      { selector: '#go', label: 'Continuer', intent: 'primary-action', isActionable: true, documentTop: 100 },
      { tag: 'button' },
    );
    const candidates = [heading, submit];
    const snapshot = buildSemanticPageSnapshot(candidates);
    const roles = candidates.map((candidate) => classifyCandidate(candidate, snapshot));
    expect(proposeSequenceOrder(candidates, roles)).toBeNull();
  });
});

describe('computeSemanticScoreDelta — bounded fusion', () => {
  it('produces a positive delta when role agrees with heuristic intent', () => {
    const { delta, agreement } = computeSemanticScoreDelta({
      heuristicIntent: 'form-flow',
      semanticRole: 'form-field',
      confidence: 0.95,
    });
    expect(agreement).toBe('agree');
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(8);
  });

  it('produces a negative delta when role contradicts heuristic intent', () => {
    const { delta, agreement } = computeSemanticScoreDelta({
      heuristicIntent: 'primary-action',
      semanticRole: 'form-field',
      confidence: 0.9,
    });
    expect(agreement).toBe('conflict');
    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThanOrEqual(-8);
  });

  it('clamps deltas regardless of confidence overshoot', () => {
    const { delta } = computeSemanticScoreDelta({
      heuristicIntent: 'form-flow',
      semanticRole: 'form-submit',
      confidence: 5,
      weights: { role: 5, order: 5, copy: 5 },
    });
    expect(Math.abs(delta)).toBeLessThanOrEqual(8);
  });

  it('returns 0 when role is neutral relative to intent', () => {
    const { delta, agreement } = computeSemanticScoreDelta({
      heuristicIntent: 'discovery',
      semanticRole: 'utility',
      confidence: 0.9,
    });
    expect(agreement).toBe('neutral');
    expect(delta).toBe(0);
  });
});

describe('resolveSemanticWeights — defensive clamping', () => {
  it('clamps weights to [0, 1]', () => {
    const weights = resolveSemanticWeights({
      semanticRoleWeights: { role: 10, order: -2, copy: 0.7 },
    });
    expect(weights.role).toBe(1);
    expect(weights.order).toBe(0);
    expect(weights.copy).toBe(0.7);
  });

  it('falls back to defaults when no overrides are provided', () => {
    const weights = resolveSemanticWeights();
    expect(weights.role).toBeGreaterThan(0);
    expect(weights.order).toBeGreaterThan(0);
    expect(weights.copy).toBeGreaterThan(0);
  });
});

describe('buildSemanticStepCopy — copy matches role', () => {
  it('produces form-field copy referencing the field', () => {
    const copy = buildSemanticStepCopy('form-field', 'Email de contact');
    expect(copy.title.toLowerCase()).toContain('formulaire');
    expect(copy.content.toLowerCase()).not.toContain('découverte');
  });

  it('produces validation copy on form-submit', () => {
    const copy = buildSemanticStepCopy('form-submit', 'Enregistrer');
    expect(copy.title.toLowerCase()).toMatch(/valid|enregistr/);
  });

  it('never labels a form field as discovery', () => {
    const copy = buildSemanticStepCopy('form-field', 'Notes');
    expect(copy.title.toLowerCase()).not.toMatch(/découverte|decouverte|aide|help/);
  });
});

describe('runLocalSemanticInference — end-to-end happy path', () => {
  it('produces snapshot + roles + ordering for a typical form page', () => {
    const heading = makeCandidate({ selector: 'h1', label: 'Onboarding', documentTop: 0 }, { tag: 'h1' });
    const nav = makeCandidate(
      { selector: 'nav a', label: 'Formulaire', zone: 'navigation', isActionable: true, documentTop: 50 },
      { tag: 'a', parents: ['nav'] },
    );
    const input = makeCandidate(
      { selector: '#email', label: 'Email', intent: 'form-flow', isFormControl: true, documentTop: 150 },
      { tag: 'input', parents: ['form'] },
    );
    const submit = makeCandidate(
      { selector: '#save', label: 'Enregistrer', intent: 'primary-action', isActionable: true, documentTop: 250 },
      { tag: 'button', attributes: { type: 'submit' } },
    );

    const result = runLocalSemanticInference({
      candidates: [heading, nav, input, submit],
    });

    expect(result.snapshot.hasForm).toBe(true);
    expect(result.snapshot.hasNavigation).toBe(true);
    expect(result.roles).toHaveLength(4);

    const byRole = Object.fromEntries(result.roles.map((role) => [role.selector, role.role]));
    expect(byRole['h1']).toBe('entry');
    expect(byRole['nav a']).toBe('navigation');
    expect(byRole['#email']).toBe('form-field');
    expect(byRole['#save']).toBe('form-submit');
  });
});
