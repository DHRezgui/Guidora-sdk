import { CSSProperties } from 'react';
import { TourOverlay } from './TourOverlay';
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

  const top = Math.max(0, targetRect.top - padding);
  const left = Math.max(0, targetRect.left - padding);
  const width = targetRect.width + padding * 2;
  const height = targetRect.height + padding * 2;

  return (
    <TourPortal>
      <div className="td-layer td-layer--highlight" style={cssVars}>
        {withOverlay ? <TourOverlay open={open} onClick={onOverlayClick} /> : null}
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
