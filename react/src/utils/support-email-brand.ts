import type { SupportEmailBrand } from '../types/support';
import { normalizeHostColorToken, parseCssColorToRgb } from './faq-theme';

export interface DetectHostSupportBrandOptions {
  /** Optional host surface to read CSS tokens from (same idea as FAQ `hostThemeReference`). */
  referenceSelector?: string;
  /** Fallback product label when the host title/meta are generic. */
  projectKey?: string | null;
  root?: Document;
}

const GENERIC_TITLE_PATTERNS = [
  /^localhost/i,
  /^127\.0\.0\.1/i,
  /^next\.js/i,
  /^v0(\.app)?$/i,
  /^untitled/i,
  /^react app$/i,
  /^create next app$/i,
  /^document$/i,
];

const PRIMARY_HOST_VARS = [
  '--primary',
  '--brand',
  '--brand-color',
  '--color-primary',
  '--accent',
  '--td-faq-accent',
];

const SECONDARY_HOST_VARS = [
  '--primary-foreground',
  '--ring',
  '--secondary',
  '--brand-secondary',
];

function readCssVar(styles: CSSStyleDeclaration, name: string): string | null {
  const value = styles.getPropertyValue(name).trim();
  return value || null;
}

function readFirstColor(stylesList: CSSStyleDeclaration[], names: string[]): string | null {
  for (const styles of stylesList) {
    for (const name of names) {
      const raw = readCssVar(styles, name);
      if (!raw) continue;
      const normalized = normalizeHostColorToken(raw);
      if (!normalized) continue;
      const hex = cssColorToHex(normalized);
      if (hex) return hex;
    }
  }
  return null;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cssColorToHex(color: string): string | null {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(clampByte);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function darkenHex(hex: string, factor = 0.82): string {
  const rgb = parseCssColorToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((channel) => clampByte(channel * factor));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function cleanProductName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;

  // "ORBIT - Customer Success…" / "Acme | Dashboard"
  const split = trimmed.split(/\s[-–—|:•]\s/)[0]?.trim() || trimmed;
  if (!split || GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(split))) return null;
  if (split.length > 48) return `${split.slice(0, 45).trim()}…`;
  return split;
}

function humanizeProjectKey(projectKey?: string | null): string | null {
  const key = projectKey?.trim();
  if (!key || key === 'default') return null;
  const base = key.replace(/[-_]+v?\d+(\.\d+)*$/i, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return null;
  return base
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildMonogram(productName: string): string {
  const parts = productName
    .split(/[\s_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return productName.slice(0, 2).toUpperCase() || 'SU';
}

function absoluteUrl(href: string, doc: Document): string | null {
  try {
    return new URL(href, doc.baseURI || doc.location?.href).toString();
  } catch {
    return null;
  }
}

/** Email clients cannot fetch localhost / private hosts — skip those logos. */
export function isPublicHttpLogoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function detectProductName(doc: Document, projectKey?: string | null): string {
  const metaCandidates = [
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content'),
    doc.querySelector('meta[name="application-name"]')?.getAttribute('content'),
    doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'),
  ];
  for (const candidate of metaCandidates) {
    const cleaned = candidate ? cleanProductName(candidate) : null;
    if (cleaned) return cleaned;
  }

  const titleCleaned = cleanProductName(doc.title || '');
  if (titleCleaned) return titleCleaned;

  const fromProject = humanizeProjectKey(projectKey);
  if (fromProject) return fromProject;

  return 'Support';
}

function detectLogoUrl(doc: Document): string | null {
  const selectors = [
    'link[rel="apple-touch-icon"]',
    'link[rel="icon"][type="image/png"]',
    'link[rel="icon"][type="image/svg+xml"]',
    'link[rel="shortcut icon"]',
    'link[rel="icon"]',
  ];
  for (const selector of selectors) {
    const href = doc.querySelector(selector)?.getAttribute('href')?.trim();
    if (!href || href.startsWith('data:')) continue;
    const absolute = absoluteUrl(href, doc);
    if (absolute && isPublicHttpLogoUrl(absolute)) return absolute;
  }
  return null;
}

function collectStyleSources(doc: Document, referenceSelector?: string): CSSStyleDeclaration[] {
  if (typeof window === 'undefined') return [];
  const sources: CSSStyleDeclaration[] = [window.getComputedStyle(doc.documentElement)];
  if (doc.body) sources.push(window.getComputedStyle(doc.body));

  if (referenceSelector?.trim()) {
    try {
      const reference = doc.querySelector(referenceSelector);
      if (reference) sources.unshift(window.getComputedStyle(reference));
    } catch {
      // invalid selector — ignore
    }
  }
  return sources;
}

/**
 * Auto-detect white-label support email branding from the host document.
 * Universal heuristics only (title/meta/CSS tokens/favicon) — no product bias.
 */
export function detectHostSupportBrand(
  options: DetectHostSupportBrandOptions = {},
): SupportEmailBrand {
  if (typeof document === 'undefined') {
    return {
      productName: humanizeProjectKey(options.projectKey) || 'Support',
      supportLabel: 'Support',
      fromDisplayName: 'Support',
      monogram: 'SU',
    };
  }

  const doc = options.root ?? document;
  const productName = detectProductName(doc, options.projectKey);
  const styles = collectStyleSources(doc, options.referenceSelector);
  const accentColor = readFirstColor(styles, PRIMARY_HOST_VARS) || undefined;
  const accentColorTo =
    readFirstColor(styles, SECONDARY_HOST_VARS) ||
    (accentColor ? darkenHex(accentColor) : undefined);
  const logoUrl = detectLogoUrl(doc) || undefined;
  const supportLabel = productName === 'Support' ? 'Support' : `Support ${productName}`;

  return {
    productName,
    supportLabel,
    fromDisplayName: supportLabel,
    accentColor,
    accentColorTo,
    logoUrl,
    monogram: buildMonogram(productName),
  };
}

/**
 * Merge optional host overrides onto auto-detected branding.
 * Overrides are partial — omit fields to keep chameleon detection.
 */
export function resolveSupportEmailBrand(input: {
  override?: SupportEmailBrand | null;
  referenceSelector?: string;
  projectKey?: string | null;
  root?: Document;
} = {}): SupportEmailBrand {
  const detected = detectHostSupportBrand({
    referenceSelector: input.referenceSelector,
    projectKey: input.projectKey,
    root: input.root,
  });
  const override = input.override;
  if (!override) {
    return {
      ...detected,
      logoUrl: isPublicHttpLogoUrl(detected.logoUrl) ? detected.logoUrl : undefined,
    };
  }

  const logoCandidate = isPublicHttpLogoUrl(override.logoUrl)
    ? override.logoUrl?.trim()
    : isPublicHttpLogoUrl(detected.logoUrl)
      ? detected.logoUrl
      : undefined;

  return {
    productName: override.productName?.trim() || detected.productName,
    supportLabel: override.supportLabel?.trim() || detected.supportLabel,
    fromDisplayName: override.fromDisplayName?.trim() || detected.fromDisplayName,
    accentColor: override.accentColor?.trim() || detected.accentColor,
    accentColorTo: override.accentColorTo?.trim() || detected.accentColorTo,
    logoUrl: logoCandidate,
    monogram: override.monogram?.trim() || detected.monogram,
  };
}
