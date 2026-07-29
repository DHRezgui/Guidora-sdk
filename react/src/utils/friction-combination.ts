import type { FrictionCounters } from '../types';
import { hasStrongHelpSignal } from './friction-signal-catalog';

/**
 * Phase 4 — signal families for combination gates (fewer false positives).
 * A raw count of 2× the same family (e.g. two click-miss) is weaker than
 * two distinct families (click + navigation).
 */
export type FrictionSignalFamily =
  | 'click'
  | 'navigation'
  | 'form'
  | 'hesitation'
  | 'help';

export const FRICTION_SIGNAL_FAMILY_LABELS: Record<FrictionSignalFamily, string> = {
  click: 'clic',
  navigation: 'navigation',
  form: 'formulaire',
  hesitation: 'hésitation',
  help: 'aide / FAQ',
};

/** Default: toast / strong gates need ≥2 distinct families. */
export const DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES = 2;

/**
 * Map discrete counters to industry-aligned families.
 * Note: `timeOnPageExcessive` is scoring/ML only — not a combination family
 * (passive dwell must not unlock multi-family by waiting).
 * `formAbandonment` is excluded (beforeunload — not live help evidence).
 */
export function resolveActiveFrictionFamilies(
  counters: FrictionCounters,
): FrictionSignalFamily[] {
  const families = new Set<FrictionSignalFamily>();

  if (
    counters.clickMiss > 0 ||
    (counters.rageClick ?? 0) > 0 ||
    (counters.errorClick ?? 0) > 0 ||
    (counters.slowResponse ?? 0) > 0
  ) {
    families.add('click');
  }
  if (
    counters.navigationBack > 0 ||
    (counters.navigationLoop ?? 0) > 0 ||
    (counters.uTurn ?? 0) > 0
  ) {
    families.add('navigation');
  }
  if ((counters.formRetry ?? 0) > 0) {
    families.add('form');
  }
  // Scroll hesitation only — time-stall tiers must NOT unlock multi-family
  // (otherwise any click-miss + ~45s idle always passes Phase 4).
  if (counters.scrollHesitation > 0) {
    families.add('hesitation');
  }
  if (
    (counters.faqNoResult ?? 0) > 0 ||
    (counters.faqReopen ?? 0) > 0 ||
    (counters.failAfterHelp ?? 0) > 0
  ) {
    families.add('help');
  }

  return Array.from(families);
}

/**
 * High-confidence signals that alone justify proactive help — catalog strength.
 */
export function hasStrongSingleFamilyFriction(counters: FrictionCounters): boolean {
  return hasStrongHelpSignal(counters);
}

export interface FrictionCombinationVerdict {
  eligible: boolean;
  reason: string;
  families: FrictionSignalFamily[];
  familyCount: number;
  viaStrongSingle: boolean;
}

/**
 * Combination gate: prefer multi-family evidence over repeated same-family noise.
 */
export function evaluateFrictionCombination(input: {
  counters: FrictionCounters;
  minDistinctFamilies?: number;
  allowStrongSingleFamily?: boolean;
}): FrictionCombinationVerdict {
  const minDistinct = Math.max(
    1,
    input.minDistinctFamilies ?? DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES,
  );
  const allowStrong = input.allowStrongSingleFamily !== false;
  const families = resolveActiveFrictionFamilies(input.counters);
  const familyCount = families.length;
  const viaStrongSingle = allowStrong && hasStrongSingleFamilyFriction(input.counters);

  if (viaStrongSingle) {
    return {
      eligible: true,
      reason: `combinaison — signal fort (familles: ${formatFamilies(families)})`,
      families,
      familyCount,
      viaStrongSingle: true,
    };
  }

  if (familyCount >= minDistinct) {
    return {
      eligible: true,
      reason: `combinaison — ${familyCount} familles ≥ ${minDistinct} (${formatFamilies(families)})`,
      families,
      familyCount,
      viaStrongSingle: false,
    };
  }

  return {
    eligible: false,
    reason: `combinaison — ${familyCount} famille(s) < min ${minDistinct} (${formatFamilies(families) || 'aucune'})`,
    families,
    familyCount,
    viaStrongSingle: false,
  };
}

function formatFamilies(families: FrictionSignalFamily[]): string {
  return families.map((family) => FRICTION_SIGNAL_FAMILY_LABELS[family]).join(', ');
}
