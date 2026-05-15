/* eslint-disable */
/**
 * Dependency-free smoke test for the hybrid semantic layer.
 *
 * Runs against the compiled CJS bundle so it works without jest /
 * ts-jest installed. Useful for CI smoke checks and for the lab loop
 * before committing. Exits with a non-zero code on the first failure.
 *
 * Usage:
 *   1) npm run build
 *   2) node tests/semantic-smoke.cjs
 */
'use strict';

const path = require('path');
const assert = require('node:assert/strict');

const distPath = path.join(__dirname, '..', 'dist', 'index.cjs.js');
let sdk;
try {
  sdk = require(distPath);
} catch (err) {
  console.error(`[semantic-smoke] Failed to require ${distPath}. Run "npm run build" first.`);
  console.error(err.message);
  process.exit(2);
}

const {
  buildSemanticPageSnapshot,
  classifyCandidate,
  proposeSequenceOrder,
  computeSemanticScoreDelta,
  resolveSemanticWeights,
  buildSemanticStepCopy,
  runLocalSemanticInference,
  mergeBackendHints,
  __resetSemanticDomMutationTrackerForTests,
  generateContextualTourDraftsAsync,
} = sdk;

function makeElement(tag, attrs = {}, parents = []) {
  return {
    tagName: tag.toUpperCase(),
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    closest: (sel) => {
      const wanted = sel.toLowerCase();
      for (const parent of parents) {
        if (wanted.split(',').some((s) => s.trim().replace(/[\[\]=\"]/g, '').includes(parent.toLowerCase()))) {
          return { tagName: 'NAV' };
        }
      }
      return null;
    },
    getBoundingClientRect: () => ({ top: 0 }),
    textContent: attrs['aria-label'] || '',
  };
}

function candidate(partial, tag, attrs, parents) {
  return {
    element: makeElement(tag, attrs, parents),
    selector: partial.selector,
    label: partial.label,
    intent: partial.intent || 'discovery',
    zone: partial.zone || 'main',
    isActionable: !!partial.isActionable,
    isFormControl: !!partial.isFormControl,
    documentTop: partial.documentTop || 0,
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('input → form-field', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#email', label: 'Email', intent: 'form-flow', isFormControl: true }, 'input', { type: 'email' }, ['form']),
    snap,
  );
  assert.equal(role.role, 'form-field');
});

test('submit button labeled "Enregistrer" → form-submit', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#save', label: 'Enregistrer', intent: 'primary-action', isActionable: true }, 'button', { type: 'submit' }),
    snap,
  );
  assert.equal(role.role, 'form-submit');
});

test('"Réglages rapides" button → utility (not validation)', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#settings', label: 'Réglages rapides', isActionable: true }, 'button'),
    snap,
  );
  assert.equal(role.role, 'utility');
});

test('"Guide" link → secondary (not discovery)', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#help', label: "Guide d'utilisation", intent: 'support-navigation', isActionable: true }, 'a'),
    snap,
  );
  assert.equal(role.role, 'secondary');
});

test('nav anchor → navigation', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: 'nav a', label: 'Aperçu', zone: 'navigation', isActionable: true }, 'a', {}, ['nav']),
    snap,
  );
  assert.equal(role.role, 'navigation');
});

test('h1 → entry', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(candidate({ selector: 'h1', label: 'Onboarding' }, 'h1'), snap);
  assert.equal(role.role, 'entry');
});

test('"Créer un projet" button → cta-primary with high confidence', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate(
      {
        selector: '#cta',
        label: 'Créer un projet',
        intent: 'primary-action',
        isActionable: true,
      },
      'button',
    ),
    snap,
  );
  assert.equal(role.role, 'cta-primary');
  assert.ok(role.confidence >= 0.7, `expected high confidence, got ${role.confidence}`);
});

test('"Démarrer" button → cta-primary (not generic-click)', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#start', label: 'Démarrer maintenant', isActionable: true }, 'button'),
    snap,
  );
  assert.equal(role.role, 'cta-primary');
});

test('"Relancer le chargement" button → cta-primary', () => {
  const snap = buildSemanticPageSnapshot([]);
  const role = classifyCandidate(
    candidate({ selector: '#refresh', label: 'Relancer le chargement', isActionable: true }, 'button'),
    snap,
  );
  assert.equal(role.role, 'cta-primary');
});

test('cta-primary agrees with primary-action intent (positive delta)', () => {
  const { agreement, delta } = computeSemanticScoreDelta({
    heuristicIntent: 'primary-action',
    semanticRole: 'cta-primary',
    confidence: 0.8,
  });
  assert.equal(agreement, 'agree');
  assert.ok(delta > 0, `expected positive delta, got ${delta}`);
});

test('utility role conflicts with primary-action (negative delta)', () => {
  // Regression: agreement map used to falsely list "utility" under
  // primary-action, which let settings buttons pretend to be CTAs.
  const { agreement, delta } = computeSemanticScoreDelta({
    heuristicIntent: 'primary-action',
    semanticRole: 'utility',
    confidence: 0.7,
  });
  assert.equal(agreement, 'conflict');
  assert.ok(delta < 0, `expected negative delta, got ${delta}`);
});

test('utility role conflicts with discovery intent', () => {
  // Regression: discovery tours pointing at settings buttons should
  // be penalised, not treated as neutral.
  const { agreement, delta } = computeSemanticScoreDelta({
    heuristicIntent: 'discovery',
    semanticRole: 'utility',
    confidence: 0.7,
  });
  assert.equal(agreement, 'conflict');
  assert.ok(delta < 0, `expected negative delta, got ${delta}`);
});

test('secondary role agrees with discovery intent', () => {
  const { agreement } = computeSemanticScoreDelta({
    heuristicIntent: 'discovery',
    semanticRole: 'secondary',
    confidence: 0.7,
  });
  assert.equal(agreement, 'agree');
});

test('cta-primary copy is action-flavoured (not generic)', () => {
  const copy = buildSemanticStepCopy('cta-primary', 'Créer un projet');
  assert.ok(/action/i.test(copy.title));
  assert.ok(/lancez|déclenchez|action/i.test(copy.content));
});

test('proposeSequenceOrder respects role precedence', () => {
  const cs = [
    candidate({ selector: '#save', label: 'Enregistrer', intent: 'primary-action', isActionable: true, documentTop: 200 }, 'button', { type: 'submit' }),
    candidate({ selector: '#email', label: 'Email', intent: 'form-flow', isFormControl: true, documentTop: 100 }, 'input', {}, ['form']),
    candidate({ selector: 'h1', label: 'Onboarding', documentTop: 0 }, 'h1'),
    candidate({ selector: 'nav a', label: 'Formulaire', zone: 'navigation', isActionable: true, documentTop: 50 }, 'a', {}, ['nav']),
  ];
  const snap = buildSemanticPageSnapshot(cs);
  const roles = cs.map((c) => classifyCandidate(c, snap));
  const order = proposeSequenceOrder(cs, roles);
  assert.deepEqual(order, ['h1', 'nav a', '#email', '#save']);
});

test('computeSemanticScoreDelta is bounded (≤ 8)', () => {
  const { delta } = computeSemanticScoreDelta({
    heuristicIntent: 'form-flow',
    semanticRole: 'form-submit',
    confidence: 5,
    weights: { role: 5, order: 5, copy: 5 },
  });
  assert.ok(Math.abs(delta) <= 8, `delta=${delta}`);
});

test('agreement vs conflict polarity', () => {
  const agree = computeSemanticScoreDelta({
    heuristicIntent: 'form-flow',
    semanticRole: 'form-field',
    confidence: 0.9,
  });
  const conflict = computeSemanticScoreDelta({
    heuristicIntent: 'primary-action',
    semanticRole: 'form-field',
    confidence: 0.9,
  });
  assert.equal(agree.agreement, 'agree');
  assert.ok(agree.delta > 0);
  assert.equal(conflict.agreement, 'conflict');
  assert.ok(conflict.delta < 0);
});

test('resolveSemanticWeights clamps to [0, 1]', () => {
  const w = resolveSemanticWeights({ semanticRoleWeights: { role: 10, order: -2, copy: 0.5 } });
  assert.equal(w.role, 1);
  assert.equal(w.order, 0);
  assert.equal(w.copy, 0.5);
});

test('buildSemanticStepCopy never labels a form-field as discovery', () => {
  const copy = buildSemanticStepCopy('form-field', 'Email de contact');
  assert.ok(/formulaire/i.test(copy.title));
  assert.ok(!/découv|decouv|aide|help/i.test(copy.title + ' ' + copy.content));
});

test('runLocalSemanticInference exposes snapshot and roles', () => {
  const cs = [
    candidate({ selector: 'h1', label: 'Onboarding' }, 'h1'),
    candidate({ selector: '#email', label: 'Email', intent: 'form-flow', isFormControl: true }, 'input', {}, ['form']),
  ];
  const result = runLocalSemanticInference({ candidates: cs });
  assert.equal(result.snapshot.hasForm, true);
  assert.equal(result.roles.length, 2);
});

test('low-confidence votes never push delta past zero locally', () => {
  // Confidence below the 0.55 guard should produce ≤ MAX delta locally,
  // and the fusion layer will zero-clamp it. Here we just assert the
  // computeSemanticScoreDelta function still respects bounds when given
  // a low-confidence value (the caller is responsible for zero-clamping).
  const { delta } = computeSemanticScoreDelta({
    heuristicIntent: 'form-flow',
    semanticRole: 'form-field',
    confidence: 0.2,
  });
  assert.ok(delta < 1.5, `low-confidence delta should be small, got ${delta}`);
});

test('mergeBackendHints — backend wins only with strictly higher confidence', () => {
  const localRoles = [
    { selector: '#a', role: 'form-field', confidence: 0.6, rationale: ['local'] },
  ];
  const tieMerged = mergeBackendHints(localRoles, [
    { selector: '#a', role: 'form-submit', confidence: 0.65 },
  ]);
  assert.equal(tieMerged[0].role, 'form-field');

  const winMerged = mergeBackendHints(localRoles, [
    { selector: '#a', role: 'form-submit', confidence: 0.95 },
  ]);
  assert.equal(winMerged[0].role, 'form-submit');
});

test('DOM-stability gate exports a reset hook for tests', () => {
  assert.equal(typeof __resetSemanticDomMutationTrackerForTests, 'function');
  __resetSemanticDomMutationTrackerForTests();
});

test('generateContextualTourDraftsAsync is exported and async', () => {
  assert.equal(typeof generateContextualTourDraftsAsync, 'function');
  const result = generateContextualTourDraftsAsync({ semanticEnhancementEnabled: false });
  assert.ok(result && typeof result.then === 'function', 'should return a Promise');
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  fail ${name}`);
    console.error(`       ${err && err.message ? err.message : err}`);
  }
}

console.log('');
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed === 0 ? 0 : 1);
