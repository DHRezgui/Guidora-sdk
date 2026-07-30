import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventType, FrictionCounters, SDKConfig, TrackEventInput } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';
import { getCurrentPageUrl } from '../utils/url';
import {
  getLogicalPageKey,
  isLogicalPageKeyStabilization,
  logicalPageUrl,
  resolveFrictionPageIdentity,
  TRUSTDEV_LOCATION_CHANGE_EVENT,
} from '../utils/logical-page';
import { resolveTimeStallTier } from '../utils/friction-scoring';
import {
  evaluateFormRetry,
  evaluateNavigationLoop,
  evaluateRageClick,
  evaluateUTurn,
  resolveInteractiveClickKey,
  shouldCountErrorClick,
  shouldCountFailAfterHelp,
  shouldCountFaqNoResult,
  shouldCountFaqReopen,
  shouldCountSlowResponse,
  SLOW_RESPONSE_MS,
  SOFT_SPA_NAV_SETTLE_MS,
  TRUSTDEV_FAQ_FRICTION_EVENT,
  FRICTION_INTERACTIVE_CLICK_SELECTOR,
  type FaqFrictionDetail,
  type NavTransition,
  type RageClickSample,
} from '../utils/friction-advanced-signals';
import type { FrictionSignalKey } from '../utils/friction-signal-catalog';
import type { FrictionSignalTimestamps } from '../utils/friction-signal-freshness';
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
  rageClick: 0,
  errorClick: 0,
  formRetry: 0,
  navigationLoop: 0,
  uTurn: 0,
  slowResponse: 0,
  faqNoResult: 0,
  faqReopen: 0,
  failAfterHelp: 0,
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
  '.trustdev-faq-panel',
  '.trustdev-faq-widget',
  '.trustdev-proactive-toast',
  '#trustdev-proactive-toast-portal',
].join(',');

const INTERACTIVE_CLICK_SELECTOR = FRICTION_INTERACTIVE_CLICK_SELECTOR;

function isFrictionSdkChrome(element: EventTarget | null): boolean {
  if (!(element instanceof Element)) return false;
  if (element.id === 'trustdev-proactive-toast-portal') return true;
  return Boolean(element.closest(FRICTION_SDK_CHROME_SELECTOR));
}

/** True while the help/FAQ UI is open — host slow-response must not fire. */
function isHelpChromeOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '.trustdev-help-sidebar--open, .trustdev-faq-widget--open, .trustdev-faq-widget[data-open="true"]',
    ),
  );
}

function isFrictionExcludedScrollSurface(element: HTMLElement): boolean {
  return isFrictionSdkChrome(element);
}

/** Host opt-out zones: never count dead-clicks / slow-response inside. */
function isFrictionIgnoredHostZone(element: Element): boolean {
  return Boolean(element.closest('[data-trustdev-ignore-friction]'));
}

/** Dead click: non-interactive surface outside SDK chrome (includes empty card backgrounds). */
function isClickMissTarget(target: HTMLElement): boolean {
  if (isFrictionSdkChrome(target)) return false;
  if (isFrictionIgnoredHostZone(target)) return false;
  if (target.closest(INTERACTIVE_CLICK_SELECTOR)) return false;
  return true;
}

/**
 * Slow-response arming: buttons / tabs that expect a follow-up action.
 * Skip typing surfaces and plain in-page / external links (high FP).
 */
function shouldArmSlowResponse(target: HTMLElement): boolean {
  if (isFrictionSdkChrome(target) || isFrictionIgnoredHostZone(target)) return false;
  // Native + ARIA select/filter widgets: opening/choosing is not "waiting for response".
  if (
    target.closest(
      'input, select, textarea, label, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"]',
    )
  ) {
    return false;
  }
  const anchor = target.closest('a[href]');
  if (anchor instanceof HTMLAnchorElement) {
    const href = (anchor.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    // External or same-document navigation links — not "waiting for app response".
    return false;
  }
  return Boolean(
    target.closest(
      'button, [role="button"], [role="tab"], [role="menuitem"], summary, [data-interactive], [data-trustdev-interactive]',
    ),
  );
}

function isSameOriginScriptError(filename: string | undefined): boolean {
  if (!filename || typeof window === 'undefined') return true;
  try {
    const origin = window.location.origin;
    if (filename.startsWith(origin)) return true;
    // Inline / eval / empty — treat as same-origin (best-effort).
    if (filename === '' || filename === 'undefined') return true;
    return false;
  } catch {
    return true;
  }
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
  const [signalTimestamps, setSignalTimestamps] = useState<FrictionSignalTimestamps>({});
  const signalTimestampsRef = useRef<FrictionSignalTimestamps>({});

  const bumpCounter = useCallback((key: FrictionSignalKey, now = Date.now()) => {
    signalTimestampsRef.current = { ...signalTimestampsRef.current, [key]: now };
    setSignalTimestamps(signalTimestampsRef.current);
    setCounters((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  }, []);
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
  /** True only after the user actually used help (FAQ search), not mere open. */
  const helpEngagedRef = useRef(false);
  const hasErrorRef = useRef(false);
  const rageClickHistoryRef = useRef<RageClickSample[]>([]);
  const lastRageClickFiredAtRef = useRef(0);
  const lastInteractiveClickAtRef = useRef(0);
  const formFailedSubmitCountRef = useRef<Map<string, number>>(new Map());
  const pageEnteredAtRef = useRef<number>(Date.now());
  const arrivedFromPageKeyRef = useRef<string | null>(null);
  /** Timestamp of last pathname/search/hash hop — suppresses landmark thrash as nav. */
  const lastUrlNavigationAtRef = useRef(0);
  /** Last *committed* page (after soft-SPA landmarks settle). */
  const committedPageKeyRef = useRef<string | null>(null);
  const softNavTimerRef = useRef<number | null>(null);
  const softNavFromKeyRef = useRef<string | null>(null);
  const navTransitionHistoryRef = useRef<NavTransition[]>([]);
  const lastNavLoopFiredAtRef = useRef(0);
  const lastUTurnFiredAtRef = useRef(0);
  const lastSlowResponseFiredAtRef = useRef(0);
  const slowResponseTimerRef = useRef<number | null>(null);
  const slowResponsePageKeyRef = useRef<string | null>(null);
  const lastFaqNoResultFiredAtRef = useRef(0);
  const lastFaqReopenFiredAtRef = useRef(0);
  const lastFailAfterHelpFiredAtRef = useRef(0);
  const [, setSignalVersion] = useState(0);

  const { sessionId } = useOnboardingSession();
  const { enqueueEvent } = useTrackBatch(options?.config);

  const organizationId =
    options?.organizationId || options?.config?.organizationId || options?.config?.apiKey || 'unknown-org';

  const noteFailAfterHelp = useCallback(() => {
    const now = Date.now();
    if (
      !shouldCountFailAfterHelp({
        helpTriggered: helpTriggeredRef.current,
        helpEngaged: helpEngagedRef.current,
        now,
        lastFiredAt: lastFailAfterHelpFiredAtRef.current,
      })
    ) {
      return;
    }
    lastFailAfterHelpFiredAtRef.current = now;
    bumpCounter('failAfterHelp', now);
  }, [bumpCounter]);

  useEffect(() => {
    setIsRunning(enabled);
  }, [enabled]);

  // Phase-3 FAQ events must be heard even while friction is paused (help UI open).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onFaqFriction = (event: Event) => {
      const detail = (event as CustomEvent<FaqFrictionDetail>).detail;
      if (!detail) return;

      // Any FAQ search = help was actually used (open alone is not enough).
      // Also cancel a pending host slow-response — FAQ latency is not host friction.
      if (detail.type === 'search' || detail.type === 'noResult') {
        helpEngagedRef.current = true;
        if (slowResponseTimerRef.current != null) {
          window.clearTimeout(slowResponseTimerRef.current);
          slowResponseTimerRef.current = null;
        }
        slowResponsePageKeyRef.current = null;
        setSignalVersion((v) => v + 1);
      }

      if (detail.type !== 'noResult') return;

      const now = Date.now();
      if (
        !shouldCountFaqNoResult({
          resultCount: detail.resultCount ?? 0,
          strategyStep: detail.strategyStep,
          topScore: detail.topScore,
          now,
          lastFiredAt: lastFaqNoResultFiredAtRef.current,
        })
      ) {
        return;
      }
      lastFaqNoResultFiredAtRef.current = now;
      bumpCounter('faqNoResult', now);
    };

    window.addEventListener(TRUSTDEV_FAQ_FRICTION_EVENT, onFaqFriction as EventListener);
    return () => {
      window.removeEventListener(TRUSTDEV_FAQ_FRICTION_EVENT, onFaqFriction as EventListener);
    };
  }, [bumpCounter]);

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

    const clearSlowResponseTimer = () => {
      if (slowResponseTimerRef.current != null) {
        window.clearTimeout(slowResponseTimerRef.current);
        slowResponseTimerRef.current = null;
      }
      slowResponsePageKeyRef.current = null;
    };

    const scheduleSlowResponseCheck = () => {
      clearSlowResponseTimer();
      const pageKeyAtClick = getLogicalPageKey();
      slowResponsePageKeyRef.current = pageKeyAtClick;
      slowResponseTimerRef.current = window.setTimeout(() => {
        slowResponseTimerRef.current = null;
        const now = Date.now();
        // FAQ/help UI currently open: never attribute latency to the host app.
        if (isHelpChromeOpen()) {
          slowResponsePageKeyRef.current = null;
          return;
        }
        if (
          !shouldCountSlowResponse({
            pageKeyAtClick: slowResponsePageKeyRef.current,
            currentPageKey: getLogicalPageKey(),
            now,
            lastFiredAt: lastSlowResponseFiredAtRef.current,
          })
        ) {
          slowResponsePageKeyRef.current = null;
          return;
        }
        lastSlowResponseFiredAtRef.current = now;
        slowResponsePageKeyRef.current = null;
        bumpCounter('slowResponse', now);
      }, SLOW_RESPONSE_MS);
    };

    const recordInvalidFormAttempt = (form: HTMLFormElement) => {
      if (isFrictionSdkChrome(form)) return;
      if (form.noValidate) return;
      if (form.checkValidity()) return;

      const formKey =
        form.id?.trim() ||
        form.getAttribute('name')?.trim() ||
        `form:${form.action || 'local'}:${form.method || 'get'}`;
      const previous = formFailedSubmitCountRef.current.get(formKey) ?? 0;
      const result = evaluateFormRetry({ previousFailedSubmits: previous });
      formFailedSubmitCountRef.current.set(formKey, result.nextFailedSubmits);
      if (result.triggered) {
        bumpCounter('formRetry');
        noteFailAfterHelp();
      }
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

      if (isFrictionSdkChrome(target)) {
        // Cancel a pending host slow-response when the user moves into SDK help chrome.
        clearSlowResponseTimer();
        return;
      }

      if (isClickMissTarget(target)) {
        bumpCounter('clickMiss');
        return;
      }

      const interactiveKey = resolveInteractiveClickKey(target);
      if (!interactiveKey) return;

      lastInteractiveClickAtRef.current = Date.now();
      // A follow-up interactive click clears the previous "waiting for response" window
      // and starts a fresh one only for action-like controls (not inputs / plain links).
      if (shouldArmSlowResponse(target)) {
        scheduleSlowResponseCheck();
      } else {
        clearSlowResponseTimer();
      }

      const rage = evaluateRageClick({
        history: rageClickHistoryRef.current,
        key: interactiveKey,
        now: Date.now(),
        lastFiredAt: lastRageClickFiredAtRef.current,
      });
      rageClickHistoryRef.current = rage.history;
      lastRageClickFiredAtRef.current = rage.lastFiredAt;
      if (rage.triggered) {
        bumpCounter('rageClick');
        noteFailAfterHelp();
      }

      // Native constraint validation blocks `submit` — detect retries on submit controls.
      const form = target.closest('form');
      const submitControl = target.closest(
        'button[type="submit"], input[type="submit"], button:not([type])',
      );
      if (form instanceof HTMLFormElement && submitControl) {
        recordInvalidFormAttempt(form);
      }
    };

    const recordErrorClick = () => {
      const now = Date.now();
      if (!shouldCountErrorClick(lastInteractiveClickAtRef.current, now)) {
        if (!hasErrorRef.current) {
          hasErrorRef.current = true;
          setSignalVersion((v) => v + 1);
        }
        return;
      }
      lastInteractiveClickAtRef.current = 0;
      if (!hasErrorRef.current) {
        hasErrorRef.current = true;
      }
      bumpCounter('errorClick');
      setSignalVersion((v) => v + 1);
      noteFailAfterHelp();
    };

    const onError = (event: ErrorEvent) => {
      // Best-effort: ignore obvious third-party script failures.
      if (event?.filename && !isSameOriginScriptError(event.filename)) {
        return;
      }
      recordErrorClick();
    };

    const onUnhandledRejection = () => {
      recordErrorClick();
    };

    const onSubmitCapture = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      recordInvalidFormAttempt(form);
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
          bumpCounter('scrollHesitation');
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
      bumpCounter('navigationBack');
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

    const resetPageDwell = () => {
      pageStartTimeRef.current = Date.now();
      lastTimeStallTierRef.current = 0;
      maxScrollDepthRef.current = 0;
      scrollSampleAtRef.current = 0;
      scrollTopSampleRef.current = null;
      lastScrollDirectionRef.current = 0;
      scrollReversalTimesRef.current = [];
      scrollSurfaceRef.current = null;
      // Defer React updates: Next.js may call history.pushState during useInsertionEffect
      // (CSS-in-JS / Turbopack), and setState in that phase throws.
      window.setTimeout(() => {
        setCounters((prev) => ({ ...prev, timeOnPageExcessive: 0 }));
        setSignalVersion((v) => v + 1);
      }, 0);
    };

    const clearSoftNavTimer = () => {
      if (softNavTimerRef.current != null) {
        window.clearTimeout(softNavTimerRef.current);
        softNavTimerRef.current = null;
      }
      softNavFromKeyRef.current = null;
    };

    const commitPageTransition = (fromKey: string, toKey: string) => {
      if (!fromKey || !toKey || fromKey === toKey) {
        committedPageKeyRef.current = toKey || fromKey;
        lastLogicalPageKeyRef.current = toKey || fromKey;
        return;
      }

      if (isLogicalPageKeyStabilization(fromKey, toKey)) {
        committedPageKeyRef.current = toKey;
        lastLogicalPageKeyRef.current = toKey;
        return;
      }

      const fromId = resolveFrictionPageIdentity(fromKey);
      const toId = resolveFrictionPageIdentity(toKey);
      // Soft SPA: H1 may still be animating out while aria-current already moved —
      // identity is nav-based, so hybrid full keys collapse to the same view.
      if (fromId === toId) {
        committedPageKeyRef.current = toKey;
        lastLogicalPageKeyRef.current = toKey;
        return;
      }

      const now = Date.now();
      const fromUrl = logicalPageUrl(fromKey);
      const toUrl = logicalPageUrl(toKey);
      const dwellMsOnPrevious = now - pageEnteredAtRef.current;

      const uTurn = evaluateUTurn({
        previousPageKey: fromId,
        nextPageKey: toId,
        arrivedFromPageKey: arrivedFromPageKeyRef.current,
        dwellMsOnPrevious,
        now,
        lastFiredAt: lastUTurnFiredAtRef.current,
      });
      lastUTurnFiredAtRef.current = uTurn.lastFiredAt;
      if (uTurn.triggered) {
        bumpCounter('uTurn');
      }

      const loop = evaluateNavigationLoop({
        history: navTransitionHistoryRef.current,
        from: fromId,
        to: toId,
        now,
        lastFiredAt: lastNavLoopFiredAtRef.current,
      });
      navTransitionHistoryRef.current = loop.history;
      lastNavLoopFiredAtRef.current = loop.lastFiredAt;
      if (loop.triggered) {
        bumpCounter('navigationLoop');
      }

      arrivedFromPageKeyRef.current = fromId;
      if (fromUrl !== toUrl) {
        lastUrlNavigationAtRef.current = now;
      }
      pageVisitCountRef.current += 1;
      pageEnteredAtRef.current = now;
      clearSlowResponseTimer();
      resetPageDwell();
      committedPageKeyRef.current = toKey;
      lastLogicalPageKeyRef.current = toKey;
    };

    const trackPageVisit = () => {
      const currentKey = getLogicalPageKey();
      const committedKey = committedPageKeyRef.current ?? lastLogicalPageKeyRef.current;

      if (!committedKey) {
        committedPageKeyRef.current = currentKey;
        lastLogicalPageKeyRef.current = currentKey;
        pageEnteredAtRef.current = Date.now();
        return;
      }

      const currentId = resolveFrictionPageIdentity(currentKey);
      const committedId = resolveFrictionPageIdentity(committedKey);

      if (committedId === currentId) {
        // Refresh stored full key (H1 may have settled) without counting a hop.
        committedPageKeyRef.current = currentKey;
        lastLogicalPageKeyRef.current = currentKey;
        return;
      }

      const now = Date.now();
      const committedUrl = logicalPageUrl(committedKey);
      const currentUrl = logicalPageUrl(currentKey);

      if (isLogicalPageKeyStabilization(committedKey, currentKey)) {
        committedPageKeyRef.current = currentKey;
        lastLogicalPageKeyRef.current = currentKey;
        return;
      }

      // After a real route change, landmark paint on the new URL is not a hop.
      const recentlyChangedUrl =
        lastUrlNavigationAtRef.current > 0 &&
        now - lastUrlNavigationAtRef.current < 1_500;
      if (committedUrl === currentUrl && recentlyChangedUrl) {
        committedPageKeyRef.current = currentKey;
        lastLogicalPageKeyRef.current = currentKey;
        return;
      }

      // URL app: commit immediately.
      if (committedUrl !== currentUrl) {
        clearSoftNavTimer();
        commitPageTransition(committedKey, currentKey);
        return;
      }

      // Soft SPA (same URL): debounce identity changes (nav cue).
      if (softNavFromKeyRef.current == null) {
        softNavFromKeyRef.current = committedKey;
      }
      lastLogicalPageKeyRef.current = currentKey;
      if (softNavTimerRef.current != null) {
        window.clearTimeout(softNavTimerRef.current);
      }
      softNavTimerRef.current = window.setTimeout(() => {
        softNavTimerRef.current = null;
        const fromKey = softNavFromKeyRef.current;
        softNavFromKeyRef.current = null;
        const toKey = getLogicalPageKey();
        if (!fromKey) return;
        commitPageTransition(fromKey, toKey);
      }, SOFT_SPA_NAV_SETTLE_MS);
    };

    /** Escape React commit / useInsertionEffect when host routers mutate history. */
    let trackPageVisitTimer: number | null = null;
    const scheduleTrackPageVisit = () => {
      if (trackPageVisitTimer != null) return;
      trackPageVisitTimer = window.setTimeout(() => {
        trackPageVisitTimer = null;
        trackPageVisit();
      }, 0);
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
        if (isFrictionSdkChrome(form)) return false;
        const elements = Array.from(form.querySelectorAll('input, textarea')) as Array<
          HTMLInputElement | HTMLTextAreaElement
        >;
        return elements.some((field) => field.value && field.value.length > 0);
      });

      if (hasDirtyForm) {
        bumpCounter('formAbandonment');
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
        scheduleTrackPageVisit();
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
    document.addEventListener('submit', onSubmitCapture, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('popstate', scheduleTrackPageVisit);
    window.addEventListener('hashchange', scheduleTrackPageVisit);
    window.addEventListener(TRUSTDEV_LOCATION_CHANGE_EVENT, scheduleTrackPageVisit);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.clearInterval(interval);
      if (trackPageVisitTimer != null) {
        window.clearTimeout(trackPageVisitTimer);
        trackPageVisitTimer = null;
      }
      clearSlowResponseTimer();
      clearSoftNavTimer();
      unwrapPush();
      unwrapReplace();
      window.removeEventListener('click', onClick);
      window.removeEventListener('click', scheduleSoftNavigationCheck, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onPointerActivity);
      window.removeEventListener('touchstart', onPointerActivity);
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('submit', onSubmitCapture, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('popstate', scheduleTrackPageVisit);
      window.removeEventListener('hashchange', scheduleTrackPageVisit);
      window.removeEventListener(TRUSTDEV_LOCATION_CHANGE_EVENT, scheduleTrackPageVisit);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [
    enqueueEvent,
    excessiveTimeThresholdSec,
    isRunning,
    options?.trackRawEvents,
    options?.userId,
    organizationId,
    sessionId,
    noteFailAfterHelp,
    bumpCounter,
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

  const signalFaqReopen = useCallback((faqOpenCount: number) => {
    const now = Date.now();
    if (
      !shouldCountFaqReopen({
        faqOpenCount,
        now,
        lastFiredAt: lastFaqReopenFiredAtRef.current,
      })
    ) {
      return;
    }
    lastFaqReopenFiredAtRef.current = now;
    bumpCounter('faqReopen', now);
  }, [bumpCounter]);

  const api = useMemo(
    () => ({
      counters,
      signalTimestamps,
      getSignals,
      isRunning,
      signalHelpTriggered: () => {
        if (!helpTriggeredRef.current) {
          helpTriggeredRef.current = true;
          setSignalVersion((v) => v + 1);
        }
      },
      signalFaqReopen,
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
        committedPageKeyRef.current = lastLogicalPageKeyRef.current;
        helpTriggeredRef.current = false;
        helpEngagedRef.current = false;
        hasErrorRef.current = false;
        rageClickHistoryRef.current = [];
        lastRageClickFiredAtRef.current = 0;
        lastInteractiveClickAtRef.current = 0;
        formFailedSubmitCountRef.current = new Map();
        pageEnteredAtRef.current = Date.now();
        arrivedFromPageKeyRef.current = null;
        lastUrlNavigationAtRef.current = 0;
        if (softNavTimerRef.current != null) {
          window.clearTimeout(softNavTimerRef.current);
          softNavTimerRef.current = null;
        }
        softNavFromKeyRef.current = null;
        navTransitionHistoryRef.current = [];
        lastNavLoopFiredAtRef.current = 0;
        lastUTurnFiredAtRef.current = 0;
        lastSlowResponseFiredAtRef.current = 0;
        if (slowResponseTimerRef.current != null) {
          window.clearTimeout(slowResponseTimerRef.current);
          slowResponseTimerRef.current = null;
        }
        slowResponsePageKeyRef.current = null;
        lastFaqNoResultFiredAtRef.current = 0;
        lastFaqReopenFiredAtRef.current = 0;
        lastFailAfterHelpFiredAtRef.current = 0;
        signalTimestampsRef.current = {};
        setSignalTimestamps({});
        setCounters(INITIAL_COUNTERS);
        setSignalVersion((v) => v + 1);
      },
    }),
    [counters, signalTimestamps, getSignals, isRunning, signalFaqReopen],
  );

  return api;
}
