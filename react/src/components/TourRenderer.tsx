import { useEffect, useState } from 'react';
import { Step } from '../types';
import { Beacon } from './Beacon';
import { Highlight } from './Highlight';
import { TargetNotFoundFallback } from './TargetNotFoundFallback';
import { Tooltip } from './Tooltip';
import { OnboardingTheme } from './theme';
import { TourPortal } from './TourPortal';

export interface TourRendererProps {
  isOpen?: boolean;
  currentStep?: Step | null;
  currentIndex?: number;
  totalSteps?: number;
  theme?: OnboardingTheme;
  onNext?: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
  targetRect?: { top: number; left: number; width: number; height: number } | null;
  showHighlight?: boolean;
  showBeacon?: boolean;
  showTooltip?: boolean;
  tooltipPosition?: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  targetNotFound?: boolean;
  retryingSelector?: boolean;
}

/**
 * Composant low-level pour rendre un tour étape par étape
 * Gère l'affichage: Highlight + Beacon + Tooltip + Footer + Fallback
 * Usage: Généralement consommé par TourViewer, mais peut être utilisé directement
 */
export function TourRenderer({
  isOpen,
  currentStep,
  currentIndex = 0,
  totalSteps = 0,
  theme,
  onNext,
  onPrev,
  onSkip,
  onClose,
  targetRect,
  showHighlight = true,
  showBeacon = false,
  showTooltip = true,
  tooltipPosition = 'BOTTOM',
  targetNotFound = false,
  retryingSelector = false,
}: TourRendererProps) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowFallback(false);
      return;
    }

    if (targetNotFound && !retryingSelector) {
      const timer = setTimeout(() => setShowFallback(true), 600);
      return () => clearTimeout(timer);
    } else {
      setShowFallback(false);
    }
  }, [isOpen, targetNotFound, retryingSelector]);

  if (!isOpen || !currentStep) return null;

  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= totalSteps - 1;
  const hasTarget = targetRect && !targetNotFound;

  return (
    <TourPortal>
      {/* Overlay highlight autour de l'élément cible */}
      {showHighlight && hasTarget ? (
        <Highlight
          open={true}
          targetRect={targetRect}
          theme={theme}
          padding={8}
          onOverlayClick={onClose}
        />
      ) : null}

      {/* Beacon point d'entrée cliquable */}
      {showBeacon && hasTarget ? (
        <Beacon
          open={true}
          targetRect={targetRect}
          size={18}
          pulse={true}
          theme={theme}
          onClick={onNext}
        />
      ) : null}

      {/* Tooltip principal avec navigation */}
      {showTooltip && currentStep ? (
        <Tooltip
          open={!targetNotFound}
          title={currentStep.title}
          content={currentStep.content}
          targetRect={hasTarget ? targetRect : null}
          position={tooltipPosition as any}
          stepIndex={currentIndex}
          totalSteps={totalSteps}
          theme={theme}
          showNavigation={true}
          showSkip={currentStep.skipAllowed !== false}
          onNext={isLastStep ? undefined : onNext}
          onPrev={isFirstStep ? undefined : onPrev}
          onSkip={onSkip}
          onClose={onClose}
          enableKeyboardNavigation={true}
          hideArrow={!hasTarget}
        />
      ) : null}

      {/* Fallback si le sélecteur target n'est pas trouvé */}
      {showFallback && targetNotFound ? (
        <TargetNotFoundFallback
          open={true}
          selector={currentStep?.targetSelector}
          onRetry={onNext}
          onSkip={onSkip}
        />
      ) : null}
    </TourPortal>
  );
}
