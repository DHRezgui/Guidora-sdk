import { useEffect, useState } from 'react';
import { PositionType, Step } from '../types';
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
  tooltipPosition?: PositionType;
  targetNotFound?: boolean;
  retryingSelector?: boolean;
  routeMismatch?: boolean;
  expectedRoute?: string;
  currentRoute?: string;
  autoNavigating?: boolean;
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
  routeMismatch = false,
  expectedRoute,
  currentRoute,
  autoNavigating = false,
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
  const isLastStep = totalSteps > 0 && currentIndex >= totalSteps - 1;
  const hasTarget = targetRect && !targetNotFound && !routeMismatch;
  const stepHighlightEnabled = currentStep.highlightElement !== false;
  const shouldShowStepHighlight = showHighlight && stepHighlightEnabled && hasTarget;
  const shouldShowSkip = currentStep.skipAllowed !== false && !isLastStep;

  return (
    <TourPortal>
      {/* Overlay highlight autour de l'élément cible */}
      {shouldShowStepHighlight ? (
        <Highlight
          open={true}
          targetRect={targetRect}
          theme={theme}
          padding={0}
          borderRadius={6}
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
      {showTooltip && currentStep && !routeMismatch ? (
        <Tooltip
          open={!targetNotFound}
          title={currentStep.title}
          content={currentStep.content}
          targetRect={hasTarget ? targetRect : null}
          position={currentStep.position || tooltipPosition}
          stepIndex={currentIndex}
          totalSteps={totalSteps}
          theme={theme}
          showNavigation={true}
          showSkip={shouldShowSkip}
          onNext={onNext}
          onPrev={isFirstStep ? undefined : onPrev}
          onSkip={onSkip}
          onClose={onClose}
          enableKeyboardNavigation={true}
          hideArrow={!hasTarget}
        />
      ) : null}

      {routeMismatch && !autoNavigating ? (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 2147483600,
            maxWidth: 420,
            background: '#111827',
            color: '#fff',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            padding: '14px 16px',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Navigation requise pour continuer</div>
          <div>
            Cette étape attend la page <code>{expectedRoute || 'N/A'}</code>.
          </div>
          <div style={{ opacity: 0.85, marginTop: 4 }}>
            Route actuelle: <code>{currentRoute || 'N/A'}</code>
          </div>
          <div style={{ opacity: 0.8, marginTop: 8 }}>
            Naviguez vers la route attendue, le tour reprendra automatiquement.
          </div>
        </div>
      ) : null}

      {/* Fallback si le sélecteur target n'est pas trouvé */}
      {showFallback && targetNotFound && !routeMismatch ? (
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
