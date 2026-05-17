import { useEffect, useState } from 'react';
import { PositionType, Step } from '../types';
import { Beacon } from './Beacon';
import { Highlight } from './Highlight';
import { TargetNotFoundFallback } from './TargetNotFoundFallback';
import { Tooltip } from './Tooltip';
import { OnboardingTheme } from './theme';
import { TourPortal } from './TourPortal';

function isStableSelectorForRuntimeDisplay(selector?: string): boolean {
  if (!selector) return false;
  if (selector.includes('[data-tour-id=')) return true;
  if (selector.startsWith('#')) return true;
  if (selector.includes('[aria-label=')) return true;
  return false;
}

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
  resolvePath?: 'primary' | 'alternative' | 'fingerprint' | 'semantic-fallback' | 'not-found' | null;
  resolveMatchScore?: number | null;
  /** Selector that resolved successfully — used to suppress misleading low-confidence badge. */
  resolvedSelector?: string | null;
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
  resolvePath = null,
  resolveMatchScore = null,
  resolvedSelector = null,
}: TourRendererProps) {
  const [showFallback, setShowFallback] = useState(false);
  const [showRouteFallback, setShowRouteFallback] = useState(false);

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

  useEffect(() => {
    if (!isOpen || !routeMismatch || autoNavigating) {
      setShowRouteFallback(false);
      return;
    }

    // Auto-navigation is scheduled by TourViewer after render. Delay the
    // manual route fallback so users never see a flash during normal SPA page
    // transitions, especially on heavier real-world Next.js apps.
    const timer = setTimeout(() => setShowRouteFallback(true), 2200);
    return () => clearTimeout(timer);
  }, [autoNavigating, isOpen, routeMismatch, expectedRoute, currentRoute]);

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

      {showRouteFallback && routeMismatch && !autoNavigating ? (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 2147483600,
            maxWidth: 420,
            background:
              'linear-gradient(135deg, rgba(8, 13, 28, 0.98), rgba(18, 24, 42, 0.96) 52%, rgba(35, 13, 22, 0.96))',
            color: '#f8fafc',
            border: '1px solid rgba(251, 113, 133, 0.28)',
            borderRadius: 16,
            boxShadow: '0 22px 55px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
            padding: '16px 18px',
            fontSize: 13,
            lineHeight: 1.45,
            backdropFilter: 'blur(14px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #fb7185, #f97316)',
                boxShadow: '0 0 18px rgba(251, 113, 133, 0.75)',
              }}
            />
            Navigation en attente
          </div>
          <div style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
            Le tour attend la page{' '}
            <code
              style={{
                color: '#fecdd3',
                background: 'rgba(251, 113, 133, 0.12)',
                border: '1px solid rgba(251, 113, 133, 0.18)',
                borderRadius: 6,
                padding: '1px 5px',
              }}
            >
              {expectedRoute || 'N/A'}
            </code>
            .
          </div>
          <div style={{ color: 'rgba(203, 213, 225, 0.78)', marginTop: 6 }}>
            Route actuelle:{' '}
            <code
              style={{
                color: '#fed7aa',
                background: 'rgba(249, 115, 22, 0.1)',
                borderRadius: 6,
                padding: '1px 5px',
              }}
            >
              {currentRoute || 'N/A'}
            </code>
          </div>
          <div style={{ color: 'rgba(203, 213, 225, 0.72)', marginTop: 10 }}>
            Si la redirection automatique ne démarre pas, ouvrez cette route: le tour reprendra tout seul.
          </div>
        </div>
      ) : null}

      {resolvePath ? (
        <div
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            zIndex: 2147483595,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.24)',
            background: 'rgba(15,23,42,0.82)',
            color: '#e2e8f0',
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.01em',
            backdropFilter: 'blur(10px)',
          }}
        >
          resolve: {resolvePath}
          {typeof resolveMatchScore === 'number'
            ? ` · match ${Math.round(resolveMatchScore)}${
                resolveMatchScore < 50 &&
                !(resolvePath === 'primary' && isStableSelectorForRuntimeDisplay(resolvedSelector || undefined))
                  ? ' · low-confidence'
                  : ''
              }`
            : ''}
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
