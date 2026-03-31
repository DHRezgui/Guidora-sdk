import { CSSProperties } from 'react';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

export interface BeaconProps {
  open: boolean;
  targetRect?: RectLike | null;
  size?: number;
  pulse?: boolean;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  onClick?: () => void;
}

export function Beacon({
  open,
  targetRect,
  size = 18,
  pulse = true,
  className,
  style,
  theme,
  onClick,
}: BeaconProps) {
  const cssVars = useThemeCssVars(theme);

  if (!open || !targetRect) return null;

  const top = targetRect.top + targetRect.height / 2;
  const left = targetRect.left + targetRect.width / 2;

  return (
    <TourPortal>
      <div className="td-layer" style={cssVars}>
        <button
          type="button"
          className={`td-beacon ${pulse ? 'td-beacon--pulse' : ''} ${className || ''}`.trim()}
          style={{ top, left, width: size, height: size, ...style }}
          onClick={onClick}
          aria-label="Open guide"
        />
      </div>
    </TourPortal>
  );
}
