import type { FrictionCounters } from '../src/types';
import { DEFAULT_ABANDONMENT_INTENT_POLICIES } from '../src/utils/abandonment-session-intent';
import {
  evaluateHelpDecision,
  hasConcreteFrictionEvidence,
} from '../src/utils/friction-decision-engine';
import { buildFrictionExplanation } from '../src/utils/friction-explanation';
import {
  DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS,
  filterCountersByFreshness,
} from '../src/utils/friction-signal-freshness';
import type { FrictionSignalTimestamps } from '../src/utils/friction-signal-freshness';

function counters(partial: Partial<FrictionCounters>): FrictionCounters {
  return {
    clickMiss: 0,
    scrollHesitation: 0,
    timeOnPageExcessive: 0,
    formAbandonment: 0,
    navigationBack: 0,
    rageClick: 0,
    errorClick: 0,
    formRetry: 0,
    navigationLoop: 0,
    uTurn: 0,
    slowResponse: 0,
    faqNoResult: 0,
    faqReopen: 0,
    failAfterHelp: 0,
    ...partial,
  };
}

const returningPolicy = DEFAULT_ABANDONMENT_INTENT_POLICIES.returning;

const lowMlResult = {
  status: 'ok' as const,
  source: 'ml' as const,
  error: null,
  prediction: {
    abandonmentRisk: 0.12,
    willAbandon: false,
    confidence: 0.9,
    threshold: 0.45,
  },
};

const highMlResult = {
  status: 'ok' as const,
  source: 'ml' as const,
  error: null,
  prediction: {
    abandonmentRisk: 0.98,
    willAbandon: true,
    confidence: 0.9,
    threshold: 0.45,
  },
};

describe('hasConcreteFrictionEvidence', () => {
  it('rejects weak-only multi-family (click-miss + scroll)', () => {
    const verdict = hasConcreteFrictionEvidence(
      counters({ clickMiss: 2, scrollHesitation: 1 }),
      returningPolicy,
    );
    expect(verdict.ok).toBe(false);
  });

  it('accepts weak + medium multi-family (click-miss + u-turn)', () => {
    const verdict = hasConcreteFrictionEvidence(
      counters({ clickMiss: 1, uTurn: 1 }),
      returningPolicy,
    );
    expect(verdict.ok).toBe(true);
  });

  it('accepts strong alone (error click)', () => {
    expect(hasConcreteFrictionEvidence(counters({ errorClick: 1 }), returningPolicy).ok).toBe(
      true,
    );
  });

  it('ignores time-stall alone', () => {
    expect(
      hasConcreteFrictionEvidence(counters({ timeOnPageExcessive: 3 }), returningPolicy).ok,
    ).toBe(false);
  });
});

describe('evaluateHelpDecision', () => {
  it('blocks ML 98% without concrete friction', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ clickMiss: 2, timeOnPageExcessive: 2 }),
      result: highMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.concreteFriction).toBe(false);
    expect(decision.mlAdvisory.aboveThreshold).toBe(true);
  });

  it('allows friction_ml when concrete friction + ML high', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ clickMiss: 1, uTurn: 1 }),
      result: highMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.via).toBe('friction_ml');
    expect(decision.concreteFriction).toBe(true);
  });

  it('allows friction_only for strong signal when ML is low', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ errorClick: 1 }),
      result: lowMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 1,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.via).toBe('friction_only');
    expect(decision.concreteFriction).toBe(true);
  });

  it('prefers friction_ml over friction_only when both apply', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ errorClick: 1 }),
      result: highMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      // Intent policies require ≥2 signals for ML path; strong alone still uses friction_only if ML fails.
      signalCount: 2,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.via).toBe('friction_ml');
  });

  it('does not open friction_only on navigationLoop alone (demoted to medium)', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ navigationLoop: 1 }),
      result: lowMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 1,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.concreteFriction).toBe(false);
  });

  it('does not open friction_only on failAfterHelp alone (demoted to medium)', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ failAfterHelp: 1 }),
      result: lowMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 1,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.concreteFriction).toBe(false);
  });

  it('accepts navigationLoop with another family as concrete friction', () => {
    const decision = evaluateHelpDecision({
      counters: counters({ navigationLoop: 1, clickMiss: 1 }),
      result: highMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.via).toBe('friction_ml');
    expect(decision.concreteFriction).toBe(true);
  });

  it('ignores stale strong signal outside freshness window', () => {
    const now = 1_000_000;
    const timestamps: FrictionSignalTimestamps = {
      errorClick: now - DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS - 1_000,
    };
    const decision = evaluateHelpDecision({
      counters: counters({ errorClick: 1 }),
      signalTimestamps: timestamps,
      now,
      result: lowMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 1,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.concreteFriction).toBe(false);
    expect(decision.reasons.some((r) => r.includes('fraîcheur'))).toBe(true);
  });

  it('keeps fresh strong signal inside freshness window', () => {
    const now = 1_000_000;
    const timestamps: FrictionSignalTimestamps = {
      errorClick: now - 30_000,
    };
    const decision = evaluateHelpDecision({
      counters: counters({ errorClick: 1 }),
      signalTimestamps: timestamps,
      now,
      result: lowMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 1,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.via).toBe('friction_only');
  });

  it('drops stale medium from combination (click-miss + old u-turn)', () => {
    const now = 1_000_000;
    const timestamps: FrictionSignalTimestamps = {
      clickMiss: now - 5_000,
      uTurn: now - DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS - 5_000,
    };
    const decision = evaluateHelpDecision({
      counters: counters({ clickMiss: 1, uTurn: 1 }),
      signalTimestamps: timestamps,
      now,
      result: highMlResult,
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
      intentPolicy: returningPolicy,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.concreteFriction).toBe(false);
    expect(decision.decisionCounters.uTurn).toBe(0);
    expect(decision.decisionCounters.clickMiss).toBe(1);
  });
});

describe('filterCountersByFreshness', () => {
  it('leaves counters unchanged when timestamps are omitted', () => {
    const c = counters({ rageClick: 2 });
    const result = filterCountersByFreshness(c, null);
    expect(result.counters.rageClick).toBe(2);
    expect(result.droppedKeys).toEqual([]);
  });
});

describe('buildFrictionExplanation', () => {
  it('labels medium friction for navigationLoop alone (demoted)', () => {
    const explanation = buildFrictionExplanation(counters({ navigationLoop: 1 }));
    expect(explanation.level).toBe('medium');
    expect(explanation.reasons[0]).toContain('Navigation loop');
    expect(explanation.strongCount).toBe(0);
    expect(explanation.mediumCount).toBe(1);
  });
});
