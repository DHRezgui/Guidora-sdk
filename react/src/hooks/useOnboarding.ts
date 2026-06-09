import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import { GuidedTour, SDKConfig, Step } from '../types';
import {
  filterActiveToursByFlowVersion,
  getActiveTourSessionStorageKey,
  isActiveTourSnapshotCompatible,
} from '../utils/tour-flow-version';
import { increaseVisitCount } from '../utils/storage';
import { getCurrentPageUrl } from '../utils/url';
import { useActiveToursForUrl } from './useActiveToursForUrl';
import { useFrictionDetection } from './useFrictionDetection';
import { useFrictionScore } from './useFrictionScore';
import { useOnboardingDebug } from './useOnboardingDebug';
import { useOnboardingSession } from './useOnboardingSession';
import { useRealtimeToursSync } from './useRealtimeToursSync';
import { useTour } from './useTour';
import { useTourProgress } from './useTourProgress';
import { useTourTargetResolver } from './useTourTargetResolver';
import { useTourTriggerConditions } from './useTourTriggerConditions';
import {
  clearTourFinishedForAudience,
  isTourFinishedLocally,
  markTourFinishedForAudience,
} from '../utils/tour-audience-finish';

export interface UseOnboardingOptions {
  config?: Partial<SDKConfig>;
  autoStart?: boolean;
  debug?: boolean;
  role?: string;
  /** When set (e.g. contextualSuggestions.flowVersion), only active tours for this flow are started. */
  activeFlowVersion?: string;
}

type ActiveTourSessionSnapshot = {
  tour: GuidedTour;
  stepIndex: number;
  savedAt: number;
};

function readActiveTourSnapshot(storageKey: string): ActiveTourSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTourSessionSnapshot;
    if (!parsed?.tour || !Array.isArray(parsed.tour.steps)) return null;
    if (typeof parsed.stepIndex !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeActiveTourSnapshot(storageKey: string, snapshot: ActiveTourSessionSnapshot | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!snapshot) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore session storage write errors.
  }
}

function sortStepsForFingerprint(steps: Step[]): Step[] {
  return [...steps]
    .map((step, idx) => ({ step, idx }))
    .sort((a, b) => {
      const ao = typeof a.step.orderIndex === 'number' ? a.step.orderIndex : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.step.orderIndex === 'number' ? b.step.orderIndex : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.idx - b.idx;
    })
    .map((entry) => entry.step);
}

/** Detects editor/API changes so we can hot-apply a new tour definition without reloading the page. */
function resolveDismissCompleteAudience(
  tour: GuidedTour,
  configAudience?: 'sandbox' | 'production',
): 'sandbox' | 'production' | undefined {
  if (configAudience) {
    return configAudience;
  }
  const environment = tour.environment?.toLowerCase();
  if (environment === 'sandbox') {
    return 'sandbox';
  }
  if (tour.isSandboxTestActive) {
    return 'sandbox';
  }
  if (tour.isActive) {
    return 'production';
  }
  return undefined;
}

function tourDefinitionFingerprint(tour: GuidedTour | null | undefined): string {
  if (!tour?.steps?.length) return '';
  const steps = sortStepsForFingerprint(tour.steps);
  const rows = steps.map((s) =>
    [
      s.id,
      s.orderIndex,
      s.skipAllowed,
      s.highlightElement,
      s.targetSelector,
      s.stepTargetUrl,
      s.position,
      s.action,
      s.stepType,
    ].join(':'),
  );
  return `${tour.updatedAt || ''}#${tour.id || ''}#${rows.join('>')}`;
}

export function useOnboarding(options?: UseOnboardingOptions) {
  const pageUrl = getCurrentPageUrl();
  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null);
  const displaysRef = useRef<Record<string, number>>({});
  const dismissedTourIdsRef = useRef<Set<string>>(new Set());
  const suppressAutostartUntilRef = useRef(0);
  const isSuppressed = () => Date.now() < suppressAutostartUntilRef.current;

  const debug = useOnboardingDebug({ enabled: options?.debug });
  const debugInfo = debug.info;
  const debugWarn = debug.warn;
  const deactivateTour = useCallback(
    async (tourToDeactivate: GuidedTour, reason: 'skip' | 'complete') => {
      if (!tourToDeactivate?.id) return;
      const config = resolveSDKConfig(options?.config);
      const audience = resolveDismissCompleteAudience(tourToDeactivate, config.tourAudience);
      if (audience) {
        markTourFinishedForAudience(tourToDeactivate.id, audience);
      }
      try {
        if (reason === 'complete') {
          await sdkApiClient.completeTourForCurrentUser(config, tourToDeactivate.id, audience);
        } else {
          await sdkApiClient.dismissTourForCurrentUser(config, tourToDeactivate.id, audience);
        }
        debugInfo('Tour user-state updated after user action', {
          tourId: tourToDeactivate.id,
          reason,
          audience,
        });
      } catch (error) {
        debugWarn('Failed to update tour user-state after user action', {
          tourId: tourToDeactivate?.id,
          reason,
          audience,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [debugInfo, debugWarn, options?.config],
  );

  const session = useOnboardingSession();
  const activeFlowVersion = options?.activeFlowVersion?.trim() || undefined;
  const activeTourSessionKey = getActiveTourSessionStorageKey(activeFlowVersion);
  const activeTours = useActiveToursForUrl(options?.config, { autoFetch: true, url: pageUrl });
  const toursForFlow = useMemo(() => {
    const forFlow = filterActiveToursByFlowVersion(activeTours.tours, activeFlowVersion);
    return forFlow.filter((item) => !isTourFinishedLocally(item));
  }, [activeFlowVersion, activeTours.tours]);
  const tour = useTour({
    autoOpen: false,
    onComplete: (completedTour) => {
      if (completedTour?.id) {
        dismissedTourIdsRef.current.add(completedTour.id);
      }
      // Prevent immediate restart from stale active tours response.
      suppressAutostartUntilRef.current = Date.now() + 12000;
      writeActiveTourSnapshot(activeTourSessionKey, null);
      setActiveTour(null);
      void deactivateTour(completedTour, 'complete');
      void activeTours.refresh(pageUrl).catch(() => undefined);
    },
    onSkip: (skippedTour) => {
      if (skippedTour?.id) {
        dismissedTourIdsRef.current.add(skippedTour.id);
      }
      // Prevent immediate restart from stale active tours response.
      suppressAutostartUntilRef.current = Date.now() + 12000;
      writeActiveTourSnapshot(activeTourSessionKey, null);
      setActiveTour(null);
      void deactivateTour(skippedTour, 'skip');
      void activeTours.refresh(pageUrl).catch(() => undefined);
    },
  });
  const tourProgress = useTourProgress(activeTour?.id);
  const resolver = useTourTargetResolver();
  const friction = useFrictionDetection({
    enabled: options?.autoStart ?? true,
    config: options?.config,
    organizationId: options?.config?.organizationId,
  });
  const frictionScore = useFrictionScore(friction.counters);

  const triggerCheck = useTourTriggerConditions(activeTour?.triggerConditions, {
    currentRole: options?.role,
    displays: activeTour?.id ? displaysRef.current[activeTour.id] || 0 : 0,
    pageUrl,
    timeOnPageSeconds: Math.floor((Date.now() - session.startedAt) / 1000),
  });

  const pickTour = useCallback((tours: GuidedTour[]): GuidedTour | null => {
    if (!tours.length) return null;
    const eligible = tours.filter((tourItem) => {
      if (!tourItem?.id) return true;
      if (dismissedTourIdsRef.current.has(tourItem.id)) return false;
      if (isTourFinishedLocally(tourItem)) return false;
      return true;
    });
    if (!eligible.length) return null;
    const sorted = [...eligible].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sorted[0] || null;
  }, []);

  const start = useCallback(
    async (tourToStart?: GuidedTour) => {
      const candidate = tourToStart || pickTour(toursForFlow);
      if (!candidate) {
        debugInfo('No tour candidate for this page');
        return;
      }
      if (candidate.id && dismissedTourIdsRef.current.has(candidate.id)) {
        debugInfo('Skipping dismissed tour restart', { tourId: candidate.id });
        return;
      }
      if (!tourToStart && isSuppressed()) {
        debugInfo('Skipping autostart during suppression window', {
          suppressedUntil: suppressAutostartUntilRef.current,
        });
        return;
      }

      setActiveTour(candidate);
      increaseVisitCount(pageUrl);

      if (candidate.id) {
        displaysRef.current[candidate.id] = (displaysRef.current[candidate.id] || 0) + 1;
      }

      const initialIndex = tourProgress.progress?.stepIndex ?? 0;
      tour.startTour(candidate, initialIndex);
      debugInfo('Tour started', { tourId: candidate.id, initialIndex });

      const step = candidate.steps[initialIndex];
      if (step?.targetSelector) {
        const target = await resolver.resolveTarget(step.targetSelector, {
          retries: 8,
          intervalMs: 250,
        });

        if (!target) {
          debugWarn('Target selector not found for first step', { selector: step.targetSelector });
        }
      }
    },
    [toursForFlow, debugInfo, debugWarn, pageUrl, pickTour, resolver, tour, tourProgress.progress?.stepIndex],
  );

  const stop = useCallback(() => {
    tour.closeTour();
    writeActiveTourSnapshot(activeTourSessionKey, null);
    debugInfo('Tour stopped');
  }, [activeTourSessionKey, debugInfo, tour]);

  useEffect(() => {
    if (!activeTour?.id) return;
    tourProgress.setStepIndex(tour.currentStepIndex);
  }, [activeTour?.id, tour.currentStepIndex, tourProgress.setStepIndex]);

  useEffect(() => {
    if (!tour.isOpen || !activeTour) return;
    writeActiveTourSnapshot(activeTourSessionKey, {
      tour: activeTour,
      stepIndex: tour.currentStepIndex,
      savedAt: Date.now(),
    });
  }, [activeTour, activeTourSessionKey, tour.currentStepIndex, tour.isOpen]);

  useEffect(() => {
    if (!options?.autoStart) return;
    if (tour.isOpen) return;
    if (isSuppressed()) return;
    if (activeTours.loading) return;
    const snapshot = readActiveTourSnapshot(activeTourSessionKey);
    if (!snapshot) return;
    if (snapshot.tour?.id && dismissedTourIdsRef.current.has(snapshot.tour.id)) return;
    if (!isActiveTourSnapshotCompatible(snapshot.tour, activeFlowVersion)) {
      writeActiveTourSnapshot(activeTourSessionKey, null);
      return;
    }
    const stillActive = toursForFlow.some((item) => item.id === snapshot.tour.id);
    if (!stillActive) {
      writeActiveTourSnapshot(activeTourSessionKey, null);
      return;
    }

    setActiveTour(snapshot.tour);
    tour.startTour(snapshot.tour, snapshot.stepIndex);
    debugInfo('Restored active tour from session snapshot', {
      tourId: snapshot.tour.id,
      stepIndex: snapshot.stepIndex,
    });
  }, [
    activeFlowVersion,
    activeTourSessionKey,
    activeTours.loading,
    debugInfo,
    options?.autoStart,
    tour.isOpen,
    tour.startTour,
    toursForFlow,
  ]);

  useEffect(() => {
    if (!options?.autoStart) return;
    if (tour.isOpen) return;
    if (isSuppressed()) return;
    if (activeTours.loading) return;
    if (toursForFlow.length === 0) return;
    if (!triggerCheck.shouldStart) {
      debugInfo('Tour blocked by trigger conditions', triggerCheck.reasons);
      return;
    }

    void start();
  }, [
    activeTours.loading,
    activeTours.tours,
    debugInfo,
    options?.autoStart,
    start,
    tour.isOpen,
    triggerCheck.shouldStart,
  ]);

  // Apply tour edits from the dashboard as soon as `/tours/active/url` returns new data (sync interval / focus).
  useEffect(() => {
    if (!tour.isOpen || !activeTour?.id) return;
    if (activeTours.loading) return;

    const fresh = activeTours.tours.find((t) => t.id === activeTour.id);
    if (!fresh) return;

    if (tourDefinitionFingerprint(fresh) === tourDefinitionFingerprint(activeTour)) {
      return;
    }

    setActiveTour(fresh);
    const maxIdx = Math.max(0, (fresh.steps?.length ?? 1) - 1);
    tour.startTour(fresh, Math.min(tour.currentStepIndex, maxIdx));
    debugInfo('Active tour definition refreshed from server', { tourId: fresh.id });
  }, [toursForFlow, activeTours.loading, tour.isOpen, activeTour, tour, debugInfo]);

  const syncLocalFinishMarks = useCallback((tours: GuidedTour[]) => {
    for (const item of tours) {
      if (!item.id) continue;
      if (item.environment?.toLowerCase() === 'sandbox' || item.isSandboxTestActive) {
        clearTourFinishedForAudience(item.id, 'sandbox');
      }
      if (item.isActive) {
        clearTourFinishedForAudience(item.id, 'production');
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const tours = filterActiveToursByFlowVersion(await activeTours.refresh(pageUrl), activeFlowVersion);
    syncLocalFinishMarks(tours);
    return tours;
  }, [activeFlowVersion, activeTours.refresh, pageUrl, syncLocalFinishMarks]);

  useRealtimeToursSync({
    enabled: options?.config?.syncEnabled,
    intervalMs: options?.config?.syncIntervalMs,
    syncOnFocus: options?.config?.syncOnFocus,
    syncOnReconnect: options?.config?.syncOnReconnect,
    onSync: refresh,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      debugWarn('Realtime tours sync failed', { message });
    },
  });

  return useMemo(
    () => ({
      session,
      tours: activeTours.tours,
      activeTour,
      tour,
      friction,
      frictionScore,
      triggerCheck,
      resolver,
      debug,
      loading: activeTours.loading,
      error: activeTours.error,
      start,
      stop,
      refresh,
    }),
    [
      session,
      toursForFlow,
      activeTour,
      tour,
      friction,
      frictionScore,
      triggerCheck,
      resolver,
      debug,
      activeTours.loading,
      activeTours.error,
      start,
      stop,
      refresh,
    ],
  );
}
