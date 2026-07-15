import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventType, FrictionCounters, SDKConfig, TrackEventInput } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';
import { getCurrentPageUrl } from '../utils/url';
import {
  getLogicalPageKey,
  TRUSTDEV_LOCATION_CHANGE_EVENT,
} from '../utils/logical-page';
import { resolveTimeStallTier } from '../utils/friction-scoring';
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

/** Throttle raw scroll events — a few pixels on <main> can emit dozens of events. */
const SCROLL_SAMPLE_MIN_MS = 180;
/** Ignore micro-movements when detecting direction reversals. */
const SCROLL_DIRECTION_DELTA_PX = 40;
/** Count hesitation after this many up/down reversals within the window. */
const SCROLL_HESITATION_REVERSALS = 3;
const SCROLL_HESITATION_WINDOW_MS = 6_000;
const SCROLL_HESITATION_COOLDOWN_MS = 4_000;
/** Throttle pointer activity so idleSeconds can grow between moves. */
const POINTER_ACTIVITY_MARK_MIN_MS = 1_000;

/** SDK / lab chrome — not user friction / activity on the host app. */
const FRICTION_SDK_CHROME_SELECTOR = [
  '[data-sdk-lab-console]',
  '[data-sdk-lab-insights]',
  '[data-trustdev-help-sidebar]',
  '[data-trustdev-faq-panel]',
  '[data-trustdev-contextual-panel]',
  '[data-trustdev-abandonment-panel]',
  '[data-trustdev-proactive-toast-portal]',
  '[data-trustdev-proactive-toast]',
  '.trustdev-contextual-debug-panel',
  '.trustdev-abandonment-debug-panel',
  '.trustdev-help-sidebar',
  '.trustdev-faq-widget',
  '.trustdev-proactive-toast',
  '#trustdev-proactive-toast-portal',
].join(',');

const INTERACTIVE_CLICK_SELECTOR =
  'button, a[href], input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]';

function isFrictionSdkChrome(element: EventTarget | null): boolean {
  if (!(element instanceof Element)) return false;
  if (element.id === 'trustdev-proactive-toast-portal') return true;
  return Boolean(element.closest(FRICTION_SDK_CHROME_SELECTOR));
}

function isFrictionExcludedScrollSurface(element: HTMLElement): boolean {
  return isFrictionSdkChrome(element);
}

/** Dead click: non-interactive surface outside SDK chrome (includes empty card backgrounds). */
function isClickMissTarget(target: HTMLElement): boolean {
  if (isFrictionSdkChrome(target)) return false;
  if (target.closest(INTERACTIVE_CLICK_SELECTOR)) return false;
  return true;
}

function resolveScrollTop(event: Event): number | null {
  const scrollTarget = event.target;
  if (
    scrollTarget instanceof HTMLElement &&
    scrollTarget !== document.documentElement &&
    scrollTarget !== document.body
  ) {
    return scrollTarget.scrollTop;
  }

  return window.scrollY;
}

function isPrimaryScrollSurface(element: HTMLElement): boolean {
  if (element === document.documentElement || element === document.body) {
    return true;
  }

  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll < 80) {
    return false;
  }

  return element.clientHeight >= 320 || maxScroll >= 240;
}

function resolveScrollDepth(event: Event): number {
  const scrollTarget = event.target;
  if (
    scrollTarget instanceof HTMLElement &&
    scrollTarget !== document.documentElement &&
    scrollTarget !== document.body
  ) {
    const maxScroll = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    return maxScroll > 0 ? Math.round((scrollTarget.scrollTop / maxScroll) * 100) : 0;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  return maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0;
}

export function useFrictionDetection(options?: UseFrictionDetectionOptions) {
  const enabled = options?.enabled ?? true;
  const excessiveTimeThresholdSec = options?.excessiveTimeThresholdSec ?? 45;
  const [counters, setCounters] = useState<FrictionCounters>(INITIAL_COUNTERS);
  const [isRunning, setIsRunning] = useState(enabled);
  const startTimeRef = useRef<number>(Date.now());
  const pageStartTimeRef = useRef<number>(Date.now());
  const lastInteractionAtRef = useRef<number>(Date.now());
  const lastPointerActivityMarkRef = useRef(0);
  const lastTimeStallTierRef = useRef(0);
  const scrollSampleAtRef = useRef(0);
  const scrollTopSampleRef = useRef<number | null>(null);
  const lastScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const scrollReversalTimesRef = useRef<number[]>([]);
  const lastScrollHesitationAtRef = useRef(0);
  const scrollSurfaceRef = useRef<HTMLElement | null>(null);
  const maxScrollDepthRef = useRef(0);
  const pageVisitCountRef = useRef(1);
  const lastLogicalPageKeyRef = useRef<string | null>(null);
  const helpTriggeredRef = useRef(false);
  const hasErrorRef = useRef(false);
  const [, setSignalVersion] = useState(0);

  const { sessionId } = useOnboardingSession();
  const { enqueueEvent } = useTrackBatch(options?.config);

  const organizationId =
    options?.organizationId || options?.config?.organizationId || options?.config?.apiKey || 'unknown-org';

  useEffect(() => {
    setIsRunning(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!isRunning || typeof window === 'undefined') return;

    const markInteraction = (target?: EventTarget | null) => {
      if (isFrictionSdkChrome(target ?? null)) return;
      lastInteractionAtRef.current = Date.now();
    };

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
      const target = event.target;
      markInteraction(target);
      if (!(target instanceof HTMLElement)) return;

      if (options?.trackRawEvents) {
        void pushEvent('CLICK', {
          elementSelector: target.tagName.toLowerCase(),
          elementText: (target.textContent || '').slice(0, 120),
        });
      }

      if (isClickMissTarget(target)) {
        setCounters((prev) => ({ ...prev, clickMiss: prev.clickMiss + 1 }));
      }
    };

    const onScroll = (event: Event) => {
      const scrollTarget = event.target;
      const scrollSurface =
        scrollTarget instanceof HTMLElement ? scrollTarget : document.documentElement;

      // Panel / FAQ / toast chrome: neither idle reset nor hesitation counters.
      if (isFrictionExcludedScrollSurface(scrollSurface)) {
        return;
      }

      const now = Date.now();
      if (now - scrollSampleAtRef.current < SCROLL_SAMPLE_MIN_MS) {
        return;
      }
      scrollSampleAtRef.current = now;
      markInteraction(scrollSurface);

      const scrollDepth = resolveScrollDepth(event);
      if (scrollDepth > maxScrollDepthRef.current) {
        maxScrollDepthRef.current = scrollDepth;
        setSignalVersion((v) => v + 1);
      }

      if (!isPrimaryScrollSurface(scrollSurface)) {
        if (options?.trackRawEvents) {
          void pushEvent('SCROLL', { scrollDepth });
        }
        return;
      }

      if (scrollSurfaceRef.current !== scrollSurface) {
        scrollSurfaceRef.current = scrollSurface;
        scrollTopSampleRef.current = null;
        lastScrollDirectionRef.current = 0;
      }

      const scrollTop = resolveScrollTop(event);
      if (scrollTop == null) return;

      const previousTop = scrollTopSampleRef.current;
      scrollTopSampleRef.current = scrollTop;
      if (previousTop == null) {
        if (options?.trackRawEvents) {
          void pushEvent('SCROLL', { scrollDepth });
        }
        return;
      }

      const delta = scrollTop - previousTop;
      if (Math.abs(delta) < SCROLL_DIRECTION_DELTA_PX) {
        if (options?.trackRawEvents) {
          void pushEvent('SCROLL', { scrollDepth });
        }
        return;
      }

      const direction: -1 | 1 = delta > 0 ? 1 : -1;
      if (lastScrollDirectionRef.current !== 0 && direction !== lastScrollDirectionRef.current) {
        scrollReversalTimesRef.current.push(now);
        scrollReversalTimesRef.current = scrollReversalTimesRef.current.filter(
          (timestamp) => now - timestamp < SCROLL_HESITATION_WINDOW_MS,
        );

        if (
          scrollReversalTimesRef.current.length >= SCROLL_HESITATION_REVERSALS &&
          now - lastScrollHesitationAtRef.current >= SCROLL_HESITATION_COOLDOWN_MS
        ) {
          setCounters((prev) => ({ ...prev, scrollHesitation: prev.scrollHesitation + 1 }));
          scrollReversalTimesRef.current = [];
          lastScrollHesitationAtRef.current = now;
        }
      }
      lastScrollDirectionRef.current = direction;

      if (options?.trackRawEvents) {
        void pushEvent('SCROLL', { scrollDepth });
      }
    };

    const onPopState = () => {
      markInteraction();
      setCounters((prev) => ({ ...prev, navigationBack: prev.navigationBack + 1 }));
    };

    const onKeyDown = () => {
      markInteraction(document.activeElement);
    };

    const onPointerActivity = (event: Event) => {
      if (isFrictionSdkChrome(event.target)) return;
      const now = Date.now();
      if (now - lastPointerActivityMarkRef.current < POINTER_ACTIVITY_MARK_MIN_MS) {
        return;
      }
      lastPointerActivityMarkRef.current = now;
      markInteraction(event.target);
    };

    const onError = () => {
      if (!hasErrorRef.current) {
        hasErrorRef.current = true;
        setSignalVersion((v) => v + 1);
      }
    };

    const resetPageDwell = () => {
      pageStartTimeRef.current = Date.now();
      lastTimeStallTierRef.current = 0;
      maxScrollDepthRef.current = 0;
      scrollSampleAtRef.current = 0;
      scrollTopSampleRef.current = null;
      lastScrollDirectionRef.current = 0;
      scrollReversalTimesRef.current = [];
      scrollSurfaceRef.current = null;
      setCounters((prev) => ({ ...prev, timeOnPageExcessive: 0 }));
      setSignalVersion((v) => v + 1);
    };

    const trackPageVisit = () => {
      const currentKey = getLogicalPageKey();
      if (lastLogicalPageKeyRef.current && lastLogicalPageKeyRef.current !== currentKey) {
        pageVisitCountRef.current += 1;
        resetPageDwell();
      } else if (!lastLogicalPageKeyRef.current) {
        lastLogicalPageKeyRef.current = currentKey;
      }
      lastLogicalPageKeyRef.current = currentKey;
    };

    /**
     * Soft SPA navigations often commit React state before the new H1 is painted.
     * Re-check shortly after a host click (excluding SDK chrome).
     */
    const scheduleSoftNavigationCheck = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(FRICTION_SDK_CHROME_SELECTOR)) return;
      window.setTimeout(trackPageVisit, 50);
      window.setTimeout(trackPageVisit, 250);
      window.setTimeout(trackPageVisit, 600);
    };

    trackPageVisit();

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
      trackPageVisit();
      const pageSec = Math.floor((Date.now() - pageStartTimeRef.current) / 1000);
      const nextTier = resolveTimeStallTier(pageSec, excessiveTimeThresholdSec);
      if (nextTier > lastTimeStallTierRef.current) {
        lastTimeStallTierRef.current = nextTier;
        setCounters((prev) => ({
          ...prev,
          timeOnPageExcessive: Math.max(prev.timeOnPageExcessive, nextTier),
        }));
      }
    }, 1000);

    const wrapHistoryMethod = (
      method: 'pushState' | 'replaceState',
    ): (() => void) => {
      const original = history[method].bind(history) as typeof history.pushState;
      history[method] = ((...args: Parameters<typeof history.pushState>) => {
        const result = original(...args);
        trackPageVisit();
        return result;
      }) as typeof history.pushState;
      return () => {
        history[method] = original;
      };
    };

    const unwrapPush = wrapHistoryMethod('pushState');
    const unwrapReplace = wrapHistoryMethod('replaceState');

    window.addEventListener('click', onClick);
    window.addEventListener('click', scheduleSoftNavigationCheck, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onPointerActivity, { passive: true });
    window.addEventListener('touchstart', onPointerActivity, { passive: true });
    // Capture phase: scroll does not bubble — host apps often scroll inside <main>, not window.
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('popstate', onPopState);
    window.addEventListener('popstate', trackPageVisit);
    window.addEventListener('hashchange', trackPageVisit);
    window.addEventListener(TRUSTDEV_LOCATION_CHANGE_EVENT, trackPageVisit);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('error', onError);

    return () => {
      window.clearInterval(interval);
      unwrapPush();
      unwrapReplace();
      window.removeEventListener('click', onClick);
      window.removeEventListener('click', scheduleSoftNavigationCheck, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onPointerActivity);
      window.removeEventListener('touchstart', onPointerActivity);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('popstate', trackPageVisit);
      window.removeEventListener('hashchange', trackPageVisit);
      window.removeEventListener(TRUSTDEV_LOCATION_CHANGE_EVENT, trackPageVisit);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('error', onError);
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

  const getSignals = useCallback((): FrictionBehaviorSignals => ({
    elapsedSeconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
    pageSeconds: Math.floor((Date.now() - pageStartTimeRef.current) / 1000),
    idleSeconds: Math.floor((Date.now() - lastInteractionAtRef.current) / 1000),
    maxScrollDepth: maxScrollDepthRef.current,
    pageVisitCount: pageVisitCountRef.current,
    hasError: hasErrorRef.current,
    helpTriggered: helpTriggeredRef.current,
  }), []);

  const api = useMemo(
    () => ({
      counters,
      getSignals,
      isRunning,
      signalHelpTriggered: () => {
        if (!helpTriggeredRef.current) {
          helpTriggeredRef.current = true;
          setSignalVersion((v) => v + 1);
        }
      },
      start: () => setIsRunning(true),
      stop: () => setIsRunning(false),
      reset: () => {
        startTimeRef.current = Date.now();
        pageStartTimeRef.current = Date.now();
        lastInteractionAtRef.current = Date.now();
        lastPointerActivityMarkRef.current = 0;
        lastTimeStallTierRef.current = 0;
        scrollSampleAtRef.current = 0;
        scrollTopSampleRef.current = null;
        lastScrollDirectionRef.current = 0;
        scrollReversalTimesRef.current = [];
        lastScrollHesitationAtRef.current = 0;
        scrollSurfaceRef.current = null;
        maxScrollDepthRef.current = 0;
        pageVisitCountRef.current = 1;
        lastLogicalPageKeyRef.current = getLogicalPageKey();
        helpTriggeredRef.current = false;
        hasErrorRef.current = false;
        setCounters(INITIAL_COUNTERS);
        setSignalVersion((v) => v + 1);
      },
    }),
    [counters, getSignals, isRunning],
  );

  return api;
}
