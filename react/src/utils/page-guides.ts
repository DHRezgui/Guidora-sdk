import type { GuidedTour } from '../types';
import { isTourFinishedLocally } from './tour-audience-finish';
import {
  filterActiveToursByFlowVersion,
  getTourContextualFlowVersion,
} from './tour-flow-version';

export type PageGuideStatus = 'available' | 'in_progress' | 'completed_local';

export interface PageGuideItem {
  id: string;
  name: string;
  stepCount: number;
  status: PageGuideStatus;
  tour: GuidedTour;
}

export const DEFAULT_PAGE_GUIDES_LIMIT = Infinity;

const STATUS_RANK: Record<PageGuideStatus, number> = {
  in_progress: 0,
  available: 1,
  completed_local: 2,
};

/** Session memory so Relancer still works after `/tours/active` drops completed tours. */
const rememberedGuidesByScope = new Map<string, Map<string, GuidedTour>>();

function readContextualSource(tour: GuidedTour): string | undefined {
  const raw = tour.triggerConditions as Record<string, unknown> | undefined;
  const contextual = raw?.contextualEngine;
  if (!contextual || typeof contextual !== 'object') return undefined;
  const source = (contextual as { source?: unknown }).source;
  return typeof source === 'string' ? source : undefined;
}

/**
 * Lenient flow filter for Guides (not autostart).
 * Prefer exact flowVersion matches, then dashboard-concat, then unscoped —
 * even when other scoped (non-matching) tours are present.
 */
export function filterToursForPageGuides(
  tours: GuidedTour[],
  activeFlowVersion?: string | null,
): GuidedTour[] {
  const scope = activeFlowVersion?.trim();
  if (!scope) return tours;

  const matching = filterActiveToursByFlowVersion(tours, scope);
  if (matching.length > 0) return matching;

  const concatTours = tours.filter((tour) => readContextualSource(tour) === 'dashboard-concat');
  if (concatTours.length > 0) return concatTours;

  return tours.filter((tour) => !getTourContextualFlowVersion(tour));
}

export function buildPageGuidesScopeKey(input: {
  organizationId?: string | null;
  flowVersion?: string | null;
  pageKey?: string | null;
}): string {
  return [
    input.organizationId?.trim() || 'org',
    input.flowVersion?.trim() || 'flow',
    input.pageKey?.trim() || 'page',
  ].join('::');
}

export function rememberPageGuideTours(scopeKey: string, tours: GuidedTour[]): void {
  if (!scopeKey) return;
  let bucket = rememberedGuidesByScope.get(scopeKey);
  if (!bucket) {
    bucket = new Map();
    rememberedGuidesByScope.set(scopeKey, bucket);
  }
  for (const tour of tours) {
    const id = tour.id?.trim();
    if (!id) continue;
    bucket.set(id, tour);
  }
}

export function getRememberedPageGuideTours(scopeKey: string): GuidedTour[] {
  if (!scopeKey) return [];
  const bucket = rememberedGuidesByScope.get(scopeKey);
  return bucket ? [...bucket.values()] : [];
}

/** Test helper */
export function clearRememberedPageGuideToursForTests(): void {
  rememberedGuidesByScope.clear();
}

export function mergeToursForPageGuides(input: {
  liveTours: GuidedTour[];
  rememberedTours?: GuidedTour[];
  activeTour?: GuidedTour | null;
}): GuidedTour[] {
  const byId = new Map<string, GuidedTour>();
  for (const tour of input.rememberedTours ?? []) {
    const id = tour.id?.trim();
    if (id && tour.showInGuides === true) byId.set(id, tour);
  }
  for (const tour of input.liveTours) {
    const id = tour.id?.trim();
    if (id && tour.showInGuides === true) byId.set(id, tour);
  }
  const active = input.activeTour;
  const activeId = active?.id?.trim();
  // Only surface the open tour if it is already a curated guide (or already in catalog).
  if (active && activeId && (active.showInGuides === true || byId.has(activeId))) {
    byId.set(activeId, active);
  }
  return [...byId.values()];
}

/**
 * Builds a short, on-demand guide list for the Aide sidebar.
 * Source must be curated (`showInGuides`) — typically `GET /tours/guides/url`.
 * Includes finished tours (for Relancer) — unlike autostart candidates.
 */
export function buildPageGuides(input: {
  tours: GuidedTour[];
  flowVersion?: string | null;
  activeTourId?: string | null;
  /** Optional cap. Omit or pass Infinity / <=0 to return the full curated list. */
  limit?: number;
}): PageGuideItem[] {
  const curated = input.tours.filter((tour) => tour.showInGuides === true);
  const scoped = filterToursForPageGuides(curated, input.flowVersion);

  const items: PageGuideItem[] = [];
  for (const tour of scoped) {
    const id = tour.id?.trim();
    if (!id) continue;

    let status: PageGuideStatus = 'available';
    if (input.activeTourId && id === input.activeTourId) {
      status = 'in_progress';
    } else if (isTourFinishedLocally(tour)) {
      status = 'completed_local';
    }

    items.push({
      id,
      name: tour.name?.trim() || 'Parcours guidé',
      stepCount: Array.isArray(tour.steps) ? tour.steps.length : 0,
      status,
      tour,
    });
  }

  items.sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const byPriority = (b.tour.priority || 0) - (a.tour.priority || 0);
    if (byPriority !== 0) return byPriority;
    return a.name.localeCompare(b.name, 'fr');
  });

  const limit = input.limit;
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    return items.slice(0, Math.floor(limit));
  }
  return items;
}

export function pageGuideCtaLabel(status: PageGuideStatus): string {
  if (status === 'in_progress') return 'Continuer';
  if (status === 'completed_local') return 'Relancer';
  return 'Lancer';
}

export function pageGuideStatusLabel(status: PageGuideStatus): string | null {
  if (status === 'in_progress') return 'En cours';
  if (status === 'completed_local') return 'Déjà vu';
  return null;
}
