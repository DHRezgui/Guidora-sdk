import { CSSProperties } from 'react';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

export interface HighlightProps {
  open: boolean;
  targetRect?: RectLike | null;
  padding?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  withOverlay?: boolean;
  onOverlayClick?: () => void;
}

export function Highlight({
  open,
  targetRect,
  padding = 8,
  borderRadius = 10,
  className,
  style,
  theme,
  withOverlay = true,
  onOverlayClick,
}: HighlightProps) {
  const cssVars = useThemeCssVars(theme);

  if (!open || !targetRect) return null;

  // Keep highlight anchored to the real selector position, even when partially off-screen.
  const top = Math.round(targetRect.top - padding);
  const left = Math.round(targetRect.left - padding);
  const width = Math.round(targetRect.width + padding * 2);
  const height = Math.round(targetRect.height + padding * 2);
  const rightStart = left + width;
  const bottomStart = top + height;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(viewportWidth, rightStart);
  const clippedWidth = Math.max(0, clippedRight - clippedLeft);
  const showTopEdgeLine = top < 0 && clippedWidth > 0;
  const showBottomEdgeLine = bottomStart > viewportHeight && clippedWidth > 0;

  // Overlay cuts must remain non-negative even if target is outside viewport.
  const overlayTop = Math.max(0, top);
  const overlayLeft = Math.max(0, left);
  const overlayRightStart = Math.max(0, rightStart);
  const overlayBottomStart = Math.max(0, bottomStart);
  const overlayMiddleHeight = Math.max(0, overlayBottomStart - overlayTop);

  const overlayPieceStyle: CSSProperties = {
    position: 'fixed',
    background: 'var(--td-overlay-color)',
    pointerEvents: 'auto',
  };

  return (
    <TourPortal>
      <div className="td-layer td-layer--highlight" style={cssVars}>
        {withOverlay ? (
          <>
            <div
              style={{
                ...overlayPieceStyle,
                top: 0,
                left: 0,
                right: 0,
                height: overlayTop,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayTop,
                left: 0,
                width: overlayLeft,
                height: overlayMiddleHeight,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayTop,
                left: overlayRightStart,
                right: 0,
                height: overlayMiddleHeight,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayBottomStart,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
          </>
        ) : null}
        <div
          className={`td-highlight ${className || ''}`.trim()}
          style={{
            top,
            left,
            width,
            height,
            borderRadius,
            ...style,
          }}
          aria-hidden="true"
        />
        {showTopEdgeLine ? (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: 0,
              left: clippedLeft,
              width: clippedWidth,
              height: 2,
              borderRadius: 999,
              background: 'rgba(249, 115, 22, 0.9)',
              boxShadow: '0 0 0 3px rgba(148, 163, 184, 0.38)',
              pointerEvents: 'none',
              zIndex: 'calc(var(--td-z-index) + 1)',
            }}
          />
        ) : null}
        {showBottomEdgeLine ? (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              bottom: 0,
              left: clippedLeft,
              width: clippedWidth,
              height: 2,
              borderRadius: 999,
              background: 'rgba(249, 115, 22, 0.9)',
              boxShadow: '0 0 0 3px rgba(148, 163, 184, 0.38)',
              pointerEvents: 'none',
              zIndex: 'calc(var(--td-z-index) + 1)',
            }}
          />
        ) : null}
      </div>
    </TourPortal>
  );
}
