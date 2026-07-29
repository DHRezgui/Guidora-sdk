import { getCurrentPageUrl } from './url';

/**
 * SDK chrome — never use as logical-page landmarks.
 * Keep aligned with friction detection exclusions.
 */
const LOGICAL_PAGE_CHROME_SELECTOR = [
  '[data-sdk-lab-console]',
  '[data-sdk-lab-insights]',
  '[data-trustdev-help-sidebar]',
  '[data-trustdev-faq-panel]',
  '[data-trustdev-contextual-panel]',
  '[data-trustdev-abandonment-panel]',
  '.trustdev-contextual-debug-panel',
  '.trustdev-abandonment-debug-panel',
  '#trustdev-proactive-toast-portal',
  '.trustdev-faq-widget',
  '.trustdev-help-sidebar',
].join(',');

function isInsideSdkChrome(element: Element | null): boolean {
  if (!element || !(element instanceof Element)) return false;
  return Boolean(element.closest(LOGICAL_PAGE_CHROME_SELECTOR));
}

function normalizeLandmark(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // Framer exit animations keep layout box while opacity → 0; ignore those.
  if (Number.parseFloat(style.opacity || '1') < 0.1) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Primary visible host heading — works for multi-route apps and view-based SPAs
 * that swap an H1 without changing the URL (no host instrumentation required).
 */
function resolvePrimaryHeading(): string {
  if (typeof document === 'undefined') return '';
  const candidates = Array.from(
    document.querySelectorAll('main h1, [role="main"] h1, h1'),
  );
  for (const node of candidates) {
    if (isInsideSdkChrome(node)) continue;
    if (!isElementVisible(node)) continue;
    const text = normalizeLandmark(node.textContent);
    if (text) return text;
  }
  return '';
}

/**
 * Active navigation cue when present (aria-current / aria-selected).
 * Optional signal — many SPAs omit it; heading + URL still work.
 */
function resolveActiveNavLabel(): string {
  if (typeof document === 'undefined') return '';
  const candidates = Array.from(
    document.querySelectorAll(
      [
        'nav [aria-current="page"]',
        'aside [aria-current="page"]',
        '[role="navigation"] [aria-current="page"]',
        'nav [aria-selected="true"]',
        '[role="tab"][aria-selected="true"]',
      ].join(', '),
    ),
  );
  for (const node of candidates) {
    if (isInsideSdkChrome(node)) continue;
    if (!isElementVisible(node)) continue;
    const text = normalizeLandmark(
      node.getAttribute('aria-label') || node.textContent,
    );
    if (text) return text;
  }
  return '';
}

/**
 * Stable-ish key for "where the user currently is" inside a host app.
 *
 * - URL apps: pathname/search/hash dominate.
 * - SPA view switchers without URL change: title + H1 (+ nav cue) detect the swap.
 *
 * Intentionally host-agnostic: no product-specific view ids or query params.
 */
export function getLogicalPageKey(): string {
  if (typeof window === 'undefined') return '/';
  return [
    getCurrentPageUrl(),
    normalizeLandmark(document.title),
    resolveActiveNavLabel(),
    resolvePrimaryHeading(),
  ].join('\u0001');
}

/**
 * True when the key only *enriched* / refined empty title/nav/H1 slots on the same URL
 * (typical after a hard refresh / first paint). Not a real user navigation.
 *
 * Refinement includes cases like title "orbit crm" → "settings | orbit crm".
 */
export function logicalPageUrl(key: string): string {
  return (key.split('\u0001')[0] || '').trim();
}

export function isSameLogicalPageUrl(a: string, b: string): boolean {
  const urlA = logicalPageUrl(a);
  const urlB = logicalPageUrl(b);
  return Boolean(urlA) && urlA === urlB;
}

/**
 * Stable identity for friction nav signals.
 * On soft SPAs (same URL), prefer `aria-current` nav cue — it updates synchronously
 * on click, while H1 often lags behind exit animations (Framer AnimatePresence).
 */
export function resolveFrictionPageIdentity(fullKey: string): string {
  const url = logicalPageUrl(fullKey);
  const parts = fullKey.split('\u0001');
  const nav = (parts[2] || '').trim();
  const heading = (parts[3] || '').trim();
  if (nav) return `${url}\u0001nav:${nav}`;
  if (heading) return `${url}\u0001h1:${heading}`;
  return url || fullKey;
}

export function isLogicalPageKeyStabilization(
  previousKey: string,
  nextKey: string,
): boolean {
  if (!previousKey || !nextKey || previousKey === nextKey) return false;

  const previousParts = previousKey.split('\u0001');
  const nextParts = nextKey.split('\u0001');
  const previousUrl = previousParts[0] || '';
  const nextUrl = nextParts[0] || '';
  if (previousUrl !== nextUrl) return false;

  const previousMeta = previousParts.slice(1);
  const nextMeta = nextParts.slice(1);
  const slotCount = Math.max(previousMeta.length, nextMeta.length);

  let changedSlots = 0;
  let conflictingSlots = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const previousValue = (previousMeta[index] || '').trim();
    const nextValue = (nextMeta[index] || '').trim();
    if (previousValue === nextValue) continue;
    changedSlots += 1;
    if (isLandmarkRefinement(previousValue, nextValue)) continue;
    conflictingSlots += 1;
  }

  return changedSlots > 0 && conflictingSlots === 0;
}

function isLandmarkRefinement(previousValue: string, nextValue: string): boolean {
  if (!previousValue && nextValue) return true;
  if (previousValue && !nextValue) return false;
  if (!previousValue && !nextValue) return true;
  return nextValue.includes(previousValue) || previousValue.includes(nextValue);
}

/**
 * Optional host opt-in. Never required — soft SPA detection works without it.
 * Advanced hosts may dispatch this after an internal view change:
 * `window.dispatchEvent(new Event('trustdev:locationchange'))`
 */
export const TRUSTDEV_LOCATION_CHANGE_EVENT = 'trustdev:locationchange';
