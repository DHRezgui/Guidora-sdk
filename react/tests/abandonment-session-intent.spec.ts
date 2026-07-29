import {
  DEFAULT_ABANDONMENT_INTENT_POLICIES,
  resolveAbandonmentIntentPolicy,
  resolveAbandonmentSessionIntent,
} from '../src/utils/abandonment-session-intent';

describe('resolveAbandonmentSessionIntent', () => {
  it('prefers explicit intent from config', () => {
    expect(
      resolveAbandonmentSessionIntent({
        explicitIntent: 'returning',
        isTourActive: true,
        organizationVisitCount: 1,
        pageVisitCount: 1,
      }),
    ).toBe('returning');
  });

  it('classifies active tour as onboarding', () => {
    expect(
      resolveAbandonmentSessionIntent({
        isTourActive: true,
        organizationVisitCount: 5,
        pageVisitCount: 2,
      }),
    ).toBe('onboarding');
  });

  it('classifies first organization visit as onboarding', () => {
    expect(
      resolveAbandonmentSessionIntent({
        isTourActive: false,
        organizationVisitCount: 1,
        pageVisitCount: 1,
      }),
    ).toBe('onboarding');
  });

  it('classifies recurring usage as returning', () => {
    expect(
      resolveAbandonmentSessionIntent({
        isTourActive: false,
        organizationVisitCount: 4,
        pageVisitCount: 2,
      }),
    ).toBe('returning');
  });
});

describe('resolveAbandonmentIntentPolicy', () => {
  it('merges config overrides with intent defaults', () => {
    const policy = resolveAbandonmentIntentPolicy(
      {
        threshold: 0.4,
        intentPolicies: {
          onboarding: {
            minSessionSeconds: 150,
          },
        },
      },
      'onboarding',
    );

    expect(policy.threshold).toBe(0.4);
    expect(policy.minSessionSeconds).toBe(150);
    expect(policy.minDistinctFamilies).toBe(2);
    expect(policy.requireMultiFamilyForToast).toBe(true);
    expect(policy.allowTemporalMlGate).toBe(
      DEFAULT_ABANDONMENT_INTENT_POLICIES.onboarding.allowTemporalMlGate,
    );
  });
});
