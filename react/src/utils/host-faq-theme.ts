import type { CSSProperties } from 'react';
import {
  detectHostAppTheme,
  normalizeHostColorToken,
  parseCssColorToRgb,
  pickReadableTextColor,
  resolveAutoFaqThemeAppearance,
  rgbRelativeLuminance,
  type FaqThemeAppearance,
} from './faq-theme';

export interface ResolveHostFaqThemeOptions {
  /** Optional host element to mirror (e.g. `'[data-tour-id="main-dashboard-panel"]'`). */
  referenceSelector?: string;
  root?: Document;
}

export interface HostFaqThemeSnapshot {
  appearance: FaqThemeAppearance;
  cssVars: CSSProperties;
  mappedTokenCount: number;
}

interface HostTokenMapping {
  faqVar: string;
  hostVars: string[];
}

const HOST_FAQ_TOKEN_MAPPINGS: HostTokenMapping[] = [
  { faqVar: '--td-faq-surface-sidebar', hostVars: ['--card', '--background', '--surface'] },
  { faqVar: '--td-faq-surface-panel', hostVars: ['--card', '--background'] },
  { faqVar: '--td-faq-surface-tab', hostVars: ['--card', '--secondary', '--background'] },
  { faqVar: '--td-faq-surface-launcher', hostVars: ['--card', '--secondary', '--background'] },
  { faqVar: '--td-faq-surface', hostVars: ['--secondary', '--muted', '--accent'] },
  { faqVar: '--td-faq-surface-hover', hostVars: ['--accent', '--secondary'] },
  { faqVar: '--td-faq-title', hostVars: ['--foreground', '--card-foreground', '--text'] },
  { faqVar: '--td-faq-text', hostVars: ['--foreground', '--card-foreground'] },
  { faqVar: '--td-faq-muted', hostVars: ['--muted-foreground', '--secondary-foreground'] },
  { faqVar: '--td-faq-accent', hostVars: ['--primary'] },
  { faqVar: '--td-faq-accent-text', hostVars: ['--primary-foreground', '--accent-foreground'] },
  { faqVar: '--td-faq-border', hostVars: ['--border'] },
  { faqVar: '--td-faq-border-soft', hostVars: ['--border', '--input'] },
  { faqVar: '--td-faq-border-accent', hostVars: ['--primary', '--ring', '--border'] },
  { faqVar: '--td-faq-input-bg', hostVars: ['--background', '--input'] },
  { faqVar: '--td-faq-input-border', hostVars: ['--input', '--border'] },
  { faqVar: '--td-faq-chip-bg', hostVars: ['--accent', '--secondary', '--muted'] },
  { faqVar: '--td-faq-launcher-text', hostVars: ['--foreground', '--card-foreground'] },
  { faqVar: '--td-faq-error', hostVars: ['--destructive'] },
];

const LIGHT_FALLBACK: Record<string, string> = {
  '--td-faq-text': '#334155',
  '--td-faq-title': '#0f172a',
  '--td-faq-muted': '#64748b',
  '--td-faq-accent': '#2563eb',
  '--td-faq-accent-text': '#1e3a8a',
  '--td-faq-surface': '#f8fafc',
  '--td-faq-surface-hover': '#f1f5f9',
  '--td-faq-surface-panel': '#ffffff',
  '--td-faq-surface-sidebar': '#ffffff',
  '--td-faq-surface-tab': '#ffffff',
  '--td-faq-surface-launcher': '#ffffff',
  '--td-faq-border': '#e2e8f0',
  '--td-faq-border-soft': '#e2e8f0',
  '--td-faq-border-accent': '#cbd5e1',
  '--td-faq-input-bg': '#ffffff',
  '--td-faq-input-border': '#cbd5e1',
  '--td-faq-backdrop': 'rgba(15, 23, 42, 0.12)',
  '--td-faq-error': '#e11d48',
  '--td-faq-chip-bg': '#f1f5f9',
  '--td-faq-chip-text': '#1e3a8a',
  '--td-faq-shadow': '0 14px 36px rgba(15, 23, 42, 0.12)',
  '--td-faq-launcher-text': '#0f172a',
};

const DARK_FALLBACK: Record<string, string> = {
  '--td-faq-text': '#e2e8f0',
  '--td-faq-title': '#f8fafc',
  '--td-faq-muted': 'rgba(148, 163, 184, 0.95)',
  '--td-faq-accent': '#60a5fa',
  '--td-faq-accent-text': '#dbeafe',
  '--td-faq-surface': 'rgba(15, 23, 42, 0.55)',
  '--td-faq-surface-hover': 'rgba(30, 41, 59, 0.62)',
  '--td-faq-surface-panel': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-surface-sidebar': 'rgba(15, 23, 42, 0.96)',
  '--td-faq-surface-tab': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-surface-launcher': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-border': 'rgba(255, 255, 255, 0.22)',
  '--td-faq-border-soft': 'rgba(148, 163, 184, 0.25)',
  '--td-faq-border-accent': 'rgba(96, 165, 250, 0.45)',
  '--td-faq-input-bg': 'rgba(15, 23, 42, 0.75)',
  '--td-faq-input-border': 'rgba(148, 163, 184, 0.35)',
  '--td-faq-backdrop': 'rgba(2, 6, 23, 0.45)',
  '--td-faq-error': '#fda4af',
  '--td-faq-chip-bg': 'rgba(30, 41, 59, 0.72)',
  '--td-faq-chip-text': '#e2e8f0',
  '--td-faq-shadow': '0 14px 36px rgba(2, 6, 23, 0.5)',
  '--td-faq-launcher-text': '#f8fafc',
};

function readCssVariable(styles: CSSStyleDeclaration, name: string): string | null {
  const value = styles.getPropertyValue(name).trim();
  return value || null;
}

function readFirstHostToken(stylesList: CSSStyleDeclaration[], hostVars: string[]): string | null {
  for (const styles of stylesList) {
    for (const hostVar of hostVars) {
      const value = readCssVariable(styles, hostVar);
      if (value) return value;
    }
  }
  return null;
}

function readReferenceSurface(reference: Element): Partial<Record<string, string>> {
  if (typeof window === 'undefined') return {};

  const computed = window.getComputedStyle(reference);
  const vars: Partial<Record<string, string>> = {};

  if (computed.color) {
    vars['--td-faq-title'] = computed.color;
    vars['--td-faq-text'] = computed.color;
    vars['--td-faq-launcher-text'] = computed.color;
  }

  if (computed.borderColor && computed.borderColor !== 'rgba(0, 0, 0, 0)') {
    vars['--td-faq-border'] = computed.borderColor;
    vars['--td-faq-border-soft'] = computed.borderColor;
  }

  return vars;
}

function normalizeRadius(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

function deriveBackdrop(background: string | undefined, appearance: FaqThemeAppearance): string {
  if (!background) {
    return appearance === 'light' ? LIGHT_FALLBACK['--td-faq-backdrop'] : DARK_FALLBACK['--td-faq-backdrop'];
  }

  const rgb = parseCssColorToRgb(background);
  if (!rgb) {
    return appearance === 'light' ? LIGHT_FALLBACK['--td-faq-backdrop'] : DARK_FALLBACK['--td-faq-backdrop'];
  }

  const alpha = appearance === 'light' ? 0.12 : 0.45;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function deriveShadow(appearance: FaqThemeAppearance): string {
  return appearance === 'light' ? LIGHT_FALLBACK['--td-faq-shadow'] : DARK_FALLBACK['--td-faq-shadow'];
}

const PANEL_SURFACE_VARS = new Set(['--td-faq-surface-sidebar', '--td-faq-surface-panel']);

function assignMappedHostColor(
  cssVars: Record<string, string>,
  faqVar: string,
  rawValue: string,
  fallback: Record<string, string>,
): boolean {
  const normalized = normalizeHostColorToken(rawValue);
  if (!normalized) return false;

  if (PANEL_SURFACE_VARS.has(faqVar) && !parseCssColorToRgb(normalized)) {
    cssVars[faqVar] = fallback[faqVar] ?? normalized;
    return true;
  }

  cssVars[faqVar] = normalized;
  return true;
}

/** Maps host design tokens to FAQ CSS variables for chameleon theming. */
export function resolveHostFaqTheme(options: ResolveHostFaqThemeOptions = {}): HostFaqThemeSnapshot {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      appearance: 'dark',
      cssVars: { ...DARK_FALLBACK },
      mappedTokenCount: 0,
    };
  }

  const doc = options.root ?? document;
  const appearance = detectHostAppTheme(doc)?.appearance ?? resolveAutoFaqThemeAppearance(doc).appearance;
  const fallback = appearance === 'light' ? LIGHT_FALLBACK : DARK_FALLBACK;

  const styleSources: CSSStyleDeclaration[] = [window.getComputedStyle(doc.documentElement)];
  if (doc.body) styleSources.push(window.getComputedStyle(doc.body));

  let referenceElement: Element | null = null;
  if (options.referenceSelector?.trim()) {
    try {
      referenceElement = doc.querySelector(options.referenceSelector);
    } catch {
      referenceElement = null;
    }
  }

  if (referenceElement) {
    styleSources.unshift(window.getComputedStyle(referenceElement));
  }

  const cssVars: Record<string, string> = { ...fallback };
  let mappedTokenCount = 0;

  if (referenceElement) {
    const referenceVars = readReferenceSurface(referenceElement);
    for (const [key, value] of Object.entries(referenceVars)) {
      if (!value) continue;
      cssVars[key] = value;
      mappedTokenCount += 1;
    }
  }

  for (const mapping of HOST_FAQ_TOKEN_MAPPINGS) {
    const value = readFirstHostToken(styleSources, mapping.hostVars);
    if (!value) continue;
    if (assignMappedHostColor(cssVars, mapping.faqVar, value, fallback)) {
      mappedTokenCount += 1;
    }
  }

  const fontFamily = doc.body
    ? window.getComputedStyle(doc.body).fontFamily
    : window.getComputedStyle(doc.documentElement).fontFamily;
  if (fontFamily) {
    // Keep a real sans fallback: unloaded host fonts (e.g. Geist after next/font removal)
    // otherwise resolve to the browser default serif and break chameleon UI.
    const hasGenericSans = /sans-serif|system-ui|ui-sans-serif/i.test(fontFamily);
    cssVars['--td-font-family'] = hasGenericSans
      ? fontFamily
      : `${fontFamily}, system-ui, -apple-system, sans-serif`;
    mappedTokenCount += 1;
  }

  const radius = readFirstHostToken(styleSources, ['--radius', '--border-radius']);
  const normalizedRadius = radius ? normalizeRadius(radius) : null;
  if (normalizedRadius) {
    cssVars['--td-faq-radius'] = normalizedRadius;
    mappedTokenCount += 1;
  }

  const surfaceBackground =
    cssVars['--td-faq-surface-sidebar'] ?? cssVars['--td-faq-surface-panel'] ?? cssVars['--td-faq-surface'];
  cssVars['--td-faq-backdrop'] = deriveBackdrop(surfaceBackground, appearance);
  cssVars['--td-faq-shadow'] = deriveShadow(appearance);

  if (cssVars['--td-faq-accent'] && cssVars['--td-faq-accent-text']) {
    const accentRgb = parseCssColorToRgb(cssVars['--td-faq-accent']);
    const accentTextRgb = parseCssColorToRgb(cssVars['--td-faq-accent-text']);
    if (accentRgb && accentTextRgb) {
      const contrastDelta = Math.abs(rgbRelativeLuminance(accentRgb) - rgbRelativeLuminance(accentTextRgb));
      if (contrastDelta < 0.2) {
        cssVars['--td-faq-accent-text'] = appearance === 'light' ? cssVars['--td-faq-title'] : cssVars['--td-faq-text'];
      }
    }
  }

  cssVars['--td-faq-chip-text'] = pickReadableTextColor(cssVars['--td-faq-chip-bg'], {
    lightText: cssVars['--td-faq-text'] ?? fallback['--td-faq-text'],
    darkText: cssVars['--td-faq-title'] ?? fallback['--td-faq-title'],
  });

  return {
    appearance,
    cssVars,
    mappedTokenCount,
  };
}

export function hostFaqThemeCssVarsToStyle(cssVars: Record<string, string>): CSSProperties {
  return cssVars as CSSProperties;
}
