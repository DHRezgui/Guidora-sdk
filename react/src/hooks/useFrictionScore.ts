import { useMemo } from 'react';
import { FrictionCounters } from '../types';

export interface FrictionScoreResult {
  score: number;
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export function useFrictionScore(counters: FrictionCounters): FrictionScoreResult {
  return useMemo(() => {
    const score =
      counters.clickMiss * 2 +
      counters.scrollHesitation * 2 +
      counters.timeOnPageExcessive * 1 +
      counters.formAbandonment * 3 +
      counters.navigationBack * 2;

    let riskLevel: FrictionScoreResult['riskLevel'] = 'NONE';
    if (score >= 10) riskLevel = 'HIGH';
    else if (score >= 6) riskLevel = 'MEDIUM';
    else if (score >= 2) riskLevel = 'LOW';

    return {
      score,
      riskLevel,
    };
  }, [counters.clickMiss, counters.formAbandonment, counters.navigationBack, counters.scrollHesitation, counters.timeOnPageExcessive]);
}
