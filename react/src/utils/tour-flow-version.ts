import { GuidedTour, TriggerConditions } from '../types';

const ACTIVE_TOUR_SESSION_KEY_BASE = '__trustdev_active_tour_session_v1';

type ContextualEngineMetadata = {
  flowVersion?: unknown;
};

function readContextualEngine(
  triggerConditions?: TriggerConditions,
): ContextualEngineMetadata | undefined {
  const raw = triggerConditions as Record<string, unknown> | undefined;
  const contextual = raw?.contextualEngine;
  if (!contextual || typeof contextual !== 'object') return undefined;
  return contextual as ContextualEngineMetadata;
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

  // Avoid replaying tours from another local test app on the same org + URL.
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
  if (!tourFlowVersion) return false;
  return tourFlowVersion === scope;
}
