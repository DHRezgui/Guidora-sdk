import { CSSProperties } from 'react';
import { PositionType } from '../types';
import { KeyboardNavigation } from './KeyboardNavigation';
import { StepFooter } from './StepFooter';
import { TooltipArrow } from './TooltipArrow';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;
const VIEWPORT_MARGIN_PX = 8;
const TOOLTIP_DEFAULT_WIDTH_PX = 360;
const TOOLTIP_DEFAULT_HEIGHT_PX = 220;
const ANCHOR_LENGTH_PX = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampTooltipAnchor(left: number, top: number, position: PositionType): Pick<CSSProperties, 'left' | 'top'> {
  if (typeof window === 'undefined') return { left, top };

  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const tooltipWidth = Math.min(TOOLTIP_DEFAULT_WIDTH_PX, Math.max(220, viewportWidth - VIEWPORT_MARGIN_PX * 2));
  const tooltipHeight = Math.min(TOOLTIP_DEFAULT_HEIGHT_PX, Math.max(140, viewportHeight - VIEWPORT_MARGIN_PX * 2));

  let minLeft = VIEWPORT_MARGIN_PX;
  let maxLeft = viewportWidth - VIEWPORT_MARGIN_PX;
  let minTop = VIEWPORT_MARGIN_PX;
  let maxTop = viewportHeight - VIEWPORT_MARGIN_PX;

  switch (position) {
    case 'TOP':
      minLeft += tooltipWidth / 2;
      maxLeft -= tooltipWidth / 2;
      minTop += tooltipHeight;
      break;
    case 'BOTTOM':
      minLeft += tooltipWidth / 2;
      maxLeft -= tooltipWidth / 2;
      maxTop -= tooltipHeight;
      break;
    case 'LEFT':
      minLeft += tooltipWidth;
      minTop += tooltipHeight / 2;
      maxTop -= tooltipHeight / 2;
      break;
    case 'RIGHT':
      maxLeft -= tooltipWidth;
      minTop += tooltipHeight / 2;
      maxTop -= tooltipHeight / 2;
      break;
    case 'TOP_LEFT':
      minTop += tooltipHeight;
      maxLeft -= tooltipWidth;
      break;
    case 'TOP_RIGHT':
      minLeft += tooltipWidth;
      minTop += tooltipHeight;
      break;
    case 'BOTTOM_LEFT':
      maxLeft -= tooltipWidth;
      maxTop -= tooltipHeight;
      break;
    case 'BOTTOM_RIGHT':
      minLeft += tooltipWidth;
      maxTop -= tooltipHeight;
      break;
    case 'CENTER':
      minLeft += tooltipWidth / 2;
      maxLeft -= tooltipWidth / 2;
      minTop += tooltipHeight / 2;
      maxTop -= tooltipHeight / 2;
      break;
    default:
      break;
  }

  const safeMinLeft = Math.min(minLeft, maxLeft);
  const safeMaxLeft = Math.max(minLeft, maxLeft);
  const safeMinTop = Math.min(minTop, maxTop);
  const safeMaxTop = Math.max(minTop, maxTop);

  return {
    left: clamp(left, safeMinLeft, safeMaxLeft),
    top: clamp(top, safeMinTop, safeMaxTop),
  };
}

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

function getAnchorOnTarget(targetRect: RectLike, position: PositionType): { x: number; y: number } {
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;
  const edgeTop = targetRect.top;
  const edgeBottom = targetRect.top + targetRect.height;
  const edgeLeft = targetRect.left;
  const edgeRight = targetRect.left + targetRect.width;

  switch (position) {
    case 'TOP':
    case 'TOP_LEFT':
    case 'TOP_RIGHT':
      return { x: centerX, y: edgeTop };
    case 'BOTTOM':
    case 'BOTTOM_LEFT':
    case 'BOTTOM_RIGHT':
      return { x: centerX, y: edgeBottom };
    case 'LEFT':
      return { x: edgeLeft, y: centerY };
    case 'RIGHT':
      return { x: edgeRight, y: centerY };
    case 'CENTER':
    default:
      return { x: centerX, y: centerY };
  }
}

function getTooltipAnchorFromTargetAnchor(
  position: PositionType,
  targetAnchorX: number,
  targetAnchorY: number,
): { x: number; y: number } {
  switch (position) {
    case 'LEFT':
    case 'TOP_LEFT':
    case 'BOTTOM_LEFT':
      return { x: targetAnchorX - ANCHOR_LENGTH_PX, y: targetAnchorY };
    case 'RIGHT':
    case 'TOP_RIGHT':
    case 'BOTTOM_RIGHT':
      return { x: targetAnchorX + ANCHOR_LENGTH_PX, y: targetAnchorY };
    case 'TOP':
      return { x: targetAnchorX, y: targetAnchorY - ANCHOR_LENGTH_PX };
    case 'BOTTOM':
    default:
      return { x: targetAnchorX, y: targetAnchorY + ANCHOR_LENGTH_PX };
  }
}

function getTooltipStyleFromAnchor(anchorX: number, anchorY: number, position: PositionType): CSSProperties {
  switch (position) {
    case 'TOP':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(-50%, -100%)',
      };
    case 'LEFT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(-100%, -50%)',
      };
    case 'RIGHT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(0, -50%)',
      };
    case 'TOP_LEFT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(-100%, -100%)',
      };
    case 'TOP_RIGHT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(0, -100%)',
      };
    case 'BOTTOM_LEFT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(-100%, 0)',
      };
    case 'BOTTOM_RIGHT':
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(0, 0)',
      };
    case 'CENTER':
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    case 'BOTTOM':
    default:
      return {
        top: anchorY,
        left: anchorX,
        transform: 'translate(-50%, 0)',
      };
  }
}

function getTooltipPosition(targetRect?: RectLike | null, position: PositionType = 'BOTTOM'): CSSProperties {
  if (!targetRect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const targetAnchor = getAnchorOnTarget(targetRect, position);
  const tooltipAnchor = getTooltipAnchorFromTargetAnchor(position, targetAnchor.x, targetAnchor.y);
  const base = getTooltipStyleFromAnchor(tooltipAnchor.x, tooltipAnchor.y, position);

  const safe = clampTooltipAnchor(base.left as number, base.top as number, position);
  return {
    ...base,
    ...safe,
    maxWidth: `min(${TOOLTIP_DEFAULT_WIDTH_PX}px, calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px))`,
  };
}

function resolveRuntimePosition(targetRect?: RectLike | null, preferred: PositionType = 'BOTTOM'): PositionType {
  if (!targetRect) return preferred;

  const viewportWidth = typeof window !== 'undefined' ? Math.max(1, window.innerWidth || 1) : 1280;
  const viewportHeight = typeof window !== 'undefined' ? Math.max(1, window.innerHeight || 1) : 720;

  const leftPct = (targetRect.left / viewportWidth) * 100;
  const rightPct = ((targetRect.left + targetRect.width) / viewportWidth) * 100;
  const topPct = (targetRect.top / viewportHeight) * 100;
  const bottomPct = ((targetRect.top + targetRect.height) / viewportHeight) * 100;

  let pos: PositionType = preferred || 'BOTTOM';

  // Same heuristics as dashboard TourSimulator (resolveTooltipPlacement).
  if ((pos === 'RIGHT' || pos === 'TOP_RIGHT' || pos === 'BOTTOM_RIGHT') && rightPct > 76) {
    pos = pos === 'RIGHT' ? 'LEFT' : pos === 'TOP_RIGHT' ? 'TOP_LEFT' : 'BOTTOM_LEFT';
  } else if ((pos === 'LEFT' || pos === 'TOP_LEFT' || pos === 'BOTTOM_LEFT') && leftPct < 24) {
    pos = pos === 'LEFT' ? 'RIGHT' : pos === 'TOP_LEFT' ? 'TOP_RIGHT' : 'BOTTOM_RIGHT';
  }

  if ((pos === 'BOTTOM' || pos === 'BOTTOM_LEFT' || pos === 'BOTTOM_RIGHT') && bottomPct > 78) {
    pos = pos === 'BOTTOM' ? 'TOP' : pos === 'BOTTOM_LEFT' ? 'TOP_LEFT' : 'TOP_RIGHT';
  } else if ((pos === 'TOP' || pos === 'TOP_LEFT' || pos === 'TOP_RIGHT') && topPct < 20) {
    pos = pos === 'TOP' ? 'BOTTOM' : pos === 'TOP_LEFT' ? 'BOTTOM_LEFT' : 'BOTTOM_RIGHT';
  }

  return pos;
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
  const computedStyle = getTooltipPosition(targetRect, effectivePosition);

  if (!open) return null;

  return (
    <TourPortal>
      <div className="td-layer td-layer--tooltip" style={cssVars}>
        <KeyboardNavigation
          enabled={enableKeyboardNavigation && open}
          onClose={onClose}
          onNext={onNext}
          onPrev={onPrev}
          onSkip={onSkip || onClose}
        />

        <div className={`td-tooltip ${className || ''}`.trim()} style={{ ...computedStyle, ...style }} role="dialog" aria-modal="false">
          {!hideArrow ? <TooltipArrow position={effectivePosition} /> : null}

          {onClose ? (
            <button type="button" className="td-tooltip__close" onClick={onClose} aria-label="Close tooltip">
              x
            </button>
          ) : null}

          {title ? <h4 className="td-tooltip__title">{title}</h4> : null}
          <p className="td-tooltip__content">{content}</p>

          {showNavigation || showSkip ? (
            <StepFooter
              currentIndex={stepIndex ?? 0}
              totalSteps={totalSteps ?? 0}
              showProgress={true}
              showSkip={showSkip}
              disablePrev={isFirstStep}
              disableNext={false}
              nextLabel={isLastStep ? 'Terminer' : 'Suivant'}
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
