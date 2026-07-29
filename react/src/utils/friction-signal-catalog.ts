import type { FrictionCounters } from '../types';
import type { FrictionSignalFamily } from './friction-combination';

export type FrictionSignalStrength = 'strong' | 'medium' | 'weak';

export type FrictionSignalKey =
  | 'clickMiss'
  | 'rageClick'
  | 'errorClick'
  | 'slowResponse'
  | 'scrollHesitation'
  | 'timeOnPageExcessive'
  | 'navigationBack'
  | 'navigationLoop'
  | 'uTurn'
  | 'formAbandonment'
  | 'formRetry'
  | 'faqNoResult'
  | 'faqReopen'
  | 'failAfterHelp';

export interface FrictionSignalCatalogEntry {
  key: FrictionSignalKey;
  label: string;
  family: FrictionSignalFamily | null;
  strength: FrictionSignalStrength;
  /** When true, a positive count alone can unlock concrete friction for help. */
  canTriggerAlone: boolean;
  /** When false, excluded from help Decision Engine evidence. */
  contributesToHelp: boolean;
  status: 'keep' | 'harden' | 'demote' | 'disable';
}

/**
 * Single source of truth for signal strength (friction-first Decision Engine).
 * Aligned with docs/presentation/friction-signal-matrix.md.
 */
export const FRICTION_SIGNAL_CATALOG: FrictionSignalCatalogEntry[] = [
  {
    key: 'errorClick',
    label: 'Error click',
    family: 'click',
    strength: 'strong',
    canTriggerAlone: true,
    contributesToHelp: true,
    status: 'harden',
  },
  {
    key: 'failAfterHelp',
    label: 'Fail after help',
    family: 'help',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    // No topic/page link between FAQ search and later failure → solo toast FP.
    status: 'demote',
  },
  {
    key: 'navigationLoop',
    label: 'Navigation loop',
    family: 'navigation',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    // Solo toast FP: quick compare of two pages (A↔B) can look like a loop.
    status: 'demote',
  },
  {
    key: 'formRetry',
    label: 'Form retry',
    family: 'form',
    strength: 'strong',
    canTriggerAlone: true,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'rageClick',
    label: 'Rage click',
    family: 'click',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'uTurn',
    label: 'U-turn',
    family: 'navigation',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'faqNoResult',
    label: 'FAQ faible',
    family: 'help',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'faqReopen',
    label: 'FAQ reopen',
    family: 'help',
    strength: 'medium',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'clickMiss',
    label: 'Click-miss',
    family: 'click',
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'harden',
  },
  {
    key: 'scrollHesitation',
    label: 'Scroll hésitation',
    family: 'hesitation',
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'keep',
  },
  {
    key: 'slowResponse',
    label: 'Slow response',
    family: 'click',
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'harden',
  },
  {
    key: 'navigationBack',
    label: 'Navigation back',
    family: 'navigation',
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: true,
    status: 'demote',
  },
  {
    key: 'timeOnPageExcessive',
    label: 'Palier temps',
    family: null,
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: false,
    status: 'demote',
  },
  {
    key: 'formAbandonment',
    label: 'Form abandon',
    family: 'form',
    strength: 'weak',
    canTriggerAlone: false,
    contributesToHelp: false,
    status: 'disable',
  },
];

const CATALOG_BY_KEY = Object.fromEntries(
  FRICTION_SIGNAL_CATALOG.map((entry) => [entry.key, entry]),
) as Record<FrictionSignalKey, FrictionSignalCatalogEntry>;

export function getFrictionSignalCatalogEntry(
  key: FrictionSignalKey,
): FrictionSignalCatalogEntry {
  return CATALOG_BY_KEY[key];
}

export function counterValueForSignal(
  counters: FrictionCounters,
  key: FrictionSignalKey,
): number {
  const value = counters[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export interface ActiveFrictionSignal {
  key: FrictionSignalKey;
  count: number;
  entry: FrictionSignalCatalogEntry;
}

export function listActiveFrictionSignals(
  counters: FrictionCounters,
  options?: { helpOnly?: boolean },
): ActiveFrictionSignal[] {
  const helpOnly = options?.helpOnly !== false;
  const active: ActiveFrictionSignal[] = [];
  for (const entry of FRICTION_SIGNAL_CATALOG) {
    if (helpOnly && !entry.contributesToHelp) continue;
    const count = counterValueForSignal(counters, entry.key);
    if (count <= 0) continue;
    active.push({ key: entry.key, count, entry });
  }
  return active;
}

/** Strong signals that alone justify concrete friction for help. */
export function hasStrongHelpSignal(counters: FrictionCounters): boolean {
  return listActiveFrictionSignals(counters).some(
    (signal) => signal.entry.strength === 'strong' && signal.entry.canTriggerAlone,
  );
}

export function hasMediumOrStrongHelpSignal(counters: FrictionCounters): boolean {
  return listActiveFrictionSignals(counters).some(
    (signal) => signal.entry.strength === 'strong' || signal.entry.strength === 'medium',
  );
}

export function countHelpSignalsByStrength(counters: FrictionCounters): {
  strong: number;
  medium: number;
  weak: number;
} {
  let strong = 0;
  let medium = 0;
  let weak = 0;
  for (const signal of listActiveFrictionSignals(counters)) {
    if (signal.entry.strength === 'strong') strong += 1;
    else if (signal.entry.strength === 'medium') medium += 1;
    else weak += 1;
  }
  return { strong, medium, weak };
}
