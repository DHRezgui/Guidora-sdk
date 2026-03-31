import { createContext, CSSProperties, useContext, useMemo } from 'react';

export interface OnboardingTheme {
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
  overlayColor?: string;
  borderRadius?: string;
  fontFamily?: string;
  zIndex?: number;
  shadow?: string;
}

const DEFAULT_THEME: Required<OnboardingTheme> = {
  primaryColor: '#0F766E',
  textColor: '#0F172A',
  backgroundColor: '#FFFFFF',
  mutedTextColor: '#64748B',
  borderColor: '#CBD5E1',
  overlayColor: 'rgba(15, 23, 42, 0.55)',
  borderRadius: '10px',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  zIndex: 9999,
  shadow: '0 18px 50px rgba(2, 6, 23, 0.22)',
};

export const ThemeContext = createContext<Required<OnboardingTheme>>(DEFAULT_THEME);

export function resolveTheme(theme?: OnboardingTheme): Required<OnboardingTheme> {
  return {
    ...DEFAULT_THEME,
    ...(theme || {}),
  };
}

export function useOnboardingTheme(theme?: OnboardingTheme): Required<OnboardingTheme> {
  const contextTheme = useContext(ThemeContext);
  return useMemo(
    () => ({
      ...contextTheme,
      ...(theme || {}),
    }),
    [contextTheme, theme],
  );
}

export function toThemeCssVars(theme?: OnboardingTheme): CSSProperties {
  const resolved = resolveTheme(theme);
  return {
    ['--td-primary-color' as string]: resolved.primaryColor,
    ['--td-text-color' as string]: resolved.textColor,
    ['--td-bg-color' as string]: resolved.backgroundColor,
    ['--td-muted-color' as string]: resolved.mutedTextColor,
    ['--td-border-color' as string]: resolved.borderColor,
    ['--td-overlay-color' as string]: resolved.overlayColor,
    ['--td-border-radius' as string]: resolved.borderRadius,
    ['--td-font-family' as string]: resolved.fontFamily,
    ['--td-z-index' as string]: String(resolved.zIndex),
    ['--td-shadow' as string]: resolved.shadow,
  } as CSSProperties;
}

export function useThemeCssVars(theme?: OnboardingTheme): CSSProperties {
  const merged = useOnboardingTheme(theme);
  return useMemo(() => toThemeCssVars(merged), [merged]);
}
