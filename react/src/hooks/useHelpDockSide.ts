import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_HELP_MIN_CLEARANCE_PX,
  resolveHelpDockSide,
  type HelpDockSide,
} from '../utils/help-dock-side';
import { shouldFlipDockSide, subscribeDockLayoutUpdates } from '../utils/dock-layout-observer';

export interface UseHelpDockSideOptions {
  preferredSide?: HelpDockSide;
  avoidSelectors?: string[];
  minClearancePx?: number;
  blockedSides?: HelpDockSide[];
  enabled?: boolean;
}

export function useHelpDockSide({
  preferredSide = 'right',
  avoidSelectors,
  minClearancePx = DEFAULT_HELP_MIN_CLEARANCE_PX,
  blockedSides,
  enabled = true,
}: UseHelpDockSideOptions): HelpDockSide {
  const selectorKey = useMemo(() => (avoidSelectors ?? []).join('\0'), [avoidSelectors]);
  const blockedKey = useMemo(() => (blockedSides ?? []).join('\0'), [blockedSides]);
  const hasAvoidSelectors = Boolean(avoidSelectors?.length);
  const hasBlockedSides = Boolean(blockedSides?.length);

  const [resolvedSide, setResolvedSide] = useState<HelpDockSide>(preferredSide);
  const resolvedSideRef = useRef(resolvedSide);
  resolvedSideRef.current = resolvedSide;

  useEffect(() => {
    if (!enabled || (!hasAvoidSelectors && !hasBlockedSides) || typeof window === 'undefined') {
      setResolvedSide(preferredSide);
      resolvedSideRef.current = preferredSide;
      return undefined;
    }

    const applyResolvedSide = () => {
      const nextSide = resolveHelpDockSide({
        preferredSide,
        avoidSelectors,
        minClearancePx,
        blockedSides,
      });

      setResolvedSide((current) => {
        const stableSide =
          hasAvoidSelectors &&
          !shouldFlipDockSide(current, nextSide, avoidSelectors ?? [], minClearancePx)
            ? current
            : nextSide;
        resolvedSideRef.current = stableSide;
        return stableSide;
      });
    };

    return subscribeDockLayoutUpdates({
      avoidSelectors: avoidSelectors ?? [],
      onUpdate: applyResolvedSide,
    });
  }, [
    enabled,
    hasAvoidSelectors,
    hasBlockedSides,
    minClearancePx,
    preferredSide,
    selectorKey,
    blockedKey,
    avoidSelectors,
    blockedSides,
  ]);

  if (!enabled || (!hasAvoidSelectors && !hasBlockedSides)) return preferredSide;
  return resolvedSide;
}
