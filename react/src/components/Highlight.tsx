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

  // Snap to integer pixels to avoid sub-pixel anti-aliasing color drift.
  const top = Math.round(Math.max(0, targetRect.top - padding));
  const left = Math.round(Math.max(0, targetRect.left - padding));
  const width = Math.round(targetRect.width + padding * 2);
  const height = Math.round(targetRect.height + padding * 2);
  const rightStart = left + width;
  const bottomStart = top + height;

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
                height: top,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top,
                left: 0,
                width: left,
                height,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top,
                left: rightStart,
                right: 0,
                height,
              }}
              onClick={onOverlayClick}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: bottomStart,
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
      </div>
    </TourPortal>
  );
}
