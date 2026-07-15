import { useLayoutEffect, useState } from 'react';
import type { HelpDockSide } from '../utils/help-dock-side';
import { measureHelpTabEdgeInset } from '../utils/help-tab-edge-inset';

export function useHelpTabEdgeInset(
  side: HelpDockSide,
  enabled = true,
  /** Bump when host layout may have shifted (e.g. sidebar open/push). */
  remeasureKey?: string | number | boolean,
): number {
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      setInset(0);
      return undefined;
    }

    let frame = 0;
    let mutationTimer = 0;
    let settleTimer = 0;
    const measureNow = () => {
      setInset(measureHelpTabEdgeInset(side, document));
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureNow);
    };
    const measureDebounced = () => {
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(measure, 80);
    };

    measure();
    // Push/overlay transitions finish after the open flag flips.
    settleTimer = window.setTimeout(measure, 250);
    window.addEventListener('resize', measure);

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(document.documentElement);
    if (document.body) observer?.observe(document.body);

    // Host apps often grow inner overflow regions without resizing <html>/<body>.
    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(measureDebounced)
        : null;
    if (document.body) {
      mutationObserver?.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(mutationTimer);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, remeasureKey, side]);

  return inset;
}
