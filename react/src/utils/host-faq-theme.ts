import type { CSSProperties } from 'react';
import {
  appearanceFromRgb,
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
  { faqVar: '--td-faq-accent', hostVars: ['--primary', '--color-primary', '--sidebar-primary', '--ring', '--brand'] },
  { faqVar: '--td-faq-accent-text', hostVars: ['--primary-foreground', '--color-primary-foreground', '--sidebar-primary-foreground'] },
  { faqVar: '--td-faq-border', hostVars: ['--border'] },
  { faqVar: '--td-faq-border-soft', hostVars: ['--border', '--input'] },
  { faqVar: '--td-faq-border-accent', hostVars: ['--primary', '--color-primary', '--ring', '--border'] },
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
  // Align with SDK tour `--td-primary-color` (not Phoenix orange / not hard-coded blue).
  '--td-faq-accent': '#0f766e',
  '--td-faq-accent-text': '#ffffff',
  '--td-faq-surface': '#f8fafc',
  '--td-faq-surface-hover': '#f1f5f9',
  '--td-faq-surface-panel': '#ffffff',
  '--td-faq-surface-sidebar': '#ffffff',
  '--td-faq-surface-tab': '#ffffff',
  '--td-faq-surface-launcher': '#ffffff',
  '--td-faq-border': '#e2e8f0',
  '--td-faq-border-soft': '#e2e8f0',
  '--td-faq-border-accent': '#99f6e4',
  '--td-faq-input-bg': '#ffffff',
  '--td-faq-input-border': '#cbd5e1',
  '--td-faq-backdrop': 'rgba(15, 23, 42, 0.12)',
  '--td-faq-error': '#e11d48',
  '--td-faq-chip-bg': '#ecfdf5',
  '--td-faq-chip-text': '#0f766e',
  '--td-faq-shadow': '0 14px 36px rgba(15, 23, 42, 0.12)',
  '--td-faq-launcher-text': '#0f172a',
};

const DARK_FALLBACK: Record<string, string> = {
  '--td-faq-text': '#e2e8f0',
  '--td-faq-title': '#f8fafc',
  '--td-faq-muted': 'rgba(148, 163, 184, 0.95)',
  '--td-faq-accent': '#2dd4bf',
  '--td-faq-accent-text': '#042f2e',
  '--td-faq-surface': 'rgba(15, 23, 42, 0.55)',
  '--td-faq-surface-hover': 'rgba(30, 41, 59, 0.62)',
  '--td-faq-surface-panel': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-surface-sidebar': 'rgba(15, 23, 42, 0.96)',
  '--td-faq-surface-tab': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-surface-launcher': 'rgba(15, 23, 42, 0.92)',
  '--td-faq-border': 'rgba(255, 255, 255, 0.22)',
  '--td-faq-border-soft': 'rgba(148, 163, 184, 0.25)',
  '--td-faq-border-accent': 'rgba(45, 212, 191, 0.45)',
  '--td-faq-input-bg': 'rgba(15, 23, 42, 0.75)',
  '--td-faq-input-border': 'rgba(148, 163, 184, 0.35)',
  '--td-faq-backdrop': 'rgba(2, 6, 23, 0.45)',
  '--td-faq-error': '#fda4af',
  '--td-faq-chip-bg': 'rgba(30, 41, 59, 0.72)',
  '--td-faq-chip-text': '#5eead4',
  '--td-faq-shadow': '0 14px 36px rgba(2, 6, 23, 0.5)',
  '--td-faq-launcher-text': '#f8fafc',
};

/** Accent keys: omit from inline seed so CSS can use `var(--td-primary-color)` until host maps. */
const DEFERRED_ACCENT_VARS = [
  '--td-faq-accent',
  '--td-faq-accent-text',
  '--td-faq-chip-text',
  '--td-faq-border-accent',
] as const;

function readCssVariable(styles: CSSStyleDeclaration, name: string): string | null {
  const value = styles.getPropertyValue(name).trim();
  return value || null;
}

/**
 * Resolves a CSS variable to a concrete color (rgb/hex).
 * Uses a probe element so `oklch()`, `var(--token)`, and late-injected themes all work.
 */
function resolveCssVariableColor(
  varName: string,
  styleSources: CSSStyleDeclaration[],
  doc: Document,
): string | null {
  let raw: string | null = null;
  for (const styles of styleSources) {
    raw = readCssVariable(styles, varName);
    if (raw) break;
  }

  if (raw) {
    const normalized = normalizeHostColorToken(raw);
    if (normalized && parseCssColorToRgb(normalized)) {
      return normalized;
    }
  }

  if (typeof window === 'undefined' || typeof doc.createElement !== 'function') {
    return raw ? normalizeHostColorToken(raw) : null;
  }

  const mountParent = doc.documentElement ?? doc.body;
  if (!mountParent || typeof (mountParent as ParentNode).appendChild !== 'function') {
    return raw ? normalizeHostColorToken(raw) : null;
  }

  try {
    const probe = doc.createElement('div');
    probe.setAttribute('data-trustdev-theme-probe', 'true');
    probe.style.cssText =
      'position:absolute;left:-99999px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
    mountParent.appendChild(probe);
    probe.style.setProperty('color', raw && !/^var\(/i.test(raw) ? raw : `var(${varName})`);
    const computed = window.getComputedStyle(probe).color;
    probe.remove();

    const fromComputed = normalizeHostColorToken(computed);
    if (fromComputed && parseCssColorToRgb(fromComputed)) {
      // Ignore fully transparent / default black when var failed to resolve.
      const rgb = parseCssColorToRgb(fromComputed);
      if (rgb && !(rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0 && !raw)) {
        return fromComputed;
      }
      if (rgb && raw) return fromComputed;
    }
  } catch {
    // Probe unavailable (tests / constrained DOM) — fall through.
  }

  return raw ? normalizeHostColorToken(raw) : null;
}

/**
 * Last-resort accent: sample a painted host primary control (e.g. Tailwind `bg-primary`).
 * Used when CSS variables are late or not readable via getPropertyValue.
 */
function sampleHostPrimaryFromDom(doc: Document): string | null {
  if (typeof window === 'undefined') return null;

  const selectors = [
    '.bg-primary',
    'button.bg-primary',
    '[class~="bg-primary"]',
    '.bg-sidebar-primary',
    '[data-active="true"].bg-primary',
  ];

  for (const selector of selectors) {
    try {
      const nodes = doc.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest('[data-trustdev-help-sidebar], [data-trustdev-faq-panel], [data-trustdev-theme-probe]')) {
          continue;
        }
        const bg = window.getComputedStyle(node).backgroundColor;
        const rgb = parseCssColorToRgb(bg);
        if (!rgb) continue;
        // Skip near-white / near-black / grey surfaces.
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 25 || min > 245) continue;
        if (max - min < 15) continue;
        return `rgb(${r}, ${g}, ${b})`;
      }
    } catch {
      // invalid selector in this environment
    }
  }

  return null;
}

function readFirstHostToken(
  stylesList: CSSStyleDeclaration[],
  hostVars: string[],
  doc?: Document,
): string | null {
  if (doc) {
    for (const hostVar of hostVars) {
      const resolved = resolveCssVariableColor(hostVar, stylesList, doc);
      if (resolved) return resolved;
    }
    return null;
  }

  for (const styles of stylesList) {
    for (const hostVar of hostVars) {
      const value = readCssVariable(styles, hostVar);
      if (value) return value;
    }
  }
  return null;
}

/** Raw CSS variable read (lengths, fonts, etc.) — never runs the color pipeline. */
function readFirstHostTokenRaw(
  stylesList: CSSStyleDeclaration[],
  hostVars: string[],
): string | null {
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
  // Guard: color pipeline must never feed radius (e.g. `rgb(0,0,0)` → square corners).
  if (
    /^(#|rgba?\(|hsla?\(|lab\(|oklch\(|oklab\(|color\()/i.test(trimmed) ||
    /^[a-z]+$/i.test(trimmed)
  ) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  if (/^\d+(\.\d+)?(px|rem|em|%)$/i.test(trimmed)) return trimmed;
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

/** WCAG contrast ratio between two sRGB colors. */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = rgbRelativeLuminance(a);
  const l2 = rgbRelativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Text/icon color on accent fills (Rechercher, "?"). Prefer host primary-foreground when
 * contrast is strong; otherwise force white/near-black for legibility.
 */
function resolveAccentForeground(accent: string | undefined, mappedForeground: string | undefined): string {
  const readable = pickReadableTextColor(accent, {
    lightText: '#ffffff',
    darkText: '#0f172a',
  });
  if (!mappedForeground || !accent) return readable;

  const accentRgb = parseCssColorToRgb(accent);
  const fgRgb = parseCssColorToRgb(mappedForeground);
  if (!accentRgb || !fgRgb) return readable;

  return contrastRatio(accentRgb, fgRgb) >= 4.5 ? mappedForeground : readable;
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
  // SSR / no DOM: light chameleon seed (matches `resolveFaqThemeAppearanceInitial('host')`).
  // Never seed Phoenix dark here — that caused help chrome to hydrate dark on light hosts.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      appearance: 'light',
      cssVars: { ...LIGHT_FALLBACK },
      mappedTokenCount: 0,
    };
  }

  const doc = options.root ?? document;
  let appearance = detectHostAppTheme(doc)?.appearance ?? resolveAutoFaqThemeAppearance(doc).appearance;
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

  // Reference last: theme tokens live on :root; reference is for painted surface only.
  if (referenceElement) {
    styleSources.push(window.getComputedStyle(referenceElement));
  }

  const cssVars: Record<string, string> = { ...fallback };
  // Do not inline-seed accent: CSS uses `var(--td-primary-color)` until host `--primary` maps.
  for (const key of DEFERRED_ACCENT_VARS) {
    delete cssVars[key];
  }
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
    const value = readFirstHostToken(styleSources, mapping.hostVars, doc);
    if (!value) continue;
    if (assignMappedHostColor(cssVars, mapping.faqVar, value, fallback)) {
      mappedTokenCount += 1;
    }
  }

  // Demo-critical: if CSS vars were late/unread, sample a painted primary control.
  if (!cssVars['--td-faq-accent']) {
    const sampledPrimary = sampleHostPrimaryFromDom(doc);
    if (sampledPrimary) {
      cssVars['--td-faq-accent'] = sampledPrimary;
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

  const radius = readFirstHostTokenRaw(styleSources, ['--radius', '--border-radius']);
  const normalizedRadius = radius ? normalizeRadius(radius) : null;
  if (normalizedRadius) {
    cssVars['--td-faq-radius'] = normalizedRadius;
    mappedTokenCount += 1;
  }

  const surfaceBackground =
    cssVars['--td-faq-surface-sidebar'] ?? cssVars['--td-faq-surface-panel'] ?? cssVars['--td-faq-surface'];

  // Prefer mapped panel surface luminance over OS/color-scheme guesses.
  const surfaceRgb = surfaceBackground ? parseCssColorToRgb(surfaceBackground) : null;
  if (surfaceRgb) {
    const surfaceAppearance = appearanceFromRgb(surfaceRgb);
    if (surfaceAppearance !== appearance) {
      const previousFallback = fallback;
      appearance = surfaceAppearance;
      const surfaceFallback = appearance === 'light' ? LIGHT_FALLBACK : DARK_FALLBACK;
      for (const [key, value] of Object.entries(surfaceFallback)) {
        if (DEFERRED_ACCENT_VARS.includes(key as (typeof DEFERRED_ACCENT_VARS)[number])) {
          continue;
        }
        if (cssVars[key] == null || cssVars[key] === previousFallback[key]) {
          cssVars[key] = value;
        }
      }
    }
  }

  cssVars['--td-faq-backdrop'] = deriveBackdrop(surfaceBackground, appearance);
  cssVars['--td-faq-shadow'] = deriveShadow(appearance);

  // If host never mapped accent, seed from fallback so contrast helpers still run.
  if (!cssVars['--td-faq-accent']) {
    cssVars['--td-faq-accent'] = fallback['--td-faq-accent'];
  }
  if (!cssVars['--td-faq-accent-text']) {
    cssVars['--td-faq-accent-text'] = fallback['--td-faq-accent-text'];
  }

  cssVars['--td-faq-accent-text'] = resolveAccentForeground(
    cssVars['--td-faq-accent'],
    cssVars['--td-faq-accent-text'],
  );

  // Keep tour chrome + help accent in sync (overrides SDK default teal/orange).
  if (cssVars['--td-faq-accent']) {
    cssVars['--td-primary-color'] = cssVars['--td-faq-accent'];
  }

  // Pale chips (Guides / Support): prefer host accent icon color when contrast is OK.
  if (!cssVars['--td-faq-chip-bg']) {
    cssVars['--td-faq-chip-bg'] = fallback['--td-faq-chip-bg'];
  }
  const chipFallbackText = pickReadableTextColor(cssVars['--td-faq-chip-bg'], {
    lightText: '#ffffff',
    darkText: cssVars['--td-faq-title'] ?? (appearance === 'light' ? LIGHT_FALLBACK : DARK_FALLBACK)['--td-faq-title'],
  });
  cssVars['--td-faq-chip-text'] = chipFallbackText;
  if (cssVars['--td-faq-accent'] && cssVars['--td-faq-chip-bg']) {
    const chipRgb = parseCssColorToRgb(cssVars['--td-faq-chip-bg']);
    const accentRgb = parseCssColorToRgb(cssVars['--td-faq-accent']);
    if (chipRgb && accentRgb && contrastRatio(chipRgb, accentRgb) >= 3) {
      cssVars['--td-faq-chip-text'] = cssVars['--td-faq-accent'];
    }
  }

  if (!cssVars['--td-faq-border-accent']) {
    cssVars['--td-faq-border-accent'] = fallback['--td-faq-border-accent'];
  }

  return {
    appearance,
    cssVars,
    mappedTokenCount,
  };
}

export function hostFaqThemeCssVarsToStyle(cssVars: Record<string, string>): CSSProperties {
  return cssVars as CSSProperties;
}
