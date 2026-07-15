import {
  measureDockClearances,
  type HelpDockSide,
} from './help-dock-side';

const TRUSTDEV_MUTATION_ROOT_SELECTOR =
  '[data-trustdev-help-sidebar], [data-trustdev-faq-panel], [data-trustdev-contextual-panel], [data-trustdev-abandonment-panel], [data-trustdev-proactive-toast], [data-trustdev-proactive-toast-portal], .trustdev-help-sidebar, .trustdev-faq-widget, .trustdev-contextual-debug-panel, .trustdev-abandonment-debug-panel, .trustdev-proactive-toast';

/** Minimum clearance advantage required before flipping an already stable dock side. */
export const DOCK_SIDE_FLIP_HYSTERESIS_PX = 48;

export function isTrustDevDockMutationTarget(target: Node): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(TRUSTDEV_MUTATION_ROOT_SELECTOR) !== null;
}

export function shouldFlipDockSide(
  currentSide: HelpDockSide,
  nextSide: HelpDockSide,
  avoidSelectors: string[],
  minClearancePx: number,
): boolean {
  if (currentSide === nextSide) return false;
  if (!avoidSelectors.length) return true;

  const clearances = measureDockClearances({ avoidSelectors });
  const currentFits = clearances[currentSide] >= minClearancePx;
  const nextFits = clearances[nextSide] >= minClearancePx;

  if (!currentFits && nextFits) return true;
  if (currentFits && !nextFits) return true;

  return clearances[nextSide] >= clearances[currentSide] + DOCK_SIDE_FLIP_HYSTERESIS_PX;
}

export interface DockLayoutObserverOptions {
  onUpdate: () => void;
  avoidSelectors?: string[];
  debounceMs?: number;
  /** When true, skips the initial debounced pass (caller already measured synchronously). */
  skipInitialSchedule?: boolean;
}

/** Debounced resize/mutation subscription for dock layout (ignores TrustDev self-mutations). */
export function subscribeDockLayoutUpdates({
  onUpdate,
  avoidSelectors = [],
  debounceMs = 120,
  skipInitialSchedule = false,
}: DockLayoutObserverOptions): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let debounceTimer: number | null = null;
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    onUpdate();
  };

  const schedule = () => {
    if (rafId != null) return;
    rafId = window.requestAnimationFrame(() => {
      if (debounceTimer != null) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(flush, debounceMs);
    });
  };

  if (!skipInitialSchedule) {
    schedule();
  }

  window.addEventListener('resize', schedule);

  let resizeObserver: ResizeObserver | null = null;
  if (avoidSelectors.length > 0 && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(schedule);
    for (const selector of avoidSelectors) {
      if (!selector.trim()) continue;
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!element.closest(TRUSTDEV_MUTATION_ROOT_SELECTOR)) {
            resizeObserver?.observe(element);
          }
        });
      } catch {
        // Ignore invalid selectors from host apps.
      }
    }
  }

  const mutationObserver = new MutationObserver((records) => {
    const hasHostMutation = records.some((record) => !isTrustDevDockMutationTarget(record.target));
    if (hasHostMutation) schedule();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
  });

  return () => {
    window.removeEventListener('resize', schedule);
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    if (rafId != null) window.cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
  };
}
