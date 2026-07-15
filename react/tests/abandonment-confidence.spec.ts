import {
  abandonmentLogOddsToProbability,
  computeAbandonmentConfidence,
  defaultAbandonmentMinConfidence,
  evaluateAbandonmentToastEligibility,
  resolveAbandonmentBaseProbability,
} from '../src/utils/abandonment-confidence';

describe('abandonment confidence', () => {
  it('computes confidence as normalized distance from threshold', () => {
    expect(computeAbandonmentConfidence(0.2642, 0.5)).toBeCloseTo(0.4716, 3);
    expect(computeAbandonmentConfidence(0.78, 0.4)).toBeCloseTo(0.6333, 3);
    expect(computeAbandonmentConfidence(0.5, 0.5)).toBeCloseTo(0, 5);
  });

  it('uses lower default minConfidence outside production', () => {
    expect(defaultAbandonmentMinConfidence()).toBe(0.3);
  });

  it('converts SHAP log-odds baseline to probability', () => {
    expect(abandonmentLogOddsToProbability(-2.613)).toBeCloseTo(0.068, 2);
    expect(resolveAbandonmentBaseProbability({ baseProbability: 0.41 })).toBe(0.41);
    expect(resolveAbandonmentBaseProbability({ expectedValue: 0 })).toBeCloseTo(0.5, 3);
  });
});

describe('abandonment toast eligibility', () => {
  const baseResult = {
    status: 'ok' as const,
    source: 'ml' as const,
    error: null,
    prediction: {
      abandonmentRisk: 0.78,
      willAbandon: true,
      confidence: 0.6333,
      threshold: 0.4,
    },
  };

  it('returns eligible when all gates pass', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: baseResult,
      threshold: 0.4,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
    });

    expect(verdict.eligible).toBe(true);
    expect(verdict.via).toBe('ml');
    expect(verdict.reason).toContain('ML');
  });

  it('allows idle hybrid toast when ML is low but friction and inactivity are high', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: {
        status: 'ok',
        source: 'ml',
        error: null,
        prediction: {
          abandonmentRisk: 0.15,
          willAbandon: false,
          confidence: 0.55,
          threshold: 0.45,
        },
      },
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 180,
      signalCount: 3,
      idle: {
        seconds: 180,
        localRisk: 0.8,
        signalCount: 3,
        enabled: true,
        minSeconds: 120,
        minLocalRisk: 0.45,
        minSignals: 2,
      },
    });

    expect(verdict.eligible).toBe(true);
    expect(verdict.via).toBe('idle_hybrid');
    expect(verdict.reason).toContain('inactivité');
  });

  it('blocks idle hybrid toast when inactivity is below threshold', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: {
        status: 'ok',
        source: 'ml',
        error: null,
        prediction: {
          abandonmentRisk: 0.15,
          willAbandon: false,
          confidence: 0.55,
          threshold: 0.45,
        },
      },
      threshold: 0.45,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 180,
      signalCount: 3,
      idle: {
        seconds: 60,
        localRisk: 0.8,
        signalCount: 3,
        enabled: true,
      },
    });

    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('inactivité');
  });

  it('blocks ML toast before min session seconds for onboarding intent', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: baseResult,
      threshold: 0.4,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 45,
      signalCount: 2,
      intentPolicy: {
        threshold: 0.55,
        minConfidence: 0.35,
        minSessionSeconds: 120,
        minSignals: 2,
        requireFrictionSignalsForMlToast: true,
        allowTemporalMlGate: false,
        proactiveIdleMinSeconds: 150,
        proactiveIdleMinLocalRisk: 0.5,
        proactiveIdleMinSignals: 2,
      },
    });

    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('session 45s');
  });

  it('blocks when confidence is below minConfidence', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: baseResult,
      threshold: 0.4,
      minConfidence: 0.85,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
    });

    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('confiance');
  });

  it('blocks when source is not ML', () => {
    const verdict = evaluateAbandonmentToastEligibility({
      result: { ...baseResult, source: 'local' },
      threshold: 0.4,
      minConfidence: 0.3,
      proactiveHelp: true,
      sessionSeconds: 120,
      signalCount: 2,
    });

    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('voie ML');
  });
});
