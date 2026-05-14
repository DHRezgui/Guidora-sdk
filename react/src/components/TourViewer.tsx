import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import { PositionType, SDKConfig, Step, TourDraftIntent } from '../types';
import { UseContextualTourSuggestionsOptions } from '../hooks/useContextualTourSuggestions';
import { ContextualSuggestionsPublisher, ContextualSuggestionsUIMode } from './ContextualSuggestionsPublisher';
import { OnboardingTheme } from './theme';
import { TourRenderer } from './TourRenderer';
import { recordTourSuggestionFeedback } from '../utils/tour-suggestion-generator';
import { enqueueContextualFeedback } from '../utils/contextual-feedback-flusher';
import { findElement } from '../utils/dom-utils';

const VALID_INTENTS: TourDraftIntent[] = ['discovery', 'primary-action', 'support-navigation', 'form-flow'];
const NAVIGATION_CLICK_RESUME_DELAY_MS = 5000;
const NAVIGATION_CLICK_RESUME_KEY = '__trustdev_navigation_click_resume_at_v1';
type TargetRect = { top: number; left: number; width: number; height: number };

function areRectsClose(a: TargetRect | null, b: TargetRect, tolerance = 0.5): boolean {
  if (!a) return false;
  return (
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function toTourDraftIntent(raw: unknown): TourDraftIntent | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase() as TourDraftIntent;
  return VALID_INTENTS.includes(normalized) ? normalized : null;
}

function readNavigationClickResumeAt(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(NAVIGATION_CLICK_RESUME_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeNavigationClickResumeAt(resumeAt: number): void {
  if (typeof window === 'undefined') return;
  if (resumeAt > Date.now()) {
    window.sessionStorage.setItem(NAVIGATION_CLICK_RESUME_KEY, String(resumeAt));
  } else {
    window.sessionStorage.removeItem(NAVIGATION_CLICK_RESUME_KEY);
  }
}

export interface TourViewerProps {
  config?: Partial<SDKConfig>;
  autoStart?: boolean;
  debug?: boolean;
  theme?: OnboardingTheme;
  showHighlight?: boolean;
  showBeacon?: boolean;
  showTooltip?: boolean;
  tooltipPosition?: PositionType;
  onTourComplete?: (tourId?: string) => void;
  onTourSkipped?: (tourId?: string) => void;
  runtimeBehavior?: {
    /**
     * Enables preview auto-detection in iframe runtime.
     */
    detectPreviewIframe?: boolean;
    /**
     * Host suffixes considered as preview hosts when embedded in iframe.
     * Example: ['tunnelmole.net'].
     */
    previewHostSuffixes?: string[];
    /**
     * Whether tour UI should be hidden in preview iframe.
     */
    hideTourUiInPreview?: boolean;
    /**
     * Whether auto-start should be disabled in preview iframe.
     */
    disableAutoStartInPreview?: boolean;
    /**
     * Clears local progress/session storage on mount.
     * - never: no reset
     * - always: always reset
     * - non-preview: reset only outside preview iframe
     */
    resetProgressOnMount?: 'never' | 'always' | 'non-preview';
  };
  contextualSuggestions?: (UseContextualTourSuggestionsOptions & {
    /**
     * Defaults to 'auto':
     * - hidden when developerMode=false (production-safe)
     * - hidden when autoPublish=true
     * - minimal manual panel when developerMode=true and autoPublish=false
     */
    uiMode?: ContextualSuggestionsUIMode;
    title?: string;
    stableOnly?: boolean;
    /**
     * Selects a built-in preset combining sensible defaults + the relevant
     * `journeyVerticals`. Pick the one that matches your host app:
     * - `ecommerce-default`: e-commerce funnel (browse / cart / checkout)
     * - `saas-default`: SaaS onboarding + feature discovery + account settings
     * - `marketing-default`: lead generation (CTA / contact form / demo)
     * - `dashboard-default`: analytics / data exploration (filters, charts,
     *   date pickers, exports)
     * - `support-default`: in-app help surfaces (FAQ, docs, ticket creation,
     *   live chat)
     * - `multi-vertical-default`: activates ALL verticals — useful when the
     *   app spans several contexts (e.g. an e-commerce site with a marketing
     *   landing page and an analytics admin dashboard)
     */
    preset?:
      | 'ecommerce-default'
      | 'saas-default'
      | 'marketing-default'
      | 'dashboard-default'
      | 'support-default'
      | 'multi-vertical-default';
    /**
     * Enables the publishing panel UI. End-users consuming activated tours
     * must never see this panel, so it is hidden by default. When omitted,
     * TourViewer's `debug` prop is used as the implicit value, so the panel
     * appears automatically only in development.
     */
    developerMode?: boolean;
  }) | null;
}

const SHARED_CONTEXTUAL_DEFAULTS: Partial<UseContextualTourSuggestionsOptions> = {
  enabled: true,
  autoGenerate: true,
  autoPublish: false,
  autoActivatePublishedDrafts: false,
  maxAutoPublishedTours: 3,
  publishScenario: 'simple',
  maxDrafts: 4,
  maxCandidates: 250,
  ignoreTransientUi: true,
  includeSupportDraft: true,
  includeNavigationDraft: true,
  includeFormDraft: true,
  useSemanticRanking: true,
  enableSequenceDetection: true,
  noiseFilteringEnabled: true,
  conflictResolutionEnabled: true,
  conflictResolutionStrategy: 'hybrid',
  explainabilityEnabled: true,
  minConfidence: 45,
  persona: 'admin',
  flowVersioningEnabled: true,
  flowCompatibilityMode: 'lenient',
  feedbackEnabled: true,
  // When at least one blueprint produces a draft, suppress the heuristic
  // drafts. Blueprint drafts are business-meaningful by construction; the
  // heuristic ones tend to be "tour of the navigation menu" / "look at the
  // page H1" which add noise. Hosts that want to keep the heuristics on top
  // can override this with `blueprintsExclusive: false`.
  blueprintsExclusive: true,
};

const CONTEXTUAL_SUGGESTIONS_PRESETS: Record<string, Partial<UseContextualTourSuggestionsOptions>> = {
  'ecommerce-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'e-commerce onboarding',
    businessObjectives: ['discover products', 'add to cart', 'reach checkout'],
    semanticHints: ['shop', 'cart', 'checkout', 'contact'],
    flowVersion: 'ecommerce-v1',
    baselineFlowVersion: 'ecommerce-v0',
    journeyVerticals: ['ecommerce'],
  },
  'saas-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'saas onboarding',
    businessObjectives: [
      'discover dashboard',
      'create first resource',
      'invite team',
      'complete profile',
      'discover new features',
      'manage account settings',
    ],
    semanticHints: [
      'dashboard',
      'create',
      'new',
      'settings',
      'team',
      'invite',
      'profile',
      'billing',
      'security',
      'upgrade',
      'whats new',
    ],
    flowVersion: 'saas-v1',
    baselineFlowVersion: 'saas-v0',
    journeyVerticals: ['saas'],
  },
  'marketing-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'marketing lead capture',
    businessObjectives: ['capture leads', 'book demo', 'newsletter signup'],
    semanticHints: ['contact', 'demo', 'newsletter', 'get started', 'pricing'],
    flowVersion: 'marketing-v1',
    baselineFlowVersion: 'marketing-v0',
    journeyVerticals: ['marketing'],
  },
  'dashboard-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'analytics dashboard',
    businessObjectives: ['explore data', 'apply filters', 'export reports', 'compare periods'],
    semanticHints: [
      'kpi',
      'metric',
      'filter',
      'chart',
      'date',
      'period',
      'export',
      'download',
      'csv',
    ],
    flowVersion: 'dashboard-v1',
    baselineFlowVersion: 'dashboard-v0',
    journeyVerticals: ['dashboard'],
  },
  'support-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'in-app help center',
    businessObjectives: ['find answer in FAQ', 'browse documentation', 'open support ticket'],
    semanticHints: [
      'faq',
      'help',
      'support',
      'documentation',
      'docs',
      'ticket',
      'contact',
      'chat',
    ],
    flowVersion: 'support-v1',
    baselineFlowVersion: 'support-v0',
    journeyVerticals: ['support'],
  },
  'multi-vertical-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'multi-vertical onboarding',
    businessObjectives: [
      'discover products',
      'add to cart',
      'capture leads',
      'create first resource',
      'explore analytics',
      'manage account',
      'find help',
    ],
    semanticHints: [
      'shop',
      'cart',
      'checkout',
      'contact',
      'demo',
      'dashboard',
      'create',
      'kpi',
      'filter',
      'chart',
      'export',
      'settings',
      'billing',
      'help',
      'faq',
      'docs',
    ],
    flowVersion: 'multi-v1',
    baselineFlowVersion: 'multi-v0',
    journeyVerticals: ['ecommerce', 'saas', 'marketing', 'dashboard', 'support'],
  },
};

function normalizeRoutePath(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  }
}

function getStepSearchText(step?: Step | null): string {
  if (!step) return '';
  return [step.title, step.content, step.targetSelector].filter(Boolean).join(' ');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isActiveInPageNavigationTarget(element: HTMLElement): boolean {
  return (
    element.getAttribute('aria-selected') === 'true' ||
    element.getAttribute('data-state') === 'active' ||
    element.getAttribute('aria-current') === 'page'
  );
}

function activateInPageNavigationForStep(step?: Step | null): boolean {
  if (typeof window === 'undefined' || !step) return false;

  const preferredText = getStepSearchText(step);
  if (!preferredText) return false;

  const target = findElement('[role="tab"], button[aria-controls], a[role="tab"]', {
    preferredText,
    requirePreferredMatch: true,
  });

  if (!target || isActiveInPageNavigationTarget(target)) return false;
  if (target.getAttribute('aria-disabled') === 'true' || target.hasAttribute('disabled')) return false;

  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  target.click();
  return true;
}

function isNavigationActivationTarget(element: HTMLElement): boolean {
  const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return false;
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      return false;
    }

    try {
      const targetUrl = new URL(href, window.location.href);
      const currentUrl = new URL(window.location.href);
      return (
        targetUrl.href !== currentUrl.href &&
        (targetUrl.pathname !== currentUrl.pathname ||
          targetUrl.search !== currentUrl.search ||
          targetUrl.hash !== currentUrl.hash)
      );
    } catch {
      return true;
    }
  }

  return element.getAttribute('role') === 'link' || element.dataset.trustdevNavigates === 'true';
}

/**
 * Composant haut-niveau qui orchestre tout automatiquement:
 * - Initialise useOnboarding hook
 * - Résout les sélecteurs DOM
 * - Affiche TourRenderer avec tous les composants UI
 * - Gère la navigation tour complète
 * 
 * Usage optimal:
 * ```tsx
 * <TourViewer config={sdkConfig} autoStart={true} />
 * ```
 */
export function TourViewer({
  config,
  autoStart = true,
  debug = false,
  theme,
  showHighlight = true,
  showBeacon = false,
  showTooltip = true,
  tooltipPosition = 'BOTTOM',
  onTourComplete,
  onTourSkipped,
  runtimeBehavior,
  contextualSuggestions = null,
}: TourViewerProps) {
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const previewBridgeRef = useRef<{
    selector: string;
    source: Window | null;
    origin: string;
  } | null>(null);

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [currentPathname, setCurrentPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '',
  );
  const [autoNavigatingToRoute, setAutoNavigatingToRoute] = useState<string | null>(null);
  const [navigationClickResumeAt, setNavigationClickResumeAt] = useState(readNavigationClickResumeAt);
  const lastRouteAutoNavigateKeyRef = useRef<string | null>(null);
  const suppressRouteAutoNavigateUntilRef = useRef(0);
  const targetClickAdvanceInFlightRef = useRef(false);
  const lastTargetAutoScrollKeyRef = useRef<string | null>(null);
  const lastUserScrollIntentAtRef = useRef(0);
  const runtimeFeedbackRecorderRef = useRef<
    (event: 'shown' | 'clicked' | 'completed' | 'skipped', selectorOverride?: string) => void
  >(() => undefined);
  const isEmbeddedSimulatorPreview =
    typeof window !== 'undefined' &&
    window.self !== window.top &&
    new URLSearchParams(window.location.search).get('__trustdev_simulator_preview') === '1';
  const previewHostSuffixes = runtimeBehavior?.previewHostSuffixes ?? ['tunnelmole.net'];
  const detectPreviewIframe = runtimeBehavior?.detectPreviewIframe ?? true;
  const isRuntimePreviewIframe =
    typeof window !== 'undefined' &&
    detectPreviewIframe &&
    window.self !== window.top &&
    previewHostSuffixes.some((suffix) => window.location.hostname.endsWith(suffix));
  const isPreviewRuntime = isEmbeddedSimulatorPreview || isRuntimePreviewIframe;
  const shouldHideTourUiInPreview = runtimeBehavior?.hideTourUiInPreview ?? true;
  const shouldDisableAutoStartInPreview = runtimeBehavior?.disableAutoStartInPreview ?? true;
  const effectiveAutoStart = isPreviewRuntime && shouldDisableAutoStartInPreview ? false : autoStart;
  const isNavigationClickSuspended =
    typeof window !== 'undefined' && navigationClickResumeAt > Date.now();
  const shouldTemporarilyHideTourUi = isNavigationClickSuspended;
  const effectiveShowHighlight =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showHighlight;
  const effectiveShowBeacon =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showBeacon;
  const effectiveShowTooltip =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showTooltip;

  const onboarding = useOnboarding({
    config,
    autoStart: effectiveAutoStart,
    debug,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const resumeAt = readNavigationClickResumeAt();
    if (resumeAt <= Date.now()) {
      writeNavigationClickResumeAt(0);
      setNavigationClickResumeAt(0);
      return;
    }

    setNavigationClickResumeAt(resumeAt);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (navigationClickResumeAt <= Date.now()) return;

    const timer = window.setTimeout(() => {
      writeNavigationClickResumeAt(0);
      setNavigationClickResumeAt(0);
    }, navigationClickResumeAt - Date.now());

    return () => window.clearTimeout(timer);
  }, [navigationClickResumeAt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const markUserScrollIntent = () => {
      lastUserScrollIntentAtRef.current = Date.now();
    };
    const markKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'PageDown' ||
        event.key === 'PageUp' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        markUserScrollIntent();
      }
    };

    window.addEventListener('wheel', markUserScrollIntent, { passive: true, capture: true });
    window.addEventListener('touchmove', markUserScrollIntent, { passive: true, capture: true });
    window.addEventListener('keydown', markKeyboardScrollIntent, { capture: true });
    return () => {
      window.removeEventListener('wheel', markUserScrollIntent, true);
      window.removeEventListener('touchmove', markUserScrollIntent, true);
      window.removeEventListener('keydown', markKeyboardScrollIntent, true);
    };
  }, []);

  const navigateToStepRoute = useCallback((rawRoute?: string): boolean => {
    if (typeof window === 'undefined') return false;
    const normalizedTargetRoute = normalizeRoutePath(rawRoute);
    if (!normalizedTargetRoute) return false;

    const normalizedCurrentRoute = normalizeRoutePath(window.location.pathname);
    if (normalizedTargetRoute === normalizedCurrentRoute) return false;

    setAutoNavigatingToRoute(normalizedTargetRoute);
    const targetUrl = `${window.location.origin}${normalizedTargetRoute}`;
    window.location.assign(targetUrl);
    return true;
  }, []);

  const syncTargetRect = useCallback(() => {
    const el = activeTargetRef.current;
    if (!el) return;
    const domRect = el.getBoundingClientRect();
    const nextRect: TargetRect = {
      // Tooltip/overlay are fixed-position layers, so keep viewport coordinates.
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    };
    setTargetRect((prev) => (areRectsClose(prev, nextRect) ? prev : nextRect));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePath = () => {
      setCurrentPathname(window.location.pathname);
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updatePath();
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    window.addEventListener('popstate', updatePath);
    window.addEventListener('hashchange', updatePath);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', updatePath);
      window.removeEventListener('hashchange', updatePath);
    };
  }, []);

  useEffect(() => {
    const resetMode = runtimeBehavior?.resetProgressOnMount ?? 'never';
    if (resetMode === 'never') return;
    if (resetMode === 'non-preview' && isPreviewRuntime) return;

    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('trustdev_sdk_progress:')) {
          window.localStorage.removeItem(key);
        }
      }
      window.sessionStorage.removeItem('__trustdev_active_tour_session_v1');
    } catch {
      // Ignore storage access errors.
    }
  }, [runtimeBehavior?.resetProgressOnMount, isPreviewRuntime]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sendTargetRect = () => {
      const bridge = previewBridgeRef.current;
      if (!bridge?.source || !bridge.selector) return;

      const target = document.querySelector(bridge.selector) as HTMLElement | null;
      const rect = target?.getBoundingClientRect();
      bridge.source.postMessage(
        {
          type: 'TRUSTDEV_PREVIEW_TARGET_RECT',
          selector: bridge.selector,
          href: window.location.href,
          rect: rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null,
        },
        bridge.origin,
      );
    };

    let rafId: number | null = null;
    const scheduleSend = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        sendTargetRect();
      });
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; selector?: string } | null;
      if (!data || data.type !== 'TRUSTDEV_PREVIEW_REQUEST_TARGET' || !data.selector) {
        return;
      }

      previewBridgeRef.current = {
        selector: data.selector,
        source: event.source as Window | null,
        origin: event.origin || '*',
      };
      scheduleSend();
    };

    const onViewportChange = () => {
      if (!previewBridgeRef.current) return;
      scheduleSend();
    };

    const observer = new MutationObserver(onViewportChange);
    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [isPreviewRuntime]);

  const expectedStepRoute = normalizeRoutePath(onboarding.tour.currentStep?.stepTargetUrl);
  const normalizedCurrentRoute = normalizeRoutePath(currentPathname);
  const routeMismatch = Boolean(expectedStepRoute) && expectedStepRoute !== normalizedCurrentRoute;
  const isAutoNavigating = Boolean(autoNavigatingToRoute) && routeMismatch;

  useEffect(() => {
    if (!autoNavigatingToRoute) return;
    if (normalizedCurrentRoute === autoNavigatingToRoute) {
      setAutoNavigatingToRoute(null);
    }
  }, [autoNavigatingToRoute, normalizedCurrentRoute]);

  useEffect(() => {
    if (!autoNavigatingToRoute) return;
    const timer = window.setTimeout(() => {
      setAutoNavigatingToRoute(null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoNavigatingToRoute]);

  useEffect(() => {
    if (!onboarding.tour.isOpen || !routeMismatch || !expectedStepRoute) return;
    if (autoNavigatingToRoute === expectedStepRoute) return;
    if (shouldTemporarilyHideTourUi) return;
    if (Date.now() < suppressRouteAutoNavigateUntilRef.current) return;

    const stepKey = [
      onboarding.activeTour?.id ?? 'unknown',
      onboarding.tour.currentStepIndex,
      normalizedCurrentRoute,
      expectedStepRoute,
    ].join('|');
    if (lastRouteAutoNavigateKeyRef.current === stepKey) return;

    lastRouteAutoNavigateKeyRef.current = stepKey;
    navigateToStepRoute(expectedStepRoute);
  }, [
    autoNavigatingToRoute,
    expectedStepRoute,
    navigateToStepRoute,
    normalizedCurrentRoute,
    onboarding.activeTour?.id,
    onboarding.tour.currentStepIndex,
    onboarding.tour.isOpen,
    routeMismatch,
    shouldTemporarilyHideTourUi,
  ]);

  useEffect(() => {
    if (!onboarding.tour.isOpen) {
      lastRouteAutoNavigateKeyRef.current = null;
    }
  }, [onboarding.tour.isOpen]);

  const advanceAfterTargetActivation = useCallback((targetEl?: HTMLElement | null) => {
    if (targetClickAdvanceInFlightRef.current) return;
    targetClickAdvanceInFlightRef.current = true;
    runtimeFeedbackRecorderRef.current('clicked');

    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    const isNavigationTarget = targetEl ? isNavigationActivationTarget(targetEl) : false;

    if (isNavigationTarget) {
      const resumeAt = Date.now() + NAVIGATION_CLICK_RESUME_DELAY_MS;
      writeNavigationClickResumeAt(resumeAt);
      setNavigationClickResumeAt(resumeAt);
      suppressRouteAutoNavigateUntilRef.current = resumeAt + 500;

      if (isLast) {
        runtimeFeedbackRecorderRef.current('completed');
        onboarding.tour.completeTour();
        onTourComplete?.(onboarding.activeTour?.id);
      } else {
        onboarding.tour.nextStep();
        setResolveAttempt((prev) => prev + 1);
      }

      window.setTimeout(() => {
        targetClickAdvanceInFlightRef.current = false;
      }, 900);
      return;
    }

    suppressRouteAutoNavigateUntilRef.current = Date.now() + 2500;
    if (isLast) {
      runtimeFeedbackRecorderRef.current('completed');
      onboarding.tour.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      const nextStep = onboarding.tour.steps[onboarding.tour.currentStepIndex + 1];
      onboarding.tour.nextStep();
      setResolveAttempt((prev) => prev + 1);

      window.setTimeout(() => {
        navigateToStepRoute(nextStep?.stepTargetUrl);
      }, 250);
    }

    window.setTimeout(() => {
      targetClickAdvanceInFlightRef.current = false;
    }, 900);
  }, [navigateToStepRoute, onboarding.activeTour?.id, onboarding.tour, onTourComplete]);

  // Résoudre le sélecteur de la step courante
  useEffect(() => {
    const currentStep = onboarding.tour.currentStep;
    const currentSelector = currentStep?.targetSelector;
    const currentStepSearchText = getStepSearchText(currentStep);
    if (!onboarding.tour.isOpen || routeMismatch || !currentSelector) {
      activeTargetRef.current = null;
      setTargetRect(null);
      setTargetNotFound(false);
      return;
    }

    let cancelled = false;
    let raf1: number | null = null;
    let raf2: number | null = null;
    let syncRaf: number | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let targetClickCleanup: (() => void) | null = null;

    const scheduleTargetRectSync = () => {
      if (syncRaf !== null) return;
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = null;
        if (cancelled) return;

        const currentTarget = activeTargetRef.current;
        const latestTarget = findElement(currentSelector, {
          preferredText: currentStepSearchText,
          preferActive: true,
        });
        if (!currentTarget?.isConnected || !latestTarget || latestTarget !== currentTarget) {
          setResolveAttempt((prev) => prev + 1);
          return;
        }

        syncTargetRect();
      });
    };

    const resolveSelector = async () => {
      try {
        const activatedInPageNavigation = activateInPageNavigationForStep(currentStep);
        if (activatedInPageNavigation) {
          await wait(180);
          if (cancelled) return;
        }

        const targetEl = await onboarding.resolver.resolveTarget(currentSelector, {
          retries: 8,
          intervalMs: 250,
          preferredText: currentStepSearchText,
          preferActive: true,
        });

        if (cancelled) return;

        if (targetEl) {
          activeTargetRef.current = targetEl;
          const domRect = targetEl.getBoundingClientRect();
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
          const isOutOfViewport =
            domRect.bottom < 0 ||
            domRect.top > viewportHeight ||
            domRect.right < 0 ||
            domRect.left > viewportWidth;
          const stepAutoScrollKey = [
            onboarding.activeTour?.id ?? 'unknown',
            onboarding.tour.currentStepIndex,
            currentSelector,
          ].join('|');
          const userScrolledRecently = Date.now() - lastUserScrollIntentAtRef.current < 1500;
          const canAutoScrollTarget =
            isOutOfViewport &&
            !userScrolledRecently &&
            lastTargetAutoScrollKeyRef.current !== stepAutoScrollKey;

          if (canAutoScrollTarget) {
            lastTargetAutoScrollKeyRef.current = stepAutoScrollKey;
            targetEl.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'center',
            });
            // Wait for smooth scroll/layout to settle, then read the final rect.
            raf1 = window.requestAnimationFrame(() => {
              raf2 = window.requestAnimationFrame(() => {
                if (!cancelled) syncTargetRect();
              });
            });
          } else {
            const nextRect: TargetRect = {
              // Tooltip/overlay are fixed-position layers, so keep viewport coordinates.
              top: domRect.top,
              left: domRect.left,
              width: domRect.width,
              height: domRect.height,
            };
            setTargetRect((prev) => (areRectsClose(prev, nextRect) ? prev : nextRect));
          }

          window.addEventListener('scroll', scheduleTargetRectSync, { capture: true, passive: true });
          document.addEventListener('scroll', scheduleTargetRectSync, { capture: true, passive: true });
          window.addEventListener('resize', scheduleTargetRectSync);
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleTargetRectSync);
            resizeObserver.observe(targetEl);
          }
          observer = new MutationObserver(scheduleTargetRectSync);
          if (document.body) {
            observer.observe(document.body, { subtree: true, childList: true });
          }

          if (currentStep?.action === 'CLICK') {
            const handleTargetClick = () => {
              advanceAfterTargetActivation(targetEl);
            };
            targetEl.addEventListener('click', handleTargetClick);
            targetClickCleanup = () => {
              targetEl.removeEventListener('click', handleTargetClick);
            };
          }

          setTargetNotFound(false);
        } else {
          activeTargetRef.current = null;
          setTargetRect(null);
          setTargetNotFound(true);
        }
      } catch (error) {
        onboarding.debug.error('Failed to resolve target', { error });
        activeTargetRef.current = null;
        setTargetRect(null);
        setTargetNotFound(true);
      }
    };

    void resolveSelector();

    return () => {
      cancelled = true;
      activeTargetRef.current = null;
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      if (syncRaf !== null) window.cancelAnimationFrame(syncRaf);
      if (observer) observer.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      if (targetClickCleanup) targetClickCleanup();
      window.removeEventListener('scroll', scheduleTargetRectSync, true);
      document.removeEventListener('scroll', scheduleTargetRectSync, true);
      window.removeEventListener('resize', scheduleTargetRectSync);
    };
  }, [
    onboarding.tour.isOpen,
    onboarding.tour.currentStep?.targetSelector,
    onboarding.tour.currentStep?.action,
    onboarding.tour.currentStep?.title,
    onboarding.tour.currentStep?.content,
    onboarding.resolver,
    onboarding.debug,
    routeMismatch,
    resolveAttempt,
    syncTargetRect,
    advanceAfterTargetActivation,
  ]);

  const resolvedContextualSuggestions = (() => {
    if (!contextualSuggestions) return null;
    const presetName = contextualSuggestions.preset;
    const preset = presetName ? CONTEXTUAL_SUGGESTIONS_PRESETS[presetName] ?? {} : {};
    return {
      ...preset,
      ...contextualSuggestions,
      noiseSelectors: contextualSuggestions.noiseSelectors ?? preset.noiseSelectors,
      businessObjectives: contextualSuggestions.businessObjectives ?? preset.businessObjectives,
      semanticHints: contextualSuggestions.semanticHints ?? preset.semanticHints,
    };
  })();

  const activeTourIntent = (() => {
    const meta = onboarding.activeTour?.triggerConditions as
      | { contextualEngine?: { intent?: string } }
      | undefined;
    return toTourDraftIntent(meta?.contextualEngine?.intent);
  })();
  // Blueprint origin marker propagated through `triggerConditions.contextualEngine.blueprintId`.
  // When present, runtime feedback events are also aggregated per blueprintId
  // via `blueprintFeedbackBoost`, so the resolver can de-prioritize blueprints
  // that historically underperform on end users.
  const activeTourBlueprintId = (() => {
    const meta = onboarding.activeTour?.triggerConditions as
      | { contextualEngine?: { blueprintId?: string } }
      | undefined;
    return meta?.contextualEngine?.blueprintId;
  })();
  const isContextualTour = activeTourIntent !== null;
  // Strict opt-in: runtime feedback recording is OFF by default. The host app
  // must explicitly set `contextualSuggestions.feedbackEnabled: true` (or use a
  // preset that does, e.g. 'ecommerce-default'). End-users in production who
  // do not configure contextualSuggestions never trigger any local storage
  // writes, preventing silent pollution of feedback counters.
  const runtimeFeedbackEnabled =
    isContextualTour &&
    isPreviewRuntime === false &&
    resolvedContextualSuggestions?.feedbackEnabled === true;

  const recordRuntimeFeedback = useCallback(
    (event: 'shown' | 'clicked' | 'completed' | 'skipped', selectorOverride?: string) => {
      if (!runtimeFeedbackEnabled || !activeTourIntent) return;
      const selector =
        selectorOverride ?? onboarding.tour.currentStep?.targetSelector ?? undefined;
      recordTourSuggestionFeedback({
        selector,
        intent: activeTourIntent,
        event,
        blueprintId: activeTourBlueprintId,
      });
      enqueueContextualFeedback({
        selector,
        intent: activeTourIntent,
        event,
        targetUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
    },
    [
      runtimeFeedbackEnabled,
      activeTourIntent,
      activeTourBlueprintId,
      onboarding.tour.currentStep?.targetSelector,
    ],
  );

  useEffect(() => {
    runtimeFeedbackRecorderRef.current = recordRuntimeFeedback;
  }, [recordRuntimeFeedback]);

  const lastShownKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runtimeFeedbackEnabled) return;
    if (!onboarding.tour.isOpen || !onboarding.tour.currentStep) return;
    if (shouldTemporarilyHideTourUi) return;
    if (routeMismatch || targetNotFound || !targetRect) return;

    const tourId = onboarding.activeTour?.id ?? 'unknown';
    const stepKey = `${tourId}|${onboarding.tour.currentStepIndex}|${onboarding.tour.currentStep.targetSelector ?? ''}`;
    if (lastShownKeyRef.current === stepKey) return;
    lastShownKeyRef.current = stepKey;
    recordRuntimeFeedback('shown');
  }, [
    runtimeFeedbackEnabled,
    onboarding.tour.isOpen,
    onboarding.tour.currentStep,
    onboarding.tour.currentStepIndex,
    onboarding.activeTour?.id,
    routeMismatch,
    shouldTemporarilyHideTourUi,
    targetNotFound,
    targetRect,
    recordRuntimeFeedback,
  ]);

  useEffect(() => {
    if (!onboarding.tour.isOpen) {
      lastShownKeyRef.current = null;
    }
  }, [onboarding.tour.isOpen]);

  const handleNext = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (isLast) {
      recordRuntimeFeedback('clicked');
      recordRuntimeFeedback('completed');
      onboarding.tour.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      recordRuntimeFeedback('clicked');
      const nextStep = onboarding.tour.steps[onboarding.tour.currentStepIndex + 1];
      onboarding.tour.nextStep();
      setResolveAttempt((prev) => prev + 1); // Trigger re-resolution
      navigateToStepRoute(nextStep?.stepTargetUrl);
    }
  }, [onboarding.tour, onboarding.activeTour?.id, onTourComplete, navigateToStepRoute, recordRuntimeFeedback]);

  const handlePrev = useCallback(() => {
    const prevStep = onboarding.tour.steps[onboarding.tour.currentStepIndex - 1];
    onboarding.tour.prevStep();
    setResolveAttempt((prev) => prev + 1);
    navigateToStepRoute(prevStep?.stepTargetUrl);
  }, [onboarding.tour, navigateToStepRoute]);

  const handleSkip = useCallback(() => {
    recordRuntimeFeedback('skipped');
    onboarding.tour.skipTour();
    onTourSkipped?.(onboarding.activeTour?.id);
  }, [onboarding.tour, onboarding.activeTour?.id, onTourSkipped, recordRuntimeFeedback]);

  const handleClose = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (!isLast) {
      recordRuntimeFeedback('skipped');
    }
    onboarding.stop();
  }, [onboarding, recordRuntimeFeedback]);

  return (
    <>
      <TourRenderer
        isOpen={onboarding.tour.isOpen && !shouldTemporarilyHideTourUi}
        currentStep={onboarding.tour.currentStep}
        currentIndex={onboarding.tour.currentStepIndex}
        totalSteps={onboarding.tour.steps.length}
        theme={theme}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onClose={handleClose}
        targetRect={targetRect}
        showHighlight={effectiveShowHighlight}
        showBeacon={effectiveShowBeacon}
        showTooltip={effectiveShowTooltip}
        tooltipPosition={tooltipPosition}
        targetNotFound={!routeMismatch && targetNotFound}
        retryingSelector={onboarding.resolver.isResolving}
        routeMismatch={routeMismatch}
        expectedRoute={expectedStepRoute}
        currentRoute={normalizedCurrentRoute}
        autoNavigating={isAutoNavigating}
      />
      {resolvedContextualSuggestions ? (
        <ContextualSuggestionsPublisher
          {...resolvedContextualSuggestions}
          uiMode={resolvedContextualSuggestions.uiMode ?? 'auto'}
          title={resolvedContextualSuggestions.title}
          stableOnly={resolvedContextualSuggestions.stableOnly}
          developerMode={resolvedContextualSuggestions.developerMode ?? debug}
          publishConfig={{
            ...(config ?? {}),
            ...(resolvedContextualSuggestions.publishConfig ?? {}),
          }}
        />
      ) : null}
    </>
  );
}
