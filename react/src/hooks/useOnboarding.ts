import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GuidedTour, SDKConfig } from '../types';
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

export interface UseOnboardingOptions {
  config?: Partial<SDKConfig>;
  autoStart?: boolean;
  debug?: boolean;
  role?: string;
}

export function useOnboarding(options?: UseOnboardingOptions) {
  const pageUrl = getCurrentPageUrl();
  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null);
  const displaysRef = useRef<Record<string, number>>({});

  const debug = useOnboardingDebug({ enabled: options?.debug });
  const session = useOnboardingSession();
  const activeTours = useActiveToursForUrl(options?.config, { autoFetch: true, url: pageUrl });
  const tour = useTour({ autoOpen: false });
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
    const sorted = [...tours].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return sorted[0] || null;
  }, []);

  const start = useCallback(
    async (tourToStart?: GuidedTour) => {
      const candidate = tourToStart || pickTour(activeTours.tours);
      if (!candidate) {
        debug.info('No tour candidate for this page');
        return;
      }

      setActiveTour(candidate);
      increaseVisitCount(pageUrl);

      if (candidate.id) {
        displaysRef.current[candidate.id] = (displaysRef.current[candidate.id] || 0) + 1;
      }

      const initialIndex = tourProgress.progress?.stepIndex ?? 0;
      tour.startTour(candidate, initialIndex);
      debug.info('Tour started', { tourId: candidate.id, initialIndex });

      const step = candidate.steps[initialIndex];
      if (step?.targetSelector) {
        const target = await resolver.resolveTarget(step.targetSelector, {
          retries: 8,
          intervalMs: 250,
        });

        if (!target) {
          debug.warn('Target selector not found for first step', { selector: step.targetSelector });
        }
      }
    },
    [activeTours.tours, debug, pageUrl, pickTour, resolver, tour, tourProgress.progress?.stepIndex],
  );

  const stop = useCallback(() => {
    tour.closeTour();
    debug.info('Tour stopped');
  }, [debug, tour]);

  useEffect(() => {
    if (!activeTour?.id) return;
    tourProgress.setStepIndex(tour.currentStepIndex);
  }, [activeTour?.id, tour.currentStepIndex, tourProgress]);

  useEffect(() => {
    if (!options?.autoStart) return;
    if (tour.isOpen) return;
    if (activeTours.loading) return;
    if (activeTours.tours.length === 0) return;
    if (!triggerCheck.shouldStart) {
      debug.info('Tour blocked by trigger conditions', triggerCheck.reasons);
      return;
    }

    void start();
  }, [
    activeTours.loading,
    activeTours.tours,
    debug,
    options?.autoStart,
    start,
    tour.isOpen,
    triggerCheck.reasons,
    triggerCheck.shouldStart,
  ]);

  const refresh = useCallback(async () => {
    const tours = await activeTours.refresh(pageUrl);
    return tours;
  }, [activeTours, pageUrl]);

  useRealtimeToursSync({
    enabled: options?.config?.syncEnabled,
    intervalMs: options?.config?.syncIntervalMs,
    syncOnFocus: options?.config?.syncOnFocus,
    syncOnReconnect: options?.config?.syncOnReconnect,
    onSync: refresh,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      debug.warn('Realtime tours sync failed', { message });
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
      activeTours.tours,
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
