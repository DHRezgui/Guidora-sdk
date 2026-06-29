export type HelpDockSide = 'left' | 'right';

export const DEFAULT_HELP_PANEL_WIDTH_PX = 400;
export const DEFAULT_HELP_EDGE_MARGIN_PX = 24;
export const DEFAULT_HELP_MIN_CLEARANCE_PX = 420;

export interface ResolveHelpDockSideOptions {
  preferredSide?: HelpDockSide;
  avoidSelectors?: string[];
  minClearancePx?: number;
  edgeMarginPx?: number;
  viewportWidth?: number;
  /** Sides that must not be used (e.g. another SDK panel already docked there). */
  blockedSides?: HelpDockSide[];
  /** Test hook: bypass DOM queries when measuring reserved zones. */
  occupiedRects?: DOMRect[];
}

export interface DockClearanceSnapshot {
  left: number;
  right: number;
}

function isVisibleRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function oppositeSide(side: HelpDockSide): HelpDockSide {
  return side === 'right' ? 'left' : 'right';
}

/** Deduplicates host-provided reserved-zone selectors from multiple SDK surfaces. */
export function mergeAvoidSelectors(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    for (const selector of group ?? []) {
      const trimmed = selector.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }

  return merged;
}

/** Collects bounding boxes for elements matching host-provided reserved zones. */
export function measureAvoidRects(selectors: string[], root: ParentNode = document): DOMRect[] {
  const rects: DOMRect[] = [];
  const seen = new Set<Element>();

  for (const selector of selectors) {
    if (!selector.trim()) continue;
    try {
      root.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        const rect = element.getBoundingClientRect();
        if (isVisibleRect(rect)) rects.push(rect);
      });
    } catch {
      // Ignore invalid selectors from host apps.
    }
  }

  return rects;
}

/**
 * Horizontal strip available on an edge for docking SDK chrome.
 * Right: space from the right viewport edge inward to the nearest blocking element.
 * Left: space from the left viewport edge outward to the nearest blocking element.
 */
export function measureSideClearance(
  side: HelpDockSide,
  viewportWidth: number,
  rects: DOMRect[],
  edgeMarginPx: number,
): number {
  if (side === 'right') {
    let stripWidth = viewportWidth;
    for (const rect of rects) {
      if (!isVisibleRect(rect)) continue;
      if (rect.left < viewportWidth * 0.5) continue;
      stripWidth = Math.min(stripWidth, viewportWidth - rect.left);
    }
    return stripWidth >= viewportWidth ? viewportWidth - edgeMarginPx * 2 : Math.max(0, stripWidth - edgeMarginPx);
  }

  let stripWidth = viewportWidth;
  for (const rect of rects) {
    if (!isVisibleRect(rect)) continue;
    if (rect.left > viewportWidth * 0.5) continue;
    stripWidth = Math.min(stripWidth, Math.max(0, rect.left));
  }

  return stripWidth >= viewportWidth
    ? viewportWidth - edgeMarginPx * 2
    : Math.max(0, stripWidth - edgeMarginPx);
}

export function measureDockClearances(
  options: Pick<ResolveHelpDockSideOptions, 'avoidSelectors' | 'edgeMarginPx' | 'viewportWidth' | 'occupiedRects'>,
): DockClearanceSnapshot {
  const viewportWidth = options.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  const edgeMarginPx = options.edgeMarginPx ?? DEFAULT_HELP_EDGE_MARGIN_PX;
  const avoidSelectors = options.avoidSelectors?.filter(Boolean) ?? [];
  const rects =
    options.occupiedRects ??
    (typeof document !== 'undefined' && avoidSelectors.length ? measureAvoidRects(avoidSelectors) : []);

  return {
    left: measureSideClearance('left', viewportWidth, rects, edgeMarginPx),
    right: measureSideClearance('right', viewportWidth, rects, edgeMarginPx),
  };
}

function rankSidesByClearance(
  clearances: DockClearanceSnapshot,
  blockedSides: Set<HelpDockSide>,
): HelpDockSide[] {
  return (['left', 'right'] as const)
    .filter((side) => !blockedSides.has(side))
    .sort((a, b) => clearances[b] - clearances[a]);
}

/** Picks left/right dock side based on reserved host zones, clearance, and blocked edges. */
export function resolveHelpDockSide(options: ResolveHelpDockSideOptions): HelpDockSide {
  const preferredSide = options.preferredSide ?? 'right';
  const avoidSelectors = options.avoidSelectors?.filter(Boolean) ?? [];
  const blockedSides = new Set(options.blockedSides ?? []);
  const minClearancePx = options.minClearancePx ?? DEFAULT_HELP_MIN_CLEARANCE_PX;

  const availableSides = rankSidesByClearance(
    { left: Number.POSITIVE_INFINITY, right: Number.POSITIVE_INFINITY },
    blockedSides,
  );
  const fallbackSide = availableSides[0] ?? preferredSide;

  if (blockedSides.has(preferredSide) && !blockedSides.has(oppositeSide(preferredSide))) {
    return oppositeSide(preferredSide);
  }

  if (!avoidSelectors.length) {
    return blockedSides.has(preferredSide) ? fallbackSide : preferredSide;
  }

  const viewportWidth = options.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  if (!viewportWidth) return blockedSides.has(preferredSide) ? fallbackSide : preferredSide;

  const clearances = measureDockClearances({
    avoidSelectors,
    edgeMarginPx: options.edgeMarginPx,
    viewportWidth,
    occupiedRects: options.occupiedRects,
  });

  const fits = (side: HelpDockSide) =>
    !blockedSides.has(side) && clearances[side] >= minClearancePx;

  if (fits(preferredSide)) return preferredSide;

  const alternateSide = oppositeSide(preferredSide);
  if (fits(alternateSide)) return alternateSide;

  const ranked = rankSidesByClearance(clearances, blockedSides);
  return ranked[0] ?? fallbackSide;
}

export interface ResolveSdkDockLayoutOptions {
  helpPreferredSide?: HelpDockSide;
  contextualPreferredSide?: HelpDockSide;
  avoidSelectors?: string[];
  minClearancePx?: number;
  viewportWidth?: number;
  occupiedRects?: DOMRect[];
  helpEnabled?: boolean;
  contextualEnabled?: boolean;
  /** When the help sidebar panel is open, contextual chrome stays on the opposite edge. */
  helpSidebarOpen?: boolean;
}

/**
 * Coordinates FAQ/help and contextual publisher dock sides without circular deps.
 * Runs a short mutual-pass: host clearance first, then blocks each SDK surface on the other.
 */
export function resolveSdkDockLayout(options: ResolveSdkDockLayoutOptions): {
  helpSide: HelpDockSide;
  contextualSide: HelpDockSide;
} {
  const helpPreferred = options.helpPreferredSide ?? 'right';
  const contextualPreferred = options.contextualPreferredSide ?? 'right';
  const avoidSelectors = options.avoidSelectors?.filter(Boolean) ?? [];
  const minClearancePx = options.minClearancePx ?? DEFAULT_HELP_MIN_CLEARANCE_PX;
  const shared = {
    avoidSelectors,
    minClearancePx,
    viewportWidth: options.viewportWidth,
    occupiedRects: options.occupiedRects,
  };

  if (!options.helpEnabled && !options.contextualEnabled) {
    return { helpSide: helpPreferred, contextualSide: contextualPreferred };
  }

  if (!options.helpEnabled) {
    return {
      helpSide: helpPreferred,
      contextualSide: resolveHelpDockSide({
        ...shared,
        preferredSide: contextualPreferred,
      }),
    };
  }

  if (!options.contextualEnabled) {
    return {
      helpSide: resolveHelpDockSide({
        ...shared,
        preferredSide: helpPreferred,
      }),
      contextualSide: contextualPreferred,
    };
  }

  const helpSide = resolveHelpDockSide({
    ...shared,
    preferredSide: helpPreferred,
  });

  const contextualPreferredResolved = oppositeSide(helpSide);

  const contextualSide = resolveHelpDockSide({
    ...shared,
    preferredSide: contextualPreferredResolved,
    blockedSides: [helpSide],
  });

  return { helpSide, contextualSide };
}
