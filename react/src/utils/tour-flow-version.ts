import { GuidedTour, TriggerConditions } from '../types';

const ACTIVE_TOUR_SESSION_KEY_BASE = '__trustdev_active_tour_session_v1';

type ContextualEngineMetadata = {
  flowVersion?: unknown;
  source?: unknown;
};

function readContextualEngine(
  triggerConditions?: TriggerConditions,
): ContextualEngineMetadata | undefined {
  const raw = triggerConditions as Record<string, unknown> | undefined;
  const contextual = raw?.contextualEngine;
  if (!contextual || typeof contextual !== 'object') return undefined;
  return contextual as ContextualEngineMetadata;
}

function isDashboardConcatTour(tour: GuidedTour): boolean {
  return readContextualEngine(tour.triggerConditions)?.source === 'dashboard-concat';
}

export function getTourContextualFlowVersion(tour: GuidedTour): string | undefined {
  const flowVersion = readContextualEngine(tour.triggerConditions)?.flowVersion;
  return typeof flowVersion === 'string' && flowVersion.trim() ? flowVersion.trim() : undefined;
}

export function filterActiveToursByFlowVersion(
  tours: GuidedTour[],
  activeFlowVersion?: string,
): GuidedTour[] {
  const scope = activeFlowVersion?.trim();
  if (!scope) return tours;

  const matching = tours.filter((tour) => getTourContextualFlowVersion(tour) === scope);
  if (matching.length > 0) return matching;

  // Dashboard concat tours inherit flowVersion when created; older rows may only
  // carry source=dashboard-concat — still allow them on this URL.
  const concatTours = tours.filter(isDashboardConcatTour);
  if (concatTours.length > 0) return concatTours;

  // Manual dashboard tours without contextualEngine: only when every active
  // candidate lacks a flow scope (avoids mixing test apps on the same org + URL).
  const unscoped = tours.filter((tour) => !getTourContextualFlowVersion(tour));
  if (unscoped.length > 0 && unscoped.length === tours.length) return unscoped;

  return [];
}

export function getActiveTourSessionStorageKey(activeFlowVersion?: string): string {
  const scope = activeFlowVersion?.trim();
  if (!scope) return ACTIVE_TOUR_SESSION_KEY_BASE;
  return `${ACTIVE_TOUR_SESSION_KEY_BASE}::${scope}`;
}

export function isActiveTourSnapshotCompatible(
  tour: GuidedTour,
  activeFlowVersion?: string,
): boolean {
  const scope = activeFlowVersion?.trim();
  if (!scope) return true;

  const tourFlowVersion = getTourContextualFlowVersion(tour);
  if (!tourFlowVersion) {
    return isDashboardConcatTour(tour);
  }
  return tourFlowVersion === scope;
}
