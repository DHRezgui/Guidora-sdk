import type { FrictionCounters } from '../src/types';
import { buildFrictionExplanation } from '../src/utils/friction-explanation';

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

describe('buildFrictionExplanation', () => {
  it('returns none when no help-relevant signals', () => {
    const explanation = buildFrictionExplanation(
      counters({ timeOnPageExcessive: 2, formAbandonment: 1 }),
    );
    expect(explanation.level).toBe('none');
    expect(explanation.reasons).toEqual([]);
    expect(explanation.families).toEqual([]);
  });

  it('marks strong signal as high with readable reasons', () => {
    const explanation = buildFrictionExplanation(counters({ rageClick: 1, uTurn: 1 }));
    expect(explanation.level).toBe('high');
    expect(explanation.levelLabel).toBe('élevée');
    expect(explanation.reasons.some((r) => r.includes('Rage click'))).toBe(true);
    expect(explanation.familyLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('marks medium-only as medium', () => {
    const explanation = buildFrictionExplanation(counters({ rageClick: 1 }));
    expect(explanation.level).toBe('medium');
    expect(explanation.mediumCount).toBe(1);
    expect(explanation.strongCount).toBe(0);
  });

  it('marks weak-only as low', () => {
    const explanation = buildFrictionExplanation(counters({ clickMiss: 2 }));
    expect(explanation.level).toBe('low');
    expect(explanation.weakCount).toBeGreaterThanOrEqual(1);
  });
});
