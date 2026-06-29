import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_HELP_MIN_CLEARANCE_PX,
  mergeAvoidSelectors,
  resolveSdkDockLayout,
  type HelpDockSide,
} from '../utils/help-dock-side';

import { shouldFlipDockSide, subscribeDockLayoutUpdates } from '../utils/dock-layout-observer';

function oppositeSide(side: HelpDockSide): HelpDockSide {
  return side === 'right' ? 'left' : 'right';
}

export interface UseSdkDockLayoutOptions {
  hostAvoidSelectors?: string[];
  helpAvoidSelectors?: string[];
  contextualAvoidSelectors?: string[];
  helpPreferredSide?: HelpDockSide;
  contextualPreferredSide?: HelpDockSide;
  minClearancePx?: number;
  helpEnabled?: boolean;
  contextualEnabled?: boolean;
  helpSidebarOpen?: boolean;
  /** When `false`, static preferred sides are used (from `initSDK({ dockLayout: false })`). */
  dockLayoutEnabled?: boolean;
}

export interface SdkDockLayout {
  avoidSelectors: string[];
  helpSide: HelpDockSide;
  contextualSide: HelpDockSide;
}

function createResolvedDockLayout(options: {
  avoidSelectors: string[];
  helpPreferredSide: HelpDockSide;
  contextualPreferredSide: HelpDockSide;
  minClearancePx: number;
  helpEnabled: boolean;
  contextualEnabled: boolean;
  helpSidebarOpen: boolean;
  dockLayoutEnabled: boolean;
}): SdkDockLayout {
  const {
    avoidSelectors,
    helpPreferredSide,
    contextualPreferredSide,
    minClearancePx,
    helpEnabled,
    contextualEnabled,
    helpSidebarOpen,
    dockLayoutEnabled,
  } = options;

  if (!dockLayoutEnabled) {
    return {
      avoidSelectors,
      helpSide: helpPreferredSide,
      contextualSide: contextualPreferredSide,
    };
  }

  const resolved = resolveSdkDockLayout({
    helpPreferredSide,
    contextualPreferredSide,
    avoidSelectors,
    minClearancePx,
    helpEnabled,
    contextualEnabled,
    helpSidebarOpen,
  });

  return {
    avoidSelectors,
    helpSide: resolved.helpSide,
    contextualSide: helpSidebarOpen ? oppositeSide(resolved.helpSide) : resolved.contextualSide,
  };
}

export function useSdkDockLayout({
  hostAvoidSelectors,
  helpAvoidSelectors,
  contextualAvoidSelectors,
  helpPreferredSide = 'right',
  contextualPreferredSide = 'right',
  minClearancePx = DEFAULT_HELP_MIN_CLEARANCE_PX,
  helpEnabled = false,
  contextualEnabled = false,
  helpSidebarOpen = false,
  dockLayoutEnabled = true,
}: UseSdkDockLayoutOptions): SdkDockLayout {
  const avoidSelectors = useMemo(
    () => mergeAvoidSelectors(hostAvoidSelectors, helpAvoidSelectors, contextualAvoidSelectors),
    [hostAvoidSelectors, helpAvoidSelectors, contextualAvoidSelectors],
  );
  const selectorKey = avoidSelectors.join('\0');

  const [layout, setLayout] = useState<SdkDockLayout>(() =>
    createResolvedDockLayout({
      avoidSelectors,
      helpPreferredSide,
      contextualPreferredSide,
      minClearancePx,
      helpEnabled,
      contextualEnabled,
      helpSidebarOpen,
      dockLayoutEnabled,
    }),
  );

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const applyResolvedLayout = useCallback(() => {
    if (!dockLayoutEnabled) {
      const staticLayout = {
        avoidSelectors,
        helpSide: helpPreferredSide,
        contextualSide: contextualPreferredSide,
      };
      layoutRef.current = staticLayout;
      setLayout(staticLayout);
      return;
    }

    const resolved = resolveSdkDockLayout({
      helpPreferredSide,
      contextualPreferredSide,
      avoidSelectors,
      minClearancePx,
      helpEnabled,
      contextualEnabled,
      helpSidebarOpen,
    });

    setLayout((previous) => {
      const helpSide = helpSidebarOpen
        ? previous.helpSide
        : shouldFlipDockSide(
              previous.helpSide,
              resolved.helpSide,
              avoidSelectors,
              minClearancePx,
            )
          ? resolved.helpSide
          : previous.helpSide;

      const contextualSide = helpSidebarOpen
        ? oppositeSide(helpSide)
        : shouldFlipDockSide(
              previous.contextualSide,
              resolved.contextualSide,
              avoidSelectors,
              minClearancePx,
            )
          ? resolved.contextualSide
          : previous.contextualSide;

      const next = {
        avoidSelectors,
        helpSide,
        contextualSide,
      };
      if (
        previous.helpSide === next.helpSide &&
        previous.contextualSide === next.contextualSide &&
        previous.avoidSelectors === avoidSelectors
      ) {
        return previous;
      }
      layoutRef.current = next;
      return next;
    });
  }, [
    avoidSelectors,
    contextualEnabled,
    contextualPreferredSide,
    dockLayoutEnabled,
    helpEnabled,
    helpPreferredSide,
    helpSidebarOpen,
    minClearancePx,
  ]);

  useLayoutEffect(() => {
    applyResolvedLayout();
  }, [applyResolvedLayout, selectorKey]);

  useEffect(() => {
    if (!dockLayoutEnabled || typeof window === 'undefined') return undefined;

    return subscribeDockLayoutUpdates({
      avoidSelectors,
      onUpdate: applyResolvedLayout,
      skipInitialSchedule: true,
    });
  }, [applyResolvedLayout, avoidSelectors, dockLayoutEnabled, selectorKey]);

  return layout;
}
