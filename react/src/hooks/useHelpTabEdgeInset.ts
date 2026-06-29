import { useLayoutEffect, useState } from 'react';
import type { HelpDockSide } from '../utils/help-dock-side';
import { measureHelpTabEdgeInset } from '../utils/help-tab-edge-inset';

export function useHelpTabEdgeInset(side: HelpDockSide, enabled = true): number {
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      setInset(0);
      return undefined;
    }

    const measure = () => {
      setInset(measureHelpTabEdgeInset(side, document));
    };

    measure();
    window.addEventListener('resize', measure);

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(document.documentElement);
    if (document.body) observer?.observe(document.body);

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [enabled, side]);

  return inset;
}
