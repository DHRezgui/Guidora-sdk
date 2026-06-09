import type { PublishContextualDraftsResponse, SuggestedTourDraft } from '../types';

export const AUTOPUBLISHED_SIGNATURES_STORAGE_KEY = '__trustdev_autopublished_signatures_v1';
export const AUTOPUBLISHED_TOUR_ID_MAP_STORAGE_KEY = '__trustdev_autopublished_tour_map_v1';

function getAutoPublishStorageScope(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    const raw = window.localStorage.getItem('auth_user');
    if (!raw) return 'anonymous';
    const user = JSON.parse(raw) as { id?: string; email?: string };
    if (typeof user.id === 'string' && user.id.trim()) return user.id.trim();
    if (typeof user.email === 'string' && user.email.trim()) {
      return user.email.trim().toLowerCase();
    }
  } catch {
    // Ignore malformed auth_user payload.
  }
  return 'anonymous';
}

function scopedStorageKey(baseKey: string): string {
  return `${baseKey}:${getAutoPublishStorageScope()}`;
}

/** Drop legacy unscoped keys so a prior session cannot block republication after tour delete. */
function clearLegacyUnscopedAutoPublishStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(AUTOPUBLISHED_SIGNATURES_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTOPUBLISHED_TOUR_ID_MAP_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export interface AutoPublishDedupeTourShape {
  id?: string;
  targetUrl?: string;
  steps?: Array<{ targetSelector?: string; orderIndex?: number }>;
  triggerConditions?: {
    contextualEngine?: {
      flowSignature?: string;
      intent?: string;
    };
  };
}

function sortTourSteps<T extends { orderIndex?: number }>(steps: T[] | undefined): T[] {
  if (!steps?.length) return [];
  return [...steps].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

export function computeDraftDedupeSignature(draft: SuggestedTourDraft): string {
  const flowSignature = draft.flowVersioning?.flowSignature ?? 'no-sig';
  const url = draft.targetUrl ?? '';
  const intent = draft.intent ?? '';
  const firstSelector = draft.steps[0]?.targetSelector ?? '';
  const stepCount = draft.steps.length;
  return [flowSignature, url, intent, firstSelector, String(stepCount)].join('|');
}

/** Préfixe stable (aligné sur la dédup backend : url + intent + flowSignature). */
export function computeStableAutoPublishDedupePrefix(tour: AutoPublishDedupeTourShape): string | null {
  const engine = tour.triggerConditions?.contextualEngine;
  const flowSignature = engine?.flowSignature;
  if (!flowSignature) return null;
  const url = tour.targetUrl ?? '';
  const intent = engine.intent ?? '';
  return [flowSignature, url, intent].join('|');
}

/** Même clé que `computeDraftDedupeSignature` pour un parcours déjà persisté. */
export function computeAutoPublishDedupeSignatureFromTour(tour: AutoPublishDedupeTourShape): string {
  const engine = tour.triggerConditions?.contextualEngine;
  const flowSignature = engine?.flowSignature ?? 'no-sig';
  const url = tour.targetUrl ?? '';
  const intent = engine?.intent ?? '';
  const orderedSteps = sortTourSteps(tour.steps);
  const firstSelector = orderedSteps[0]?.targetSelector ?? '';
  const stepCount = orderedSteps.length;
  return [flowSignature, url, intent, firstSelector, String(stepCount)].join('|');
}

export function readAutoPublishedSignatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  clearLegacyUnscopedAutoPublishStorage();
  try {
    const raw = window.sessionStorage.getItem(scopedStorageKey(AUTOPUBLISHED_SIGNATURES_STORAGE_KEY));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

export function readAutoPublishedTourIdMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(scopedStorageKey(AUTOPUBLISHED_TOUR_ID_MAP_STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const map: Record<string, string> = {};
    for (const [tourId, signature] of Object.entries(parsed)) {
      if (typeof tourId === 'string' && typeof signature === 'string') {
        map[tourId] = signature;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function persistAutoPublishedSignatures(signatures: Set<string>): void {
  if (typeof window === 'undefined') return;
  clearLegacyUnscopedAutoPublishStorage();
  try {
    window.sessionStorage.setItem(
      scopedStorageKey(AUTOPUBLISHED_SIGNATURES_STORAGE_KEY),
      JSON.stringify(Array.from(signatures)),
    );
  } catch {
    // ignore storage failures
  }
}

function persistAutoPublishedTourIdMap(map: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      scopedStorageKey(AUTOPUBLISHED_TOUR_ID_MAP_STORAGE_KEY),
      JSON.stringify(map),
    );
  } catch {
    // ignore
  }
}

export function removeAutoPublishedSignatures(signatures: string[]): void {
  if (typeof window === 'undefined' || signatures.length === 0) return;
  const stored = readAutoPublishedSignatures();
  let changed = false;
  for (const signature of signatures) {
    if (stored.delete(signature)) changed = true;
  }
  if (changed) persistAutoPublishedSignatures(stored);
}

export function recordAutoPublishedSignaturesFromReport(
  report: PublishContextualDraftsResponse['report'],
  candidates: SuggestedTourDraft[],
): void {
  if (typeof window === 'undefined' || report.created <= 0) return;

  const signatures = readAutoPublishedSignatures();
  const tourMap = readAutoPublishedTourIdMap();
  let changed = false;

  for (const detail of report.details ?? []) {
    if (!detail.tourId) continue;
    if (detail.outcome !== 'created' && detail.outcome !== 'activated') continue;

    const draft = candidates.find((candidate) => candidate.name === detail.draftName);
    if (!draft) continue;

    const signature = computeDraftDedupeSignature(draft);
    if (!signatures.has(signature)) {
      signatures.add(signature);
      changed = true;
    }
    if (tourMap[detail.tourId] !== signature) {
      tourMap[detail.tourId] = signature;
      changed = true;
    }
  }

  if (changed) {
    persistAutoPublishedSignatures(signatures);
    persistAutoPublishedTourIdMap(tourMap);
  }
}

/** À appeler quand un parcours est supprimé du dashboard : libère la republication auto en session. */
export function removeAutoPublishedSignaturesForTour(tour: AutoPublishDedupeTourShape): void {
  if (typeof window === 'undefined') return;
  clearLegacyUnscopedAutoPublishStorage();

  const toRemove = new Set<string>();
  const tourMap = readAutoPublishedTourIdMap();

  if (tour.id && tourMap[tour.id]) {
    toRemove.add(tourMap[tour.id]);
    delete tourMap[tour.id];
    persistAutoPublishedTourIdMap(tourMap);
  }

  toRemove.add(computeAutoPublishDedupeSignatureFromTour(tour));

  const stablePrefix = computeStableAutoPublishDedupePrefix(tour);
  if (stablePrefix) {
    const prefixWithSep = `${stablePrefix}|`;
    for (const signature of readAutoPublishedSignatures()) {
      if (signature.startsWith(prefixWithSep)) toRemove.add(signature);
    }
  }

  removeAutoPublishedSignatures(Array.from(toRemove));
}

/** Retire les entrées session liées à des parcours qui n’existent plus en base. */
export function pruneAutoPublishedSessionAgainstExistingTourIds(existingTourIds: string[]): void {
  if (typeof window === 'undefined') return;

  const idSet = new Set(existingTourIds.filter(Boolean));
  const tourMap = readAutoPublishedTourIdMap();
  const signatures = readAutoPublishedSignatures();
  let changed = false;

  for (const [tourId, signature] of Object.entries(tourMap)) {
    if (!idSet.has(tourId)) {
      delete tourMap[tourId];
      if (signatures.delete(signature)) changed = true;
    }
  }

  if (changed) {
    persistAutoPublishedSignatures(signatures);
    persistAutoPublishedTourIdMap(tourMap);
  }
}

/**
 * Nettoie les signatures orphelines (ex. ancienne session sans tourId)
 * en les comparant aux parcours contextual encore présents.
 */
export function reconcileAutoPublishedSessionWithTours(tours: AutoPublishDedupeTourShape[]): void {
  if (typeof window === 'undefined') return;
  clearLegacyUnscopedAutoPublishStorage();

  pruneAutoPublishedSessionAgainstExistingTourIds(
    tours.map((tour) => tour.id).filter((id): id is string => Boolean(id)),
  );

  const signatures = readAutoPublishedSignatures();
  if (signatures.size === 0) return;

  const stillValid = new Set<string>();
  const activePrefixes = new Set<string>();

  for (const tour of tours) {
    if (!tour.triggerConditions?.contextualEngine?.flowSignature) continue;
    stillValid.add(computeAutoPublishDedupeSignatureFromTour(tour));
    const prefix = computeStableAutoPublishDedupePrefix(tour);
    if (prefix) activePrefixes.add(prefix);
  }

  let changed = false;
  for (const signature of [...signatures]) {
    if (stillValid.has(signature)) continue;

    const signaturePrefix = signature.split('|').slice(0, 3).join('|');
    if (activePrefixes.has(signaturePrefix)) continue;

    signatures.delete(signature);
    changed = true;
  }

  if (changed) persistAutoPublishedSignatures(signatures);
}
