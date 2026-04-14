import { CSSProperties } from 'react';
import { PositionType } from '../types';
import { KeyboardNavigation } from './KeyboardNavigation';
import { StepFooter } from './StepFooter';
import { TooltipArrow } from './TooltipArrow';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

export interface TooltipProps {
  open: boolean;
  title?: string;
  content: string;
  targetRect?: RectLike | null;
  position?: PositionType;
  stepIndex?: number;
  totalSteps?: number;
  showNavigation?: boolean;
  showSkip?: boolean;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  onNext?: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
  enableKeyboardNavigation?: boolean;
  hideArrow?: boolean;
}

function getTooltipPosition(targetRect?: RectLike | null, position: PositionType = 'BOTTOM'): CSSProperties {
  if (!targetRect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const gap = 12;
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  switch (position) {
    case 'TOP':
      return { top: targetRect.top - gap, left: centerX, transform: 'translate(-50%, -100%)' };
    case 'LEFT':
      return { top: centerY, left: targetRect.left - gap, transform: 'translate(-100%, -50%)' };
    case 'RIGHT':
      return { top: centerY, left: targetRect.left + targetRect.width + gap, transform: 'translate(0, -50%)' };
    case 'CENTER':
      return { top: centerY, left: centerX, transform: 'translate(-50%, -50%)' };
    case 'TOP_LEFT':
      return { top: targetRect.top - gap, left: targetRect.left, transform: 'translate(0, -100%)' };
    case 'TOP_RIGHT':
      return { top: targetRect.top - gap, left: targetRect.left + targetRect.width, transform: 'translate(-100%, -100%)' };
    case 'BOTTOM_LEFT':
      return { top: targetRect.top + targetRect.height + gap, left: targetRect.left, transform: 'translate(0, 0)' };
    case 'BOTTOM_RIGHT':
      return {
        top: targetRect.top + targetRect.height + gap,
        left: targetRect.left + targetRect.width,
        transform: 'translate(-100%, 0)',
      };
    case 'BOTTOM':
    default:
      return { top: targetRect.top + targetRect.height + gap, left: centerX, transform: 'translate(-50%, 0)' };
  }
}

function resolveRuntimePosition(targetRect?: RectLike | null, preferred: PositionType = 'BOTTOM'): PositionType {
  if (!targetRect) return preferred;

  const viewportWidth = typeof window !== 'undefined' ? Math.max(1, window.innerWidth || 1) : 1280;
  const viewportHeight = typeof window !== 'undefined' ? Math.max(1, window.innerHeight || 1) : 720;

  const spaceTop = targetRect.top;
  const spaceBottom = viewportHeight - (targetRect.top + targetRect.height);
  const spaceLeft = targetRect.left;
  const spaceRight = viewportWidth - (targetRect.left + targetRect.width);

  const requiredVerticalSpace = 180;
  const requiredHorizontalSpace = 260;

  const hasBottomSpace = spaceBottom >= requiredVerticalSpace;
  const hasTopSpace = spaceTop >= requiredVerticalSpace;
  const hasLeftSpace = spaceLeft >= requiredHorizontalSpace;
  const hasRightSpace = spaceRight >= requiredHorizontalSpace;

  const verticalFallback = spaceBottom >= spaceTop ? 'BOTTOM' : 'TOP';
  const horizontalFallback = spaceRight >= spaceLeft ? 'RIGHT' : 'LEFT';

  switch (preferred) {
    case 'TOP':
    case 'TOP_LEFT':
    case 'TOP_RIGHT':
      return hasTopSpace ? preferred : hasBottomSpace ? 'BOTTOM' : hasRightSpace || hasLeftSpace ? horizontalFallback : verticalFallback;
    case 'BOTTOM':
    case 'BOTTOM_LEFT':
    case 'BOTTOM_RIGHT':
      return hasBottomSpace ? preferred : hasTopSpace ? 'TOP' : hasRightSpace || hasLeftSpace ? horizontalFallback : verticalFallback;
    case 'LEFT':
      return hasLeftSpace ? preferred : hasRightSpace ? 'RIGHT' : hasTopSpace || hasBottomSpace ? verticalFallback : preferred;
    case 'RIGHT':
      return hasRightSpace ? preferred : hasLeftSpace ? 'LEFT' : hasTopSpace || hasBottomSpace ? verticalFallback : preferred;
    case 'CENTER':
      return preferred;
    default:
      return verticalFallback;
  }
}

export function Tooltip({
  open,
  title,
  content,
  targetRect,
  position = 'BOTTOM',
  stepIndex,
  totalSteps,
  showNavigation = true,
  showSkip = true,
  className,
  style,
  theme,
  onNext,
  onPrev,
  onSkip,
  onClose,
  enableKeyboardNavigation = true,
  hideArrow = false,
}: TooltipProps) {
  const cssVars = useThemeCssVars(theme);
  const isFirstStep = (stepIndex ?? 0) <= 0;
  const isLastStep = typeof totalSteps === 'number' && typeof stepIndex === 'number' ? stepIndex >= totalSteps - 1 : false;
  const effectivePosition = resolveRuntimePosition(targetRect, position);

  if (!open) return null;

  return (
    <TourPortal>
      <div className="td-layer" style={cssVars}>
        <KeyboardNavigation
          enabled={enableKeyboardNavigation && open}
          onClose={onClose}
          onNext={onNext}
          onPrev={onPrev}
          onSkip={onSkip || onClose}
        />

        <div className={`td-tooltip ${className || ''}`.trim()} style={{ ...getTooltipPosition(targetRect, effectivePosition), ...style }} role="dialog" aria-modal="false">
          {!hideArrow ? <TooltipArrow position={effectivePosition} /> : null}

          {typeof stepIndex === 'number' && typeof totalSteps === 'number' ? (
            <p className="td-tooltip__meta">Step {stepIndex + 1}/{totalSteps}</p>
          ) : null}

          {title ? <h4 className="td-tooltip__title">{title}</h4> : null}
          <p className="td-tooltip__content">{content}</p>

          {showNavigation || showSkip ? (
            <StepFooter
              currentIndex={stepIndex ?? 0}
              totalSteps={totalSteps ?? 0}
              showProgress={false}
              showSkip={showSkip}
              disablePrev={isFirstStep}
              disableNext={isLastStep}
              onNext={onNext}
              onPrev={onPrev}
              onSkip={onSkip || onClose}
            />
          ) : null}
        </div>
      </div>
    </TourPortal>
  );
}
