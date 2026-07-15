/** Shared lab debug panel footprint (matches CSS `min(360px, 100vw - 24px)`). */
export const DEBUG_PANEL_WIDTH_PX = 360;
export const DEBUG_PANEL_EDGE_PX = 16;
export const DEBUG_PANEL_STACK_GAP_PX = 12;

export const CONTEXTUAL_DEBUG_PANEL_SELECTOR = '[data-trustdev-contextual-panel]';

export interface DebugPanelStackOffsets {
  /** Horizontal inset from the dock edge (side-by-side layout). */
  offsetX: number;
  /** Extra bottom inset (vertical stack on narrow viewports). */
  offsetY: number;
  mode: 'side' | 'stack' | 'solo';
}

/**
 * Place the abandonment panel beside the contextual panel when there is room,
 * otherwise stack it above on the same dock edge (same width, aligned).
 */
export function measureDebugPanelStackOffsets(
  contextualVisible: boolean,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : DEBUG_PANEL_WIDTH_PX * 2,
): DebugPanelStackOffsets {
  if (!contextualVisible) {
    return { offsetX: 0, offsetY: 0, mode: 'solo' };
  }

  const contextual =
    typeof document !== 'undefined'
      ? document.querySelector(CONTEXTUAL_DEBUG_PANEL_SELECTOR)
      : null;

  const rect =
    contextual instanceof HTMLElement ? contextual.getBoundingClientRect() : null;

  const measuredWidth =
    rect && rect.width > 0
      ? rect.width
      : Math.min(DEBUG_PANEL_WIDTH_PX, Math.max(0, viewportWidth - DEBUG_PANEL_EDGE_PX * 2));

  const measuredHeight = rect && rect.height > 0 ? rect.height : 48;

  const neededForSideBySide =
    DEBUG_PANEL_EDGE_PX * 2 + measuredWidth * 2 + DEBUG_PANEL_STACK_GAP_PX;

  if (viewportWidth < neededForSideBySide) {
    return {
      offsetX: 0,
      offsetY: Math.round(measuredHeight + DEBUG_PANEL_STACK_GAP_PX),
      mode: 'stack',
    };
  }

  return {
    offsetX: Math.round(measuredWidth + DEBUG_PANEL_STACK_GAP_PX),
    offsetY: 0,
    mode: 'side',
  };
}
