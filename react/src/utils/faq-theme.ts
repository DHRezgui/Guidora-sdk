export type FaqThemeMode = 'auto' | 'light' | 'dark' | 'host';
export type FaqThemeAppearance = 'light' | 'dark';

export type HostThemeDetectionSource =
  | 'token'
  | 'class'
  | 'color-scheme'
  | 'css-variable'
  | 'computed-background'
  | 'meta'
  | 'system';

export interface HostThemeDetectionResult {
  appearance: FaqThemeAppearance;
  source: HostThemeDetectionSource;
}

const DARK_THEME_TOKENS = new Set(['dark', 'dim', 'night', 'black']);
const LIGHT_THEME_TOKENS = new Set(['light', 'day', 'white']);

/** Common design-system tokens (Tailwind/shadcn, MUI, etc.). */
const HOST_THEME_CSS_VARIABLES = [
  '--background',
  '--bg',
  '--surface',
  '--page-background',
  '--color-background',
  '--body-bg',
] as const;

const LIGHT_LUMINANCE_THRESHOLD = 0.55;

function readThemeToken(element: Element | null | undefined): string | null {
  if (!element) return null;

  const dataTheme = element.getAttribute('data-theme')?.trim().toLowerCase();
  if (dataTheme) return dataTheme;

  const colorScheme = element.getAttribute('data-color-scheme')?.trim().toLowerCase();
  if (colorScheme) return colorScheme;

  return null;
}

function tokenToAppearance(token: string): FaqThemeAppearance | null {
  if (token === 'system') return null;
  if (DARK_THEME_TOKENS.has(token)) return 'dark';
  if (LIGHT_THEME_TOKENS.has(token)) return 'light';
  return null;
}

function detectThemeFromTokens(doc: Document): HostThemeDetectionResult | null {
  const html = doc.documentElement;
  const body = doc.body;

  for (const token of [readThemeToken(html), readThemeToken(body)]) {
    const appearance = token ? tokenToAppearance(token) : null;
    if (appearance) return { appearance, source: 'token' };
  }

  return null;
}

function detectThemeFromClasses(doc: Document): HostThemeDetectionResult | null {
  const html = doc.documentElement;
  const body = doc.body;

  if (html.classList.contains('dark') || body?.classList.contains('dark')) {
    return { appearance: 'dark', source: 'class' };
  }
  if (html.classList.contains('light') || body?.classList.contains('light')) {
    return { appearance: 'light', source: 'class' };
  }

  return null;
}

function detectThemeFromColorSchemeProperty(doc: Document): HostThemeDetectionResult | null {
  if (typeof window === 'undefined') return null;

  const scheme = window.getComputedStyle(doc.documentElement).colorScheme?.trim().toLowerCase();
  if (!scheme || scheme === 'normal') return null;

  const tokens = scheme.split(/\s+/).filter(Boolean);
  const hasDark = tokens.includes('dark');
  const hasLight = tokens.includes('light');

  if (hasDark && !hasLight) return { appearance: 'dark', source: 'color-scheme' };
  if (hasLight && !hasDark) return { appearance: 'light', source: 'color-scheme' };

  return null;
}

function detectThemeFromMetaColorScheme(doc: Document): HostThemeDetectionResult | null {
  const meta = doc.querySelector('meta[name="color-scheme"]');
  const content = meta?.getAttribute('content')?.trim().toLowerCase();
  if (!content) return null;

  const tokens = content.split(/\s+/).filter(Boolean);
  const hasDark = tokens.includes('dark');
  const hasLight = tokens.includes('light');

  if (hasDark && !hasLight) return { appearance: 'dark', source: 'meta' };
  if (hasLight && !hasDark) return { appearance: 'light', source: 'meta' };

  return null;
}

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.replace('#', '');
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

export function parseCssColorToRgb(color: string): [number, number, number] | null {
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent') return null;

  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed);
  }

  const rgbMatch = trimmed.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (rgbMatch) {
    const alpha = rgbMatch[4] != null ? Number.parseFloat(rgbMatch[4]) : 1;
    if (alpha <= 0.04) return null;
    return [Number.parseFloat(rgbMatch[1]), Number.parseFloat(rgbMatch[2]), Number.parseFloat(rgbMatch[3])];
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?(?:[,\s]+|\s+)([\d.]+)%(?:[,\s]+|\s+)([\d.]+)%(?:\s*\/\s*([\d.]+))?\s*\)$/,
  );
  if (hslMatch) {
    const alpha = hslMatch[4] != null ? Number.parseFloat(hslMatch[4]) : 1;
    if (alpha <= 0.04) return null;
    return hslToRgb(
      Number.parseFloat(hslMatch[1]),
      Number.parseFloat(hslMatch[2]),
      Number.parseFloat(hslMatch[3]),
    );
  }

  return null;
}

const SHADCN_HSL_COMPONENTS = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?%)\s+(\d+(?:\.\d+)?%)$/;

/** Normalizes host tokens (e.g. shadcn `0 0% 100%`) into valid CSS colors. */
export function normalizeHostColorToken(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(#|rgb|hsl|oklch|lab|color\()/i.test(trimmed)) return trimmed;
  if (SHADCN_HSL_COMPONENTS.test(trimmed)) return `hsl(${trimmed})`;
  return trimmed;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const hueToRgb = (offset: number) => {
    const channel = (offset + h / 30) % 12;
    return lightness - chroma * Math.max(Math.min(channel - 3, 9 - channel, 1), -1);
  };

  return [
    Math.round(hueToRgb(0) * 255),
    Math.round(hueToRgb(8) * 255),
    Math.round(hueToRgb(4) * 255),
  ];
}

export function rgbRelativeLuminance(rgb: [number, number, number]): number {
  const channels = rgb.map((value) => {
    const normalized = Math.min(Math.max(value / 255, 0), 1);
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function appearanceFromRgb(rgb: [number, number, number]): FaqThemeAppearance {
  return rgbRelativeLuminance(rgb) >= LIGHT_LUMINANCE_THRESHOLD ? 'light' : 'dark';
}

/** Picks light or dark readable text for a background color. */
export function pickReadableTextColor(
  background: string | undefined,
  options: { lightText?: string; darkText?: string } = {},
): string {
  const lightText = options.lightText ?? '#f8fafc';
  const darkText = options.darkText ?? '#0f172a';
  const rgb = background ? parseCssColorToRgb(background) : null;
  if (!rgb) return darkText;
  return rgbRelativeLuminance(rgb) >= 0.45 ? darkText : lightText;
}

function detectThemeFromCssVariables(doc: Document): HostThemeDetectionResult | null {
  if (typeof window === 'undefined') return null;

  const styles = window.getComputedStyle(doc.documentElement);

  for (const variable of HOST_THEME_CSS_VARIABLES) {
    const raw = styles.getPropertyValue(variable).trim();
    if (!raw) continue;

    const rgb = parseCssColorToRgb(raw);
    if (!rgb) continue;

    return {
      appearance: appearanceFromRgb(rgb),
      source: 'css-variable',
    };
  }

  return null;
}

function getOpaqueBackgroundRgb(element: Element): [number, number, number] | null {
  if (typeof window === 'undefined') return null;

  let current: Element | null = element;
  while (current) {
    const rgb = parseCssColorToRgb(window.getComputedStyle(current).backgroundColor);
    if (rgb) return rgb;
    current = current.parentElement;
  }

  return null;
}

function detectThemeFromRenderedBackground(doc: Document): HostThemeDetectionResult | null {
  const candidates = [doc.body, doc.documentElement].filter(Boolean) as Element[];

  for (const element of candidates) {
    const rgb = getOpaqueBackgroundRgb(element);
    if (!rgb) continue;
    return {
      appearance: appearanceFromRgb(rgb),
      source: 'computed-background',
    };
  }

  return null;
}

/**
 * Multi-signal host theme detection.
 * Prefer explicit app signals (tokens/classes) and painted surfaces (CSS vars / background)
 * before browser `color-scheme`, which often mirrors OS preference while the app stays light.
 */
export function detectHostAppTheme(root?: Document): HostThemeDetectionResult | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const doc = root ?? document;

  return (
    detectThemeFromTokens(doc) ??
    detectThemeFromClasses(doc) ??
    detectThemeFromCssVariables(doc) ??
    detectThemeFromRenderedBackground(doc) ??
    detectThemeFromColorSchemeProperty(doc) ??
    detectThemeFromMetaColorScheme(doc)
  );
}

/** @deprecated Prefer `detectHostAppTheme`. Kept for backward compatibility. */
export function detectHostDocumentTheme(root?: Document): FaqThemeAppearance | null {
  return detectHostAppTheme(root)?.appearance ?? null;
}

export function detectSystemColorScheme(): FaqThemeAppearance {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveAutoFaqThemeAppearance(root?: Document): HostThemeDetectionResult {
  const host = detectHostAppTheme(root);
  if (host) return host;

  return {
    appearance: detectSystemColorScheme(),
    source: 'system',
  };
}

/** Stable palette for SSR / hydration when `themeMode` is `auto`. */
export const SSR_SAFE_AUTO_FAQ_THEME: FaqThemeAppearance = 'dark';

/** Initial FAQ palette safe for server render and the first client hydration pass. */
export function resolveFaqThemeAppearanceInitial(mode?: FaqThemeMode): FaqThemeAppearance {
  if (mode === 'light') return 'light';
  if (!mode || mode === 'dark') return 'dark';
  if (mode === 'host') return 'light';
  return SSR_SAFE_AUTO_FAQ_THEME;
}

/** Resolves the FAQ palette. Undefined mode keeps the existing dark Phoenix default. */
export function resolveFaqThemeAppearance(mode?: FaqThemeMode, root?: Document): FaqThemeAppearance {
  if (!mode || mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (typeof window === 'undefined') return SSR_SAFE_AUTO_FAQ_THEME;
  return resolveAutoFaqThemeAppearance(root).appearance;
}

export function buildFaqThemeClassName(
  appearance: FaqThemeAppearance,
  themeMode?: FaqThemeMode,
): string {
  const classes = ['trustdev-faq-ui', `trustdev-faq-ui--${appearance}`];
  if (themeMode === 'host') classes.push('trustdev-faq-ui--host');
  return classes.join(' ');
}
