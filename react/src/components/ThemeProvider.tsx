import { ReactNode } from 'react';
import { OnboardingTheme, ThemeContext, resolveTheme, toThemeCssVars } from './theme';

export interface ThemeProviderProps {
  theme?: OnboardingTheme;
  children: ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const resolved = resolveTheme(theme);
  return (
    <ThemeContext.Provider value={resolved}>
      <div className="trustdev-sdk-container" style={toThemeCssVars(resolved)}>{children}</div>
    </ThemeContext.Provider>
  );
}
