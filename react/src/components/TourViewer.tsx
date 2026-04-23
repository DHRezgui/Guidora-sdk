import { useCallback, useEffect, useState } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import { PositionType, SDKConfig } from '../types';
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
}

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
}: TourViewerProps) {
  const onboarding = useOnboarding({
    config,
    autoStart,
    debug,
  });

  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [currentPathname, setCurrentPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '',
  );

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

  const expectedStepRoute = normalizeRoutePath(onboarding.tour.currentStep?.stepTargetUrl);
  const normalizedCurrentRoute = normalizeRoutePath(currentPathname);
  const routeMismatch = Boolean(expectedStepRoute) && expectedStepRoute !== normalizedCurrentRoute;

  // Résoudre le sélecteur de la step courante
  useEffect(() => {
    if (!onboarding.tour.isOpen || routeMismatch || !onboarding.tour.currentStep?.targetSelector) {
      setTargetRect(null);
      setTargetNotFound(false);
      return;
    }

    const resolveSelector = async () => {
      try {
        const rect = await onboarding.resolver.resolveTarget(onboarding.tour.currentStep!.targetSelector, {
          retries: 8,
          intervalMs: 250,
        });

        if (rect) {
          const domRect = rect.getBoundingClientRect();
          setTargetRect({
            top: domRect.top + window.scrollY,
            left: domRect.left + window.scrollX,
            width: domRect.width,
            height: domRect.height,
          });
          setTargetNotFound(false);
        } else {
          setTargetRect(null);
          setTargetNotFound(true);
        }
      } catch (error) {
        onboarding.debug.error('Failed to resolve target', { error });
        setTargetNotFound(true);
      }
    };

    void resolveSelector();
  }, [
    onboarding.tour.isOpen,
    onboarding.tour.currentStep?.targetSelector,
    onboarding.resolver,
    onboarding.debug,
    routeMismatch,
    resolveAttempt,
  ]);

  const handleNext = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (isLast) {
      onboarding.tour.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      onboarding.tour.nextStep();
      setResolveAttempt((prev) => prev + 1); // Trigger re-resolution
    }
  }, [onboarding.tour, onboarding.activeTour?.id, onTourComplete]);

  const handlePrev = useCallback(() => {
    onboarding.tour.prevStep();
    setResolveAttempt((prev) => prev + 1);
  }, [onboarding.tour]);

  const handleSkip = useCallback(() => {
    onboarding.tour.skipTour();
    onTourSkipped?.(onboarding.activeTour?.id);
  }, [onboarding.tour, onboarding.activeTour?.id, onTourSkipped]);

  const handleClose = useCallback(() => {
    onboarding.stop();
  }, [onboarding]);

  return (
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
      showHighlight={showHighlight}
      showBeacon={showBeacon}
      showTooltip={showTooltip}
      tooltipPosition={tooltipPosition}
      targetNotFound={!routeMismatch && targetNotFound}
      retryingSelector={onboarding.resolver.isResolving}
      routeMismatch={routeMismatch}
      expectedRoute={expectedStepRoute}
      currentRoute={normalizedCurrentRoute}
    />
  );
}
