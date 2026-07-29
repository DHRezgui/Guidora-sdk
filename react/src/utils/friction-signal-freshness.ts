import type { FrictionCounters } from '../types';
import {
  FRICTION_SIGNAL_CATALOG,
  counterValueForSignal,
  type FrictionSignalKey,
} from './friction-signal-catalog';

/** Live help decisions only consider signals fired within this window. */
export const DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS = 120_000;

export type FrictionSignalTimestamps = Partial<Record<FrictionSignalKey, number>>;

export interface FreshFrictionCountersResult {
  counters: FrictionCounters;
  /** Help-relevant keys present in session counters but outside the freshness window. */
  droppedKeys: FrictionSignalKey[];
  windowMs: number;
}

function zeroHelpSignal(
  counters: FrictionCounters,
  key: FrictionSignalKey,
): FrictionCounters {
  return { ...counters, [key]: 0 };
}

/**
 * Keep session counters intact for analytics / ML fold, but for Decision Engine
 * zero out help-relevant signals whose last fire is older than `windowMs`.
 *
 * When `timestamps` is null/undefined, no filtering is applied (compat).
 * When provided, a positive count without a timestamp is treated as stale.
 */
export function filterCountersByFreshness(
  counters: FrictionCounters,
  timestamps: FrictionSignalTimestamps | null | undefined,
  options?: { windowMs?: number; now?: number },
): FreshFrictionCountersResult {
  const windowMs = options?.windowMs ?? DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS;
  const now = options?.now ?? Date.now();

  if (timestamps == null) {
    return { counters: { ...counters }, droppedKeys: [], windowMs };
  }

  let next = { ...counters };
  const droppedKeys: FrictionSignalKey[] = [];

  for (const entry of FRICTION_SIGNAL_CATALOG) {
    if (!entry.contributesToHelp) continue;
    const count = counterValueForSignal(counters, entry.key);
    if (count <= 0) continue;
    const at = timestamps[entry.key];
    const fresh = typeof at === 'number' && Number.isFinite(at) && now - at <= windowMs;
    if (!fresh) {
      next = zeroHelpSignal(next, entry.key);
      droppedKeys.push(entry.key);
    }
  }

  return { counters: next, droppedKeys, windowMs };
}

export function isFrictionSignalFresh(
  key: FrictionSignalKey,
  timestamps: FrictionSignalTimestamps | null | undefined,
  options?: { windowMs?: number; now?: number },
): boolean {
  if (timestamps == null) return true;
  const windowMs = options?.windowMs ?? DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS;
  const now = options?.now ?? Date.now();
  const at = timestamps[key];
  return typeof at === 'number' && Number.isFinite(at) && now - at <= windowMs;
}
