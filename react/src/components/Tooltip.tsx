import { CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { PositionType } from '../types';
import { KeyboardNavigation } from './KeyboardNavigation';
import { StepFooter } from './StepFooter';
import { FlexibleTooltipArrow } from './TooltipArrow';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;
const VIEWPORT_MARGIN_PX = 8;
const TOOLTIP_DEFAULT_WIDTH_PX = 360;
// Keep visible breathing room between target edge and tooltip edge.
const ANCHOR_LENGTH_PX = 84;

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
      return { x: targetAnchorX - ANCHOR_LENGTH_PX, y: targetAnchorY };
    case 'RIGHT':
      return { x: targetAnchorX + ANCHOR_LENGTH_PX, y: targetAnchorY };
    case 'TOP_LEFT':
      return { x: targetAnchorX - ANCHOR_LENGTH_PX, y: targetAnchorY - ANCHOR_LENGTH_PX };
    case 'TOP_RIGHT':
      return { x: targetAnchorX + ANCHOR_LENGTH_PX, y: targetAnchorY - ANCHOR_LENGTH_PX };
    case 'BOTTOM_LEFT':
      return { x: targetAnchorX - ANCHOR_LENGTH_PX, y: targetAnchorY + ANCHOR_LENGTH_PX };
    case 'BOTTOM_RIGHT':
      return { x: targetAnchorX + ANCHOR_LENGTH_PX, y: targetAnchorY + ANCHOR_LENGTH_PX };
    case 'TOP':
      return { x: targetAnchorX, y: targetAnchorY - ANCHOR_LENGTH_PX };
    case 'BOTTOM':
    default:
      return { x: targetAnchorX, y: targetAnchorY + ANCHOR_LENGTH_PX };
  }
}

function getTooltipPositionFromArrowAnchor(
  arrowAnchorX: number,
  arrowAnchorY: number,
  placement: PositionType,
  viewportWidth: number,
  viewportHeight: number,
): { top: string; left: string; transform: string } {
  const anchorPctX = (arrowAnchorX / Math.max(1, viewportWidth)) * 100;
  const anchorPctY = (arrowAnchorY / Math.max(1, viewportHeight)) * 100;

  switch (placement) {
    case 'TOP':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(-50%, -100%)' };
    case 'LEFT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(-100%, -50%)' };
    case 'RIGHT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(0, -50%)' };
    case 'TOP_LEFT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(-100%, -100%)' };
    case 'TOP_RIGHT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(0, -100%)' };
    case 'BOTTOM_LEFT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(-100%, 0)' };
    case 'BOTTOM_RIGHT':
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(0, 0)' };
    case 'CENTER':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'BOTTOM':
    default:
      return { top: `${anchorPctY}%`, left: `${anchorPctX}%`, transform: 'translate(-50%, 0)' };
  }
}

function clampTooltipStyle(style: { top: string; left: string; transform: string }) {
  const topMatch = style.top.match(/-?\d+(?:\.\d+)?/);
  const leftMatch = style.left.match(/-?\d+(?:\.\d+)?/);
  if (!topMatch || !leftMatch) return style;

  const rawTop = Number(topMatch[0]);
  const rawLeft = Number(leftMatch[0]);

  let minLeft = 2;
  let maxLeft = 98;
  let minTop = 2;
  let maxTop = 98;

  if (style.transform.includes('translate(-50%')) {
    minLeft = 16;
    maxLeft = 84;
  } else if (style.transform.includes('translate(-100%')) {
    minLeft = 26;
    maxLeft = 98;
  } else if (style.transform.includes('translate(0')) {
    minLeft = 2;
    maxLeft = 74;
  }

  if (style.transform.includes('-100%)')) {
    minTop = 20;
    maxTop = 98;
  } else if (style.transform.includes('-50%')) {
    minTop = 10;
    maxTop = 90;
  } else {
    minTop = 2;
    maxTop = 78;
  }

  return {
    ...style,
    top: `${Math.max(minTop, Math.min(maxTop, rawTop))}%`,
    left: `${Math.max(minLeft, Math.min(maxLeft, rawLeft))}%`,
  };
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
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
  const base = getTooltipPositionFromArrowAnchor(tooltipAnchor.x, tooltipAnchor.y, position, viewportWidth, viewportHeight);
  const safe = clampTooltipStyle(base);
  return {
    ...safe,
    maxWidth: `min(${TOOLTIP_DEFAULT_WIDTH_PX}px, calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px))`,
  };
}

function getRectBoundaryPoint(
  rect: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>,
  toward: { x: number; y: number },
): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }

  const halfW = Math.max(1, rect.width / 2);
  const halfH = Math.max(1, rect.height / 2);
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
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
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipRect, setTooltipRect] = useState<Pick<DOMRect, 'top' | 'left' | 'width' | 'height'> | null>(null);
  const cssVars = useThemeCssVars(theme);
  const isFirstStep = (stepIndex ?? 0) <= 0;
  const isLastStep = typeof totalSteps === 'number' && typeof stepIndex === 'number' ? stepIndex >= totalSteps - 1 : false;
  const effectivePosition = resolveRuntimePosition(targetRect, position);
  const computedStyle = getTooltipPosition(targetRect, effectivePosition);
  const targetAnchor = targetRect ? getAnchorOnTarget(targetRect, effectivePosition) : null;
  const connectorStart = tooltipRect && targetAnchor
    ? getRectBoundaryPoint(tooltipRect, targetAnchor)
    : targetAnchor
      ? getTooltipAnchorFromTargetAnchor(effectivePosition, targetAnchor.x, targetAnchor.y)
    : null;

  useLayoutEffect(() => {
    if (!open) return;
    const node = tooltipRef.current;
    if (!node) return;

    const updateRect = () => {
      const rect = node.getBoundingClientRect();
      setTooltipRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updateRect();
    const rafId = window.requestAnimationFrame(updateRect);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, computedStyle.left, computedStyle.top, computedStyle.transform, content, title, stepIndex, totalSteps]);

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

        <div
          ref={tooltipRef}
          className={`td-tooltip ${className || ''}`.trim()}
          style={{ ...computedStyle, ...style }}
          role="dialog"
          aria-modal="false"
        >

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
        {!hideArrow ? <FlexibleTooltipArrow from={connectorStart} to={targetAnchor} /> : null}
      </div>
    </TourPortal>
  );
}
