import { useEffect, useMemo, useRef, useState } from 'react';
import { EventType, FrictionCounters, SDKConfig, TrackEventInput } from '../types';
import { getCurrentPageUrl } from '../utils/url';
import { useOnboardingSession } from './useOnboardingSession';
import { useTrackBatch } from './useTrackBatch';

export interface UseFrictionDetectionOptions {
  enabled?: boolean;
  organizationId?: string;
  userId?: string;
  config?: Partial<SDKConfig>;
  trackRawEvents?: boolean;
  excessiveTimeThresholdSec?: number;
}

const INITIAL_COUNTERS: FrictionCounters = {
  clickMiss: 0,
  scrollHesitation: 0,
  timeOnPageExcessive: 0,
  formAbandonment: 0,
  navigationBack: 0,
};

export function useFrictionDetection(options?: UseFrictionDetectionOptions) {
  const enabled = options?.enabled ?? true;
  const excessiveTimeThresholdSec = options?.excessiveTimeThresholdSec ?? 45;
  const [counters, setCounters] = useState<FrictionCounters>(INITIAL_COUNTERS);
  const [isRunning, setIsRunning] = useState(enabled);
  const startTimeRef = useRef<number>(Date.now());
  const hasFlaggedTimeRef = useRef(false);
  const recentScrollRef = useRef<number[]>([]);

  const { sessionId } = useOnboardingSession();
  const { enqueueEvent } = useTrackBatch(options?.config);

  const organizationId =
    options?.organizationId || options?.config?.organizationId || options?.config?.apiKey || 'unknown-org';

  useEffect(() => {
    setIsRunning(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!isRunning || typeof window === 'undefined') return;

    const pushEvent = async (eventType: EventType, partial: Partial<TrackEventInput>) => {
      const event: TrackEventInput = {
        sessionId,
        organizationId,
        userId: options?.userId,
        eventType,
        pageUrl: getCurrentPageUrl(),
        timeOnPage: Math.floor((Date.now() - startTimeRef.current) / 1000),
        ...partial,
      };

      await enqueueEvent(event);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (options?.trackRawEvents) {
        void pushEvent('CLICK', {
          elementSelector: target.tagName.toLowerCase(),
          elementText: (target.textContent || '').slice(0, 120),
        });
      }

      if (target === document.body || target === document.documentElement) {
        setCounters((prev) => ({ ...prev, clickMiss: prev.clickMiss + 1 }));
      }
    };

    const onScroll = () => {
      const now = Date.now();
      recentScrollRef.current.push(now);
      recentScrollRef.current = recentScrollRef.current.filter((t) => now - t < 2500);

      if (recentScrollRef.current.length >= 6) {
        setCounters((prev) => ({ ...prev, scrollHesitation: prev.scrollHesitation + 1 }));
        recentScrollRef.current = [];
      }

      if (options?.trackRawEvents) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const scrollDepth = maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0;
        void pushEvent('SCROLL', { scrollDepth });
      }
    };

    const onPopState = () => {
      setCounters((prev) => ({ ...prev, navigationBack: prev.navigationBack + 1 }));
    };

    const onBeforeUnload = () => {
      const hasDirtyForm = Array.from(document.querySelectorAll('form')).some((form) => {
        const elements = Array.from(form.querySelectorAll('input, textarea')) as Array<
          HTMLInputElement | HTMLTextAreaElement
        >;
        return elements.some((field) => field.value && field.value.length > 0);
      });

      if (hasDirtyForm) {
        setCounters((prev) => ({ ...prev, formAbandonment: prev.formAbandonment + 1 }));
      }
    };

    const interval = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (!hasFlaggedTimeRef.current && elapsedSec >= excessiveTimeThresholdSec) {
        hasFlaggedTimeRef.current = true;
        setCounters((prev) => ({ ...prev, timeOnPageExcessive: prev.timeOnPageExcessive + 1 }));
      }
    }, 1000);

    window.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [
    enqueueEvent,
    excessiveTimeThresholdSec,
    isRunning,
    options?.trackRawEvents,
    options?.userId,
    organizationId,
    sessionId,
  ]);

  const api = useMemo(
    () => ({
      counters,
      isRunning,
      start: () => setIsRunning(true),
      stop: () => setIsRunning(false),
      reset: () => {
        startTimeRef.current = Date.now();
        hasFlaggedTimeRef.current = false;
        setCounters(INITIAL_COUNTERS);
      },
    }),
    [counters, isRunning],
  );

  return api;
}
