import { useMemo } from 'react';
import { FrictionCounters } from '../types';
import { computeFrictionScore, resolveFrictionRiskLevel } from '../utils/friction-scoring';

export interface FrictionScoreResult {
  score: number;
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export function useFrictionScore(counters: FrictionCounters): FrictionScoreResult {
  return useMemo(() => {
    const score = computeFrictionScore(counters);
    return {
      score,
      riskLevel: resolveFrictionRiskLevel(score),
    };
  }, [
    counters.clickMiss,
    counters.formAbandonment,
    counters.navigationBack,
    counters.scrollHesitation,
    counters.timeOnPageExcessive,
  ]);
}
