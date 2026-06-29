import type { HelpDockSide } from './help-dock-side';

export const MAX_HELP_TAB_SCROLLBAR_INSET_PX = 4;

function isVerticalScrollbarPresent(doc: Document): boolean {
  const root = doc.documentElement;
  return root.scrollHeight > root.clientHeight + 1;
}

function measureClassicScrollbarWidth(doc: Document): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(0, window.innerWidth - doc.documentElement.clientWidth);
}

function scrollbarGutterSide(doc: Document): 'left' | 'right' {
  if (typeof window === 'undefined') return 'right';
  return window.getComputedStyle(doc.documentElement).direction === 'rtl' ? 'left' : 'right';
}

/**
 * Insets the collapsed help tab away from the OS scrollbar when one is visible.
 * Overlay scrollbars (macOS) return 0 — no gutter to reserve.
 */
export function measureHelpTabEdgeInset(
  side: HelpDockSide,
  doc: Document = typeof document !== 'undefined' ? document : (null as unknown as Document),
): number {
  if (!doc || typeof window === 'undefined') return 0;
  if (!isVerticalScrollbarPresent(doc)) return 0;

  const scrollbarWidth = measureClassicScrollbarWidth(doc);
  if (scrollbarWidth <= 0) return 0;

  const gutterSide = scrollbarGutterSide(doc);
  if (side !== gutterSide) return 0;

  return Math.min(scrollbarWidth, MAX_HELP_TAB_SCROLLBAR_INSET_PX);
}
