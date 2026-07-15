import type { HelpDockSide } from './help-dock-side';

export const MAX_HELP_TAB_SCROLLBAR_INSET_PX = 4;

/** How close a scroller's edge must be to the viewport edge to count. */
const VIEWPORT_EDGE_TOLERANCE_PX = 8;

/** Cap DOM walk cost on large host apps. */
const MAX_OVERFLOW_SCAN = 400;

const SDK_CHROME_SELECTOR =
  '[data-trustdev-help-sidebar], [data-trustdev-faq-panel], [data-trustdev-proactive-help-toast]';

function isVerticalDocumentScrollbarPresent(doc: Document): boolean {
  const root = doc.documentElement;
  return root.scrollHeight > root.clientHeight + 1;
}

function measureClassicDocumentScrollbarWidth(doc: Document): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(0, window.innerWidth - doc.documentElement.clientWidth);
}

function scrollbarGutterSide(doc: Document): 'left' | 'right' {
  if (typeof window === 'undefined') return 'right';
  return window.getComputedStyle(doc.documentElement).direction === 'rtl' ? 'left' : 'right';
}

function classicVerticalScrollbarWidth(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return 0;
  }
  if (el.scrollHeight <= el.clientHeight + 1) return 0;

  const borderX =
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0);
  // offsetWidth − clientWidth includes borders + classic scrollbar gutter.
  return Math.max(0, el.offsetWidth - el.clientWidth - borderX);
}

function isNearViewportEdge(el: HTMLElement, side: HelpDockSide): boolean {
  const rect = el.getBoundingClientRect();
  if (side === 'right') {
    return rect.right >= window.innerWidth - VIEWPORT_EDGE_TOLERANCE_PX;
  }
  return rect.left <= VIEWPORT_EDGE_TOLERANCE_PX;
}

/**
 * Classic scrollbar width on an overflow scroller whose dock-side edge
 * sits against the viewport (common in apps with `body { overflow: hidden }`).
 */
function measureNearEdgeOverflowScrollbarWidth(
  side: HelpDockSide,
  doc: Document,
): number {
  if (typeof window === 'undefined' || !doc.body) return 0;

  let maxWidth = 0;

  // Prefer hit-testing the dock edge: finds the real host scroller even when
  // <html>/<body> do not scroll (Orbit-style overflow-hidden shells).
  if (typeof doc.elementsFromPoint === 'function') {
    const x = side === 'right' ? Math.max(0, window.innerWidth - 2) : 2;
    const samplesY = [
      Math.floor(window.innerHeight * 0.35),
      Math.floor(window.innerHeight * 0.5),
      Math.floor(window.innerHeight * 0.65),
    ];
    for (const y of samplesY) {
      const stack = doc.elementsFromPoint(x, y);
      for (const node of stack) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest(SDK_CHROME_SELECTOR)) continue;
        const width = classicVerticalScrollbarWidth(node);
        if (width > maxWidth) maxWidth = width;
      }
      if (maxWidth > 0) return maxWidth;
    }
  }

  const nodes = doc.body.querySelectorAll('*');
  const limit = Math.min(nodes.length, MAX_OVERFLOW_SCAN);
  for (let i = 0; i < limit; i += 1) {
    const el = nodes[i] as HTMLElement | null;
    // Duck-typed so unit tests can supply plain element-like objects.
    if (!el || typeof el.getBoundingClientRect !== 'function') continue;
    if (typeof el.closest === 'function' && el.closest(SDK_CHROME_SELECTOR)) continue;
    if (!isNearViewportEdge(el, side)) continue;

    const width = classicVerticalScrollbarWidth(el);
    if (width > maxWidth) maxWidth = width;
  }

  return maxWidth;
}

/**
 * Insets the collapsed help tab (and overlay panel) away from a classic
 * scrollbar when one is visible at the dock edge.
 * Overlay scrollbars (macOS) return 0 — no gutter to reserve.
 */
export function measureHelpTabEdgeInset(
  side: HelpDockSide,
  doc: Document = typeof document !== 'undefined' ? document : (null as unknown as Document),
): number {
  if (!doc || typeof window === 'undefined') return 0;

  const gutterSide = scrollbarGutterSide(doc);
  if (side !== gutterSide) return 0;

  let scrollbarWidth = 0;

  if (isVerticalDocumentScrollbarPresent(doc)) {
    scrollbarWidth = Math.max(scrollbarWidth, measureClassicDocumentScrollbarWidth(doc));
  }

  scrollbarWidth = Math.max(
    scrollbarWidth,
    measureNearEdgeOverflowScrollbarWidth(side, doc),
  );

  if (scrollbarWidth <= 0) return 0;
  return Math.min(scrollbarWidth, MAX_HELP_TAB_SCROLLBAR_INSET_PX);
}
