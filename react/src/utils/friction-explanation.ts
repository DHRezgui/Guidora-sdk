import type { FrictionCounters } from '../types';
import {
  FRICTION_SIGNAL_FAMILY_LABELS,
  resolveActiveFrictionFamilies,
  type FrictionSignalFamily,
} from './friction-combination';
import {
  countHelpSignalsByStrength,
  listActiveFrictionSignals,
} from './friction-signal-catalog';

export type FrictionLevel = 'none' | 'low' | 'medium' | 'high';

export interface FrictionExplanation {
  level: FrictionLevel;
  levelLabel: string;
  reasons: string[];
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  families: FrictionSignalFamily[];
  familyLabels: string[];
}

const LEVEL_LABELS: Record<FrictionLevel, string> = {
  none: 'aucune',
  low: 'faible',
  medium: 'moyenne',
  high: 'élevée',
};

/**
 * Human-readable friction summary for Decision Engine + debug panel.
 * Does not use the numeric score/79 normalization.
 */
export function buildFrictionExplanation(counters: FrictionCounters): FrictionExplanation {
  const active = listActiveFrictionSignals(counters, { helpOnly: true });
  const { strong, medium, weak } = countHelpSignalsByStrength(counters);
  const families = resolveActiveFrictionFamilies(counters);
  const reasons = active.map((signal) => {
    const n = signal.count;
    return `${n}× ${signal.entry.label}`;
  });

  let level: FrictionLevel = 'none';
  if (strong > 0) {
    level = 'high';
  } else if (medium >= 2 || (medium >= 1 && families.length >= 2)) {
    level = 'high';
  } else if (medium >= 1) {
    level = 'medium';
  } else if (weak >= 1 || families.length >= 1) {
    level = 'low';
  }

  return {
    level,
    levelLabel: LEVEL_LABELS[level],
    reasons,
    strongCount: strong,
    mediumCount: medium,
    weakCount: weak,
    families,
    familyLabels: families.map((family) => FRICTION_SIGNAL_FAMILY_LABELS[family]),
  };
}
