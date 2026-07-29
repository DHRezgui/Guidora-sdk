import type { FrictionCounters } from '../types';
import type { FrictionLevel } from './friction-explanation';
import type { HelpDecisionVia } from './friction-decision-engine';

/**
 * Foundation for future labeled outcomes (no LightGBM retrain yet).
 * Counters are stored non-folded (distinct Phase 1–4 signals).
 */

export type HelpOutcomeType = 'help_offered' | 'help_accepted' | 'help_dismissed';

export type HelpOutcomeCountersSnapshot = FrictionCounters;

export interface HelpOutcomeEvent {
  type: HelpOutcomeType;
  via?: HelpDecisionVia | string | null;
  reason?: string;
  frictionLevel?: FrictionLevel;
  counters: HelpOutcomeCountersSnapshot;
  mlRisk?: number | null;
  sessionSeconds?: number;
  pageSeconds?: number;
  idleSeconds?: number;
  at: number;
}

type HelpOutcomeListener = (event: HelpOutcomeEvent) => void;

const listeners = new Set<HelpOutcomeListener>();
const recentOutcomes: HelpOutcomeEvent[] = [];
const MAX_RECENT = 50;

export function subscribeHelpOutcomes(listener: HelpOutcomeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHelpOutcome(event: HelpOutcomeEvent): void {
  recentOutcomes.push(event);
  if (recentOutcomes.length > MAX_RECENT) {
    recentOutcomes.splice(0, recentOutcomes.length - MAX_RECENT);
  }
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore consumer errors.
    }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<HelpOutcomeEvent>('trustdev:help-outcome', { detail: event }),
    );
  }
}

export function getRecentHelpOutcomes(): readonly HelpOutcomeEvent[] {
  return recentOutcomes;
}

export function clearHelpOutcomesForTests(): void {
  recentOutcomes.length = 0;
  listeners.clear();
}

/** Compact JSON shape for docs / future ingest. */
export function serializeHelpOutcome(event: HelpOutcomeEvent): Record<string, unknown> {
  return {
    type: event.type,
    via: event.via ?? null,
    reason: event.reason ?? null,
    frictionLevel: event.frictionLevel ?? null,
    mlRisk: event.mlRisk ?? null,
    sessionSeconds: event.sessionSeconds ?? null,
    pageSeconds: event.pageSeconds ?? null,
    idleSeconds: event.idleSeconds ?? null,
    at: event.at,
    counters: { ...event.counters },
  };
}
