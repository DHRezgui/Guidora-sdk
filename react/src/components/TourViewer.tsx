import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import { PositionType, SDKConfig } from '../types';
import { UseContextualTourSuggestionsOptions } from '../hooks/useContextualTourSuggestions';
import { ContextualSuggestionsPublisher, ContextualSuggestionsUIMode } from './ContextualSuggestionsPublisher';
import { OnboardingTheme } from './theme';
import { TourRenderer } from './TourRenderer';

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
     * - hidden when autoPublish=true
     * - minimal manual panel when autoPublish=false
     */
    uiMode?: ContextualSuggestionsUIMode;
    title?: string;
    stableOnly?: boolean;
    preset?: 'ecommerce-default';
  }) | null;
}

const CONTEXTUAL_SUGGESTIONS_PRESETS: Record<string, Partial<UseContextualTourSuggestionsOptions>> = {
  'ecommerce-default': {
    enabled: true,
    autoGenerate: true,
    autoPublish: false,
    autoActivatePublishedDrafts: true,
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
    projectDomain: 'e-commerce onboarding',
    persona: 'admin',
    businessObjectives: ['discover products', 'add to cart', 'reach checkout'],
    semanticHints: ['shop', 'cart', 'checkout', 'contact'],
    flowVersioningEnabled: true,
    flowVersion: 'ecommerce-v1',
    baselineFlowVersion: 'ecommerce-v0',
    flowCompatibilityMode: 'lenient',
    feedbackEnabled: true,
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

  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [currentPathname, setCurrentPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '',
  );
  const [autoNavigatingToRoute, setAutoNavigatingToRoute] = useState<string | null>(null);
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
  const effectiveShowHighlight = isPreviewRuntime && shouldHideTourUiInPreview ? false : showHighlight;
  const effectiveShowBeacon = isPreviewRuntime && shouldHideTourUiInPreview ? false : showBeacon;
  const effectiveShowTooltip = isPreviewRuntime && shouldHideTourUiInPreview ? false : showTooltip;

  const onboarding = useOnboarding({
    config,
    autoStart: effectiveAutoStart,
    debug,
  });

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
    setTargetRect({
      // Tooltip/overlay are fixed-position layers, so keep viewport coordinates.
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    });
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
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', onViewportChange, true);
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
  }, []);

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

  // Résoudre le sélecteur de la step courante
  useEffect(() => {
    if (!onboarding.tour.isOpen || routeMismatch || !onboarding.tour.currentStep?.targetSelector) {
      activeTargetRef.current = null;
      setTargetRect(null);
      setTargetNotFound(false);
      return;
    }

    let cancelled = false;
    let raf1: number | null = null;
    let raf2: number | null = null;
    let observer: MutationObserver | null = null;

    const onViewportChange = () => {
      syncTargetRect();
    };

    const resolveSelector = async () => {
      try {
        const targetEl = await onboarding.resolver.resolveTarget(onboarding.tour.currentStep!.targetSelector, {
          retries: 8,
          intervalMs: 250,
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

          if (isOutOfViewport) {
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
            setTargetRect({
              // Tooltip/overlay are fixed-position layers, so keep viewport coordinates.
              top: domRect.top,
              left: domRect.left,
              width: domRect.width,
              height: domRect.height,
            });
          }

          window.addEventListener('scroll', onViewportChange, true);
          window.addEventListener('resize', onViewportChange);
          observer = new MutationObserver(onViewportChange);
          if (document.body) {
            observer.observe(document.body, {
              subtree: true,
              childList: true,
              attributes: true,
            });
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
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [
    onboarding.tour.isOpen,
    onboarding.tour.currentStep?.targetSelector,
    onboarding.resolver,
    onboarding.debug,
    routeMismatch,
    resolveAttempt,
    syncTargetRect,
  ]);

  const handleNext = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (isLast) {
      onboarding.tour.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      const nextStep = onboarding.tour.steps[onboarding.tour.currentStepIndex + 1];
      onboarding.tour.nextStep();
      setResolveAttempt((prev) => prev + 1); // Trigger re-resolution
      navigateToStepRoute(nextStep?.stepTargetUrl);
    }
  }, [onboarding.tour, onboarding.activeTour?.id, onTourComplete, navigateToStepRoute]);

  const handlePrev = useCallback(() => {
    const prevStep = onboarding.tour.steps[onboarding.tour.currentStepIndex - 1];
    onboarding.tour.prevStep();
    setResolveAttempt((prev) => prev + 1);
    navigateToStepRoute(prevStep?.stepTargetUrl);
  }, [onboarding.tour, navigateToStepRoute]);

  const handleSkip = useCallback(() => {
    onboarding.tour.skipTour();
    onTourSkipped?.(onboarding.activeTour?.id);
  }, [onboarding.tour, onboarding.activeTour?.id, onTourSkipped]);

  const handleClose = useCallback(() => {
    onboarding.stop();
  }, [onboarding]);

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

  return (
    <>
      <TourRenderer
        isOpen={onboarding.tour.isOpen}
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
          publishConfig={{
            ...(config ?? {}),
            ...(resolvedContextualSuggestions.publishConfig ?? {}),
          }}
        />
      ) : null}
    </>
  );
}
