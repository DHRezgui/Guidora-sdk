import { CSSProperties, useMemo } from 'react';
import { OnboardingTheme, useThemeCssVars } from './theme';

export interface TourOverlayProps {
  open: boolean;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  onClick?: () => void;
}

export function TourOverlay({ open, className, style, theme, onClick }: TourOverlayProps) {
  const cssVars = useThemeCssVars(theme);
  const mergedStyle = useMemo(() => ({ ...cssVars, ...style }), [cssVars, style]);

  if (!open) return null;

  return (
    <div
      className={`td-overlay ${className || ''}`.trim()}
      style={mergedStyle}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}
