import type { FrictionCounters } from '../src/types';
import {
  evaluateFrictionCombination,
  hasStrongSingleFamilyFriction,
  resolveActiveFrictionFamilies,
} from '../src/utils/friction-combination';
import {
  matchAbandonmentPagePolicy,
  matchesPagePattern,
  resolveEffectiveAbandonmentPolicy,
} from '../src/utils/abandonment-session-intent';

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

describe('friction combination (Phase 4)', () => {
  it('treats repeated same-family signals as a single family', () => {
    const families = resolveActiveFrictionFamilies(
      counters({ clickMiss: 3, rageClick: 1 }),
    );
    expect(families).toEqual(['click']);
  });

  it('blocks toast evidence when only one weak family is present', () => {
    const verdict = evaluateFrictionCombination({
      counters: counters({ clickMiss: 2 }),
      minDistinctFamilies: 2,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.familyCount).toBe(1);
    expect(verdict.reason).toContain('famille');
  });

  it('does not treat time-stall tiers as a combination family', () => {
    const families = resolveActiveFrictionFamilies(
      counters({ clickMiss: 2, timeOnPageExcessive: 3 }),
    );
    expect(families).toEqual(['click']);
    expect(
      evaluateFrictionCombination({
        counters: counters({ clickMiss: 2, timeOnPageExcessive: 3 }),
        minDistinctFamilies: 2,
      }).eligible,
    ).toBe(false);
  });

  it('treats scroll hesitation as the hesitation family', () => {
    expect(
      resolveActiveFrictionFamilies(counters({ scrollHesitation: 1 })),
    ).toEqual(['hesitation']);
  });

  it('allows multi-family combinations', () => {
    const verdict = evaluateFrictionCombination({
      counters: counters({ clickMiss: 1, uTurn: 1 }),
      minDistinctFamilies: 2,
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.familyCount).toBe(2);
    expect(verdict.viaStrongSingle).toBe(false);
  });

  it('allows strong single-family signals from catalog (errorClick / formRetry only)', () => {
    expect(hasStrongSingleFamilyFriction(counters({ errorClick: 1 }))).toBe(true);
    expect(hasStrongSingleFamilyFriction(counters({ formRetry: 1 }))).toBe(true);
    expect(hasStrongSingleFamilyFriction(counters({ navigationLoop: 1 }))).toBe(false);
    expect(hasStrongSingleFamilyFriction(counters({ failAfterHelp: 1 }))).toBe(false);
    expect(hasStrongSingleFamilyFriction(counters({ rageClick: 2 }))).toBe(false);
    const verdict = evaluateFrictionCombination({
      counters: counters({ errorClick: 1 }),
      minDistinctFamilies: 2,
      allowStrongSingleFamily: true,
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.viaStrongSingle).toBe(true);
  });

  it('does not unlock toast on navigationLoop alone (medium demote)', () => {
    const verdict = evaluateFrictionCombination({
      counters: counters({ navigationLoop: 1 }),
      minDistinctFamilies: 2,
      allowStrongSingleFamily: true,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.viaStrongSingle).toBe(false);
  });

  it('does not unlock toast on failAfterHelp alone (medium demote)', () => {
    const verdict = evaluateFrictionCombination({
      counters: counters({ failAfterHelp: 1 }),
      minDistinctFamilies: 2,
      allowStrongSingleFamily: true,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.viaStrongSingle).toBe(false);
  });
});

describe('page policies (Phase 4)', () => {
  it('matches wildcard and substring patterns', () => {
    expect(matchesPagePattern('/app/settings', 'settings')).toBe(true);
    expect(matchesPagePattern('/app/settings', '/app/settings*')).toBe(true);
    expect(matchesPagePattern('/\u0001nav:settings', 'nav:settings')).toBe(true);
    expect(matchesPagePattern('/dashboard', 'settings')).toBe(false);
  });

  it('merges the first matching page policy over intent defaults', () => {
    const resolved = resolveEffectiveAbandonmentPolicy(
      {
        pagePolicies: [
          {
            match: 'settings',
            label: 'Orbit Settings',
            policy: { threshold: 0.65, minSessionSeconds: 180 },
          },
        ],
      },
      'returning',
      { url: '/', logicalKey: '/\u0001orbit\u0001settings\u0001settings', identity: '/\u0001nav:settings' },
    );

    expect(resolved.pagePolicyLabel).toBe('Orbit Settings');
    expect(resolved.policy.threshold).toBe(0.65);
    expect(resolved.policy.minSessionSeconds).toBe(180);
    // Intent defaults preserved when not overridden.
    expect(resolved.policy.minDistinctFamilies).toBe(2);
  });

  it('returns null when no page policy matches', () => {
    expect(
      matchAbandonmentPagePolicy([{ match: '/checkout' }], { url: '/dashboard' }),
    ).toBeNull();
  });
});
